import type { Task } from "../types";

type Props = {
  task: Task;
  selected: boolean;
  onSelect: (task: Task) => void;
  onDragStart: (task: Task) => void;
};

export function TaskCard({ task, selected, onSelect, onDragStart }: Props) {
  return (
    <article
      className={`card${selected ? " card--selected" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task);
      }}
      onClick={() => onSelect(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(task);
        }
      }}
    >
      <header className="card__head">
        <span className="card__id">{task.id}</span>
        {task.tier ? <span className={`tier tier--${task.tier}`}>{task.tier}</span> : null}
      </header>
      <h3 className="card__title">{task.title || "(untitled)"}</h3>
      {task.dependsOn.length > 0 ? (
        <p className="card__deps">depends: {task.dependsOn.join(", ")}</p>
      ) : null}
      {task.attempts != null && task.maxAttempts != null ? (
        <p className="card__meta">
          attempt {task.attempts}/{task.maxAttempts}
        </p>
      ) : null}
    </article>
  );
}
