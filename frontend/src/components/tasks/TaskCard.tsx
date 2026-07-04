import { Avatar } from "../Avatar";
import { PriorityPill } from "../Pills";
import { dueLabel, isOverdue } from "../../utils/format";
import type { Task } from "../../types";

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  dragging?: boolean;
}

export function TaskCard({ task, onClick, onDragStart, onDragEnd, dragging }: TaskCardProps) {
  return (
    <div
      className="task-card"
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ opacity: dragging ? 0.4 : 1, cursor: dragging ? "grabbing" : "pointer" }}
    >
      <div className="task-card-title">{task.title}</div>
      <div className="task-card-row">
        <PriorityPill priority={task.priority} />
        {task.assignee && <Avatar id={task.assignee.id} name={task.assignee.name} size={22} />}
      </div>
      {task.due_date && (
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: isOverdue(task.due_date) && task.status !== "done" ? "var(--danger)" : "var(--text-muted)",
          }}
        >
          {dueLabel(task.due_date)}
        </div>
      )}
    </div>
  );
}
