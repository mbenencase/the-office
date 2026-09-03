import type { Status, Task } from "../types";
import { TaskCard } from "./TaskCard";

type Props = {
  status: Status;
  label: string;
  tasks: Task[];
  selectedId: string | null;
  onSelect: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDropTask: (status: Status) => void;
};

export function Column({
  status,
  label,
  tasks,
  selectedId,
  onSelect,
  onDragStart,
  onDropTask,
}: Props) {
  return (
    <section
      className={`column column--${status}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropTask(status);
      }}
    >
      <header className="column__head">
        <h2>{label}</h2>
        <span className="column__count">{tasks.length}</span>
      </header>
      <div className="column__list">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            selected={selectedId === t.id}
            onSelect={onSelect}
            onDragStart={onDragStart}
          />
        ))}
        {tasks.length === 0 ? (
          <p className="column__empty">Drop a task here</p>
        ) : null}
      </div>
    </section>
  );
}
