const indentOf = (l: string) => l.match(/^ */)![0].length;

function stripComment(s: string) {
  let q: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i);
  }
  return s;
}

function scalar(s: string): unknown {
  s = s.trim();
  if (s === "") return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function splitInline(s: string) {
  const out: string[] = [];
  let buf = "";
  let q: '"' | "'" | null = null;
  for (const c of s) {
    if (q) {
      buf += c;
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      buf += c;
      continue;
    }
    if (c === ",") {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function parseList(lines: string[], i: number, indent: number): [unknown[], number] {
  const out: unknown[] = [];
  while (i < lines.length) {
    const raw = lines[i]!;
    if (!raw.trim() || /^\s*#/.test(raw)) {
      i++;
      continue;
    }
    if (indentOf(raw) < indent) break;
    const m = /^\s*-\s*(.*)$/.exec(raw);
    if (!m) break;
    out.push(scalar(stripComment(m[1]!)));
    i++;
  }
  return [out, i];
}

function parseMap(lines: string[], i: number, indent: number): [Record<string, unknown>, number] {
  const out: Record<string, unknown> = {};
  while (i < lines.length) {
    const raw = lines[i]!;
    if (!raw.trim() || /^\s*#/.test(raw)) {
      i++;
      continue;
    }
    const ind = indentOf(raw);
    if (ind < indent) break;
    if (ind > indent) {
      i++;
      continue;
    }

    const m = /^\s*([A-Za-z_][\w.-]*):\s*(.*)$/.exec(raw);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1]!;
    const rest = stripComment(m[2]!).trim();

    if (rest === "|" || rest === "|-" || rest === ">" || rest === ">-") {
      const buf: string[] = [];
      const bi = indent + 2;
      i++;
      while (i < lines.length && (lines[i]!.trim() === "" || indentOf(lines[i]!) >= bi)) {
        buf.push(lines[i]!.slice(bi));
        i++;
      }
      while (buf.length && buf[buf.length - 1]!.trim() === "") buf.pop();
      out[key] = buf.join("\n");
      continue;
    }

    if (rest === "") {
      let j = i + 1;
      while (j < lines.length && (!lines[j]!.trim() || /^\s*#/.test(lines[j]!))) j++;
      if (j < lines.length && indentOf(lines[j]!) > indent) {
        if (/^\s*-/.test(lines[j]!)) {
          const [list, ni] = parseList(lines, j, indentOf(lines[j]!));
          out[key] = list;
          i = ni;
          continue;
        }
        const [map, ni] = parseMap(lines, j, indentOf(lines[j]!));
        out[key] = map;
        i = ni;
        continue;
      }
      out[key] = [];
      i++;
      continue;
    }

    if (rest.startsWith("[")) {
      const inner = rest.slice(1, rest.lastIndexOf("]"));
      out[key] = inner.trim() === "" ? [] : splitInline(inner).map(scalar);
      i++;
      continue;
    }

    out[key] = scalar(rest);
    i++;
  }
  return [out, i];
}

export function parseYaml(lines: string[]): Record<string, unknown> {
  return parseMap(lines, 0, 0)[0];
}

export function splitFrontmatter(text: string) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      return {
        fmLines: lines.slice(1, i),
        bodyLines: lines.slice(i + 1),
        endIndex: i,
      };
    }
  }
  return null;
}

export function emitScalar(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const s = String(value);
  if (s === "") return '""';
  if (/[:#[\]{}"'\n]|^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

export function setScalar(text: string, key: string, value: string): string {
  const lines = text.split("\n");
  const fm = splitFrontmatter(text);
  if (!fm) throw new Error("no frontmatter to update");
  const re = new RegExp(`^${key}:`);
  const rendered = `${key}: ${value}`;
  for (let i = 1; i < fm.endIndex; i++) {
    if (re.test(lines[i]!)) {
      lines[i] = rendered;
      return lines.join("\n");
    }
  }
  lines.splice(fm.endIndex, 0, rendered);
  return lines.join("\n");
}

export function appendNote(text: string, line: string): string {
  let t = text;
  if (!/^##\s+Notes\s*$/im.test(t)) t = `${t.trimEnd()}\n\n## Notes\n`;
  return `${t.trimEnd()}\n- ${line}\n`;
}

export function replaceBody(text: string, body: string): string {
  const fm = splitFrontmatter(text);
  if (!fm) throw new Error("no frontmatter");
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  return `---\n${fm.fmLines.join("\n")}\n---\n${normalized}`;
}

export function replaceDodBlock(text: string, newBlock: string): string {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") throw new Error("no frontmatter");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.startsWith("dod:")) {
      for (const bl of newBlock.split("\n")) out.push(bl);
      i++;
      while (i < lines.length) {
        const l = lines[i]!;
        if (l.trim() === "---") break;
        if (
          l !== "" &&
          !l.startsWith(" ") &&
          !l.startsWith("\t") &&
          l.includes(":")
        ) {
          break;
        }
        i++;
      }
      continue;
    }
    out.push(lines[i]!);
    i++;
  }
  let s = out.join("\n");
  if (text.endsWith("\n") && !s.endsWith("\n")) s += "\n";
  return s;
}

export function yamlOptString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function yamlStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}
