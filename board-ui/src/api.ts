import type { BoardState, Task } from "./types";

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(
      `"${cmd}" requires the Tauri runtime. Run \`npm run tauri dev\` instead of \`npm run dev\` to use the native backend.`,
    );
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) {
    const path = window.prompt(
      "Enter the absolute path to a repo with .the-office/\n\n" +
        "(Native folder picker is only available via `npm run tauri dev`)",
    );
    return path || null;
  }
  return invoke<string | null>("pick_folder");
}

export async function openBoard(path: string): Promise<BoardState> {
  return invoke<BoardState>("open_board", { path });
}

export async function reloadBoard(root: string): Promise<BoardState> {
  return invoke<BoardState>("reload_board", { root });
}

export async function transitionTask(
  root: string,
  id: string,
  action: "claim" | "review" | "done" | "block",
  reason?: string,
): Promise<BoardState> {
  return invoke<BoardState>("transition_task", {
    input: { root, id, action, reason: reason ?? null },
  });
}

export async function updateTaskContent(input: {
  path: string;
  title?: string | null;
  dod?: string | null;
  body: string;
  tier?: string | null;
}): Promise<BoardState> {
  return invoke<BoardState>("update_task_content", { input });
}

export async function saveTaskRaw(
  path: string,
  raw: string,
): Promise<Task> {
  return invoke<Task>("save_task", { input: { path, raw } });
}
