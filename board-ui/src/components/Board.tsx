import { useMemo, useState } from "react";
import type { BoardState, Status, Task } from "../types";
import { COLUMNS, actionForMove } from "../types";
import { Column } from "./Column";
import { TaskDetail } from "./TaskDetail";
import { transitionTask, updateTaskContent } from "../api";

type Props = {
  board: BoardState;
  onBoardChange: (board: BoardState) => void;
  featureFilter: string;
};

export function Board({ board, onBoardChange, featureFilter }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tasks = useMemo(() => {
    if (!featureFilter || featureFilter === "all") return board.tasks;
    return board.tasks.filter((t) => t.feature === featureFilter);
  }, [board.tasks, featureFilter]);

  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  async function handleDrop(to: Status) {
    if (!dragging) return;
    const action = actionForMove(dragging.status, to);
    setDragging(null);
    if (!action) {
      if (dragging.status !== to) {
        setError(
          `Illegal move: ${dragging.status} → ${to}. Use Claim / Review / Done / Block.`,
        );
      }
      return;
    }
    if (action === "block") {
      const reason = window.prompt("Block reason (required):");
      if (!reason?.trim()) return;
      try {
        const next = await transitionTask(board.root, dragging.id, "block", reason.trim());
        onBoardChange(next);
        setError(null);
      } catch (e) {
        setError(String(e));
      }
      return;
    }
    try {
      const next = await transitionTask(board.root, dragging.id, action);
      onBoardChange(next);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="board-layout">
      <div className="board">
        {error ? <p className="error banner">{error}</p> : null}
        <div className="board__columns">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              status={col.id}
              label={col.label}
              tasks={tasks
                .filter((t) => t.status === col.id)
                .sort((a, b) => (a.taskNo ?? 0) - (b.taskNo ?? 0))}
              selectedId={selectedId}
              onSelect={(t) => setSelectedId(t.id)}
              onDragStart={setDragging}
              onDropTask={handleDrop}
            />
          ))}
        </div>
      </div>
      <TaskDetail
        task={selected}
        onClose={() => setSelectedId(null)}
        onSave={async (fields) => {
          if (!selected) return;
          const next = await updateTaskContent({
            path: selected.path,
            title: fields.title,
            dod: fields.dod,
            body: fields.body,
            tier: fields.tier,
          });
          onBoardChange(next);
        }}
        onTransition={async (action, reason) => {
          if (!selected) return;
          const next = await transitionTask(board.root, selected.id, action, reason);
          onBoardChange(next);
        }}
      />
    </div>
  );
}
