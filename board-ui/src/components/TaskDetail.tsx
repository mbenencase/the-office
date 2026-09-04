import { useEffect, useState } from "react";
import type { Task } from "../types";
import { MarkdownView } from "./MarkdownView";

type Props = {
  task: Task | null;
  onClose: () => void;
  onSave: (fields: {
    title: string;
    dod: string;
    body: string;
    tier: string;
  }) => Promise<void>;
  onTransition: (
    action: "claim" | "review" | "done" | "block",
    reason?: string,
  ) => Promise<void>;
};

export function TaskDetail({ task, onClose, onSave, onTransition }: Props) {
  const [title, setTitle] = useState("");
  const [dod, setDod] = useState("");
  const [body, setBody] = useState("");
  const [tier, setTier] = useState("standard");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [saving, setSaving] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [showBlock, setShowBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title ?? "");
    setDod(task.dod ?? "");
    setBody(task.body);
    setTier(task.tier ?? "standard");
    setMode("preview");
    setShowBlock(false);
    setBlockReason("");
    setError(null);
  }, [task]);

  if (!task) {
    return (
      <aside className="detail detail--empty">
        <p>Select a task to view its markdown and edit fields.</p>
      </aside>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ title, dod, body, tier });
      setMode("preview");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function run(action: "claim" | "review" | "done" | "block", reason?: string) {
    setError(null);
    try {
      await onTransition(action, reason);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <aside className="detail">
      <header className="detail__head">
        <div>
          <p className="detail__id">{task.id}</p>
          <h2>{task.title || "(untitled)"}</h2>
        </div>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close">
          Close
        </button>
      </header>

      <div className="detail__actions">
        <button type="button" onClick={() => run("claim")} disabled={!["pending", "blocked"].includes(task.status)}>
          Claim
        </button>
        <button type="button" onClick={() => run("review")} disabled={task.status !== "in-progress"}>
          Review
        </button>
        <button type="button" onClick={() => run("done")} disabled={!["review", "in-progress"].includes(task.status)}>
          Done
        </button>
        <button type="button" className="danger" onClick={() => setShowBlock((v) => !v)}>
          Block
        </button>
      </div>

      {showBlock ? (
        <div className="detail__block">
          <input
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            placeholder="Reason (required)"
          />
          <button
            type="button"
            className="danger"
            disabled={!blockReason.trim()}
            onClick={() => run("block", blockReason.trim())}
          >
            Confirm block
          </button>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="detail__tabs">
        <button
          type="button"
          className={mode === "preview" ? "active" : ""}
          onClick={() => setMode("preview")}
        >
          Preview
        </button>
        <button
          type="button"
          className={mode === "edit" ? "active" : ""}
          onClick={() => setMode("edit")}
        >
          Edit
        </button>
      </div>

      {mode === "preview" ? (
        <div className="detail__scroll">
          <dl className="meta">
            <div>
              <dt>Status</dt>
              <dd>{task.status}</dd>
            </div>
            <div>
              <dt>Tier</dt>
              <dd>{task.tier ?? "—"}</dd>
            </div>
            <div>
              <dt>Depends on</dt>
              <dd>{task.dependsOn.length ? task.dependsOn.join(", ") : "—"}</dd>
            </div>
            <div>
              <dt>Checks</dt>
              <dd>
                {task.checks.length ? (
                  <ul>
                    {task.checks.map((c) => (
                      <li key={c}>
                        <code>{c}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          {task.dod ? (
            <section>
              <h3>Definition of done</h3>
              <MarkdownView source={task.dod} />
            </section>
          ) : null}
          <section>
            <h3>Body</h3>
            <MarkdownView source={task.body} />
          </section>
        </div>
      ) : (
        <div className="detail__scroll detail__edit">
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Tier
            <select value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="fast">fast</option>
              <option value="standard">standard</option>
              <option value="deep">deep</option>
            </select>
          </label>
          <label>
            Definition of done
            <textarea value={dod} onChange={(e) => setDod(e.target.value)} rows={3} />
          </label>
          <label>
            Markdown body
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} />
          </label>
          <div className="detail__save">
            <button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
