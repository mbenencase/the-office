import {
  loadBrowserBoard,
  openBrowserWorkspace,
  saveBrowserTaskRaw,
  transitionBrowserTask,
  updateBrowserTaskContent,
} from "./browser/boardFs";
import type { BoardState, Task } from "./types";

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

/** Pick a folder and load the board. Works in Tauri and in the browser. */
export async function openWorkspace(): Promise<BoardState | null> {
  if (isTauri()) {
    const path = await invoke<string | null>("pick_folder");
    if (!path) return null;
    return invoke<BoardState>("open_board", { path });
  }
  return openBrowserWorkspace();
}

export async function pickFolder(): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>("pick_folder");
  }
  const board = await openBrowserWorkspace();
  return board.root;
}

export async function openBoard(path: string): Promise<BoardState> {
  if (isTauri()) {
    return invoke<BoardState>("open_board", { path });
  }
  void path;
  return loadBrowserBoard();
}

export async function reloadBoard(root: string): Promise<BoardState> {
  if (isTauri()) {
    return invoke<BoardState>("reload_board", { root });
  }
  void root;
  return loadBrowserBoard();
}

export async function transitionTask(
  root: string,
  id: string,
  action: "claim" | "review" | "done" | "block",
  reason?: string,
): Promise<BoardState> {
  if (isTauri()) {
    return invoke<BoardState>("transition_task", {
      input: { root, id, action, reason: reason ?? null },
    });
  }
  return transitionBrowserTask(root, id, action, reason);
}

export async function updateTaskContent(input: {
  path: string;
  title?: string | null;
  dod?: string | null;
  body: string;
  tier?: string | null;
}): Promise<BoardState> {
  if (isTauri()) {
    return invoke<BoardState>("update_task_content", { input });
  }
  return updateBrowserTaskContent(input);
}

export async function saveTaskRaw(path: string, raw: string): Promise<Task> {
  if (isTauri()) {
    return invoke<Task>("save_task", { input: { path, raw } });
  }
  return saveBrowserTaskRaw(path, raw);
}
