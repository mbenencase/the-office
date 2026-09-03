import { invoke } from "@tauri-apps/api/core";
import type { BoardState, Task } from "./types";

export async function pickFolder(): Promise<string | null> {
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
