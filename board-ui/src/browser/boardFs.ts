import type { BoardState, Status, Task } from "../types";
import {
  emitScalar,
  parseYaml,
  replaceBody,
  replaceDodBlock,
  setScalar,
  splitFrontmatter,
  yamlOptString,
  yamlStringList,
} from "../core/taskMarkdown";

let rootHandle: FileSystemDirectoryHandle | null = null;
let rootLabel = "";

export function browserRootLabel(): string {
  return rootLabel;
}

async function resolveFile(
  root: FileSystemDirectoryHandle,
  relative: string,
): Promise<FileSystemFileHandle> {
  const parts = relative.split("/").filter(Boolean);
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!);
  }
  return dir.getFileHandle(parts[parts.length - 1]!);
}

async function readTextFile(root: FileSystemDirectoryHandle, relative: string): Promise<string> {
  const file = await resolveFile(root, relative);
  return (await file.getFile()).text();
}

async function writeTextFile(
  root: FileSystemDirectoryHandle,
  relative: string,
  content: string,
): Promise<void> {
  const file = await resolveFile(root, relative);
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

function parseTask(feature: string, fileName: string, relativePath: string, text: string): Task {
  const stem = fileName.replace(/\.md$/, "");
  const expectedId = `${feature}/${stem}`;
  const fm = splitFrontmatter(text);
  if (!fm) {
    return {
      id: expectedId,
      feature,
      path: relativePath,
      taskNo: null,
      title: "(broken: missing frontmatter)",
      dependsOn: [],
      status: "blocked",
      tier: null,
      scope: [],
      checks: [],
      sensorsAdded: [],
      dod: null,
      attempts: null,
      maxAttempts: null,
      branch: null,
      commit: null,
      body: "",
      raw: text,
    };
  }
  const data = parseYaml(fm.fmLines);
  return {
    id: (yamlOptString(data.id) ?? expectedId) as string,
    feature,
    path: relativePath,
    taskNo: typeof data.task_no === "number" ? data.task_no : null,
    title: yamlOptString(data.title),
    dependsOn: yamlStringList(data.depends_on),
    status: (yamlOptString(data.status) ?? "pending") as Status,
    tier: yamlOptString(data.tier),
    scope: yamlStringList(data.scope),
    checks: yamlStringList(data.checks),
    sensorsAdded: yamlStringList(data.sensors_added),
    dod: yamlOptString(data.dod),
    attempts: typeof data.attempts === "number" ? data.attempts : null,
    maxAttempts: typeof data.max_attempts === "number" ? data.max_attempts : null,
    branch: yamlOptString(data.branch),
    commit: yamlOptString(data.commit),
    body: fm.bodyLines.join("\n"),
    raw: text,
  };
}

export async function loadBrowserBoard(): Promise<BoardState> {
  if (!rootHandle) throw new Error("No folder open.");
  const root = rootHandle;
  const tasks: Task[] = [];
  let featuresDir: FileSystemDirectoryHandle;
  try {
    const office = await root.getDirectoryHandle(".the-office");
    featuresDir = await office.getDirectoryHandle("features");
  } catch {
    throw new Error("No .the-office/features/ found in the selected folder.");
  }

  const featureNames: string[] = [];
  for await (const entry of featuresDir.values()) {
    if (entry.kind === "directory") featureNames.push(entry.name);
  }
  featureNames.sort();

  for (const feature of featureNames) {
    const dir = await featuresDir.getDirectoryHandle(feature);
    const files: string[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === "file" && /^task-.*\.md$/.test(entry.name)) {
        files.push(entry.name);
      }
    }
    files.sort();
    for (const file of files) {
      const relativePath = `.the-office/features/${feature}/${file}`;
      const text = await readTextFile(root, relativePath);
      tasks.push(parseTask(feature, file, relativePath, text));
    }
  }

  return { root: rootLabel, tasks };
}

export async function openBrowserWorkspace(): Promise<BoardState> {
  if (!("showDirectoryPicker" in window)) {
    throw new Error(
      "This browser cannot open local folders. Use Chrome or Edge, or run `npm run tauri dev`.",
    );
  }
  const picked = await window.showDirectoryPicker({ mode: "readwrite" });
  try {
    await picked.getDirectoryHandle(".the-office");
  } catch {
    throw new Error(
      "Selected folder has no .the-office/ directory. Pick the repository root.",
    );
  }
  rootHandle = picked;
  rootLabel = picked.name;
  return loadBrowserBoard();
}

function requireRoot(): FileSystemDirectoryHandle {
  if (!rootHandle) throw new Error("No folder open.");
  return rootHandle;
}

export async function transitionBrowserTask(
  _root: string,
  _id: string,
  _action: "claim" | "review" | "done" | "block",
  _reason?: string,
): Promise<BoardState> {
  throw new Error("Status changes require Git verification. Use the desktop app with the updated office CLI, or run the CLI in this repository, then reload the board.");
}

export async function updateBrowserTaskContent(input: {
  path: string;
  title?: string | null;
  dod?: string | null;
  body: string;
  tier?: string | null;
}): Promise<BoardState> {
  const root = requireRoot();
  let text = await readTextFile(root, input.path);
  if (input.title != null) text = setScalar(text, "title", emitScalar(input.title));
  if (input.tier != null) text = setScalar(text, "tier", emitScalar(input.tier));
  if (input.dod != null) {
    if (input.dod.includes("\n")) {
      const indented = input.dod
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n");
      text = replaceDodBlock(text, `dod: |\n${indented}`);
    } else {
      text = setScalar(text, "dod", emitScalar(input.dod));
    }
  }
  text = replaceBody(text, input.body);
  await writeTextFile(root, input.path, text);
  return loadBrowserBoard();
}

export async function saveBrowserTaskRaw(path: string, raw: string): Promise<Task> {
  const root = requireRoot();
  const previous = await readTextFile(root, path);
  const beforeFm = splitFrontmatter(previous);
  const afterFm = splitFrontmatter(raw);
  if (!beforeFm || !afterFm) throw new Error("Task frontmatter is required.");
  const before = parseYaml(beforeFm.fmLines);
  const after = parseYaml(afterFm.fmLines);
  for (const key of ["id", "status", "attempts", "base_commit", "branch", "commit"]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      throw new Error(`${key} is managed by the office CLI.`);
    }
  }
  await writeTextFile(root, path, raw);
  const board = await loadBrowserBoard();
  const task = board.tasks.find((t) => t.path === path);
  if (!task) throw new Error("saved task but failed to reload it");
  return task;
}
