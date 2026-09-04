export type Task = {
  id: string;
  feature: string;
  path: string;
  taskNo: number | null;
  title: string | null;
  dependsOn: string[];
  status: Status;
  tier: string | null;
  scope: string[];
  checks: string[];
  sensorsAdded: string[];
  dod: string | null;
  attempts: number | null;
  maxAttempts: number | null;
  branch: string | null;
  commit: string | null;
  body: string;
  raw: string;
};

export type Status =
  | "pending"
  | "in-progress"
  | "review"
  | "blocked"
  | "completed";

export type BoardState = {
  root: string;
  tasks: Task[];
};

export const COLUMNS: { id: Status; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "in-progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "blocked", label: "Blocked" },
  { id: "completed", label: "Completed" },
];

/** Map a column drop onto the CLI transition that produces that status. */
export function actionForMove(
  from: Status,
  to: Status,
): "claim" | "review" | "done" | "block" | null {
  if (from === to) return null;
  if (to === "blocked") return "block";
  if (to === "in-progress" && (from === "pending" || from === "blocked"))
    return "claim";
  if (to === "review" && from === "in-progress") return "review";
  if (to === "completed" && (from === "review" || from === "in-progress"))
    return "done";
  return null;
}
