import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { archiveTask, createTask, deleteTask, listTasks, unarchiveTask, updateTask } from "../../api/tasks";
import { useAuth } from "../../auth/useAuth";
import { Avatar } from "../../components/Avatar";
import { ErrorState, LoadingState } from "../../components/Feedback";
import { PriorityPill } from "../../components/Pills";
import { ArchiveIcon } from "../../components/icons";
import { TaskCard } from "../../components/tasks/TaskCard";
import { TaskDetailModal } from "../../components/tasks/TaskDetailModal";
import { TaskFormModal } from "../../components/tasks/TaskFormModal";
import { useDebounce } from "../../hooks/useDebounce";
import { formatDateTime } from "../../utils/format";
import { kanbanColumns, priorityMeta, statusMeta } from "../../theme/tokens";
import type { Task, TaskPriority, TaskStatus, TaskWrite } from "../../types";
import type { ProjectTabContext } from "./ProjectDetailPage";

type ModalState =
  | { type: "form"; task?: Task; defaultStatus?: TaskStatus }
  | { type: "detail"; task: Task }
  | null;

export function TasksTab() {
  const { project } = useOutletContext<ProjectTabContext>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = project.members.some((m) => m.user.id === user?.id && m.role === "admin");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [assigneeFilter, setAssigneeFilter] = useState<number | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [dueBefore, setDueBefore] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const tasksQuery = useQuery({
    queryKey: [
      "tasks", project.id, debouncedSearch, assigneeFilter, priorityFilter, dueBefore, showArchived,
    ],
    queryFn: () =>
      listTasks({
        project: project.id,
        search: debouncedSearch || undefined,
        assignee: assigneeFilter === "all" ? undefined : assigneeFilter,
        priority: priorityFilter === "all" ? undefined : priorityFilter,
        due_date__lte: dueBefore || undefined,
        is_archived: showArchived ? true : undefined,
      }),
  });

  function invalidateAfterMutation() {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload: TaskWrite) => createTask(payload),
    onSuccess: () => {
      invalidateAfterMutation();
      setModal(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<TaskWrite> }) =>
      updateTask(id, payload),
    onSuccess: (updated) => {
      invalidateAfterMutation();
      setModal((current) =>
        current?.type === "detail" ? { type: "detail", task: updated } : null,
      );
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archiveTask(id),
    onSuccess: () => {
      invalidateAfterMutation();
      setModal(null);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: number) => unarchiveTask(id),
    onSuccess: (updated) => {
      invalidateAfterMutation();
      setModal((current) =>
        current?.type === "detail" ? { type: "detail", task: updated } : null,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: () => {
      invalidateAfterMutation();
      setModal(null);
    },
  });

  const columns = useMemo(() => {
    const tasks = tasksQuery.data ?? [];
    return kanbanColumns.map((status) => ({
      status,
      tasks: tasks.filter((t) => t.status === status),
    }));
  }, [tasksQuery.data]);

  function handleDropOnColumn(status: TaskStatus) {
    if (draggedTaskId != null) {
      const task = tasksQuery.data?.find((t) => t.id === draggedTaskId);
      if (task && task.status !== status) {
        updateMutation.mutate({ id: draggedTaskId, payload: { status } });
      }
    }
    setDraggedTaskId(null);
    setDragOverStatus(null);
  }

  if (tasksQuery.isLoading) return <LoadingState />;
  if (tasksQuery.isError) return <ErrorState />;

  return (
    <>
      <div className="tasks-toolbar">
        <input
          className="input"
          style={{ width: 190 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tareas…"
        />
        <select
          className="filter-select"
          value={assigneeFilter}
          onChange={(e) =>
            setAssigneeFilter(e.target.value === "all" ? "all" : Number(e.target.value))
          }
        >
          <option value="all">Todos los asignados</option>
          {project.members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "all")}
        >
          <option value="all">Toda prioridad</option>
          {(Object.keys(priorityMeta) as TaskPriority[]).map((p) => (
            <option key={p} value={p}>
              {priorityMeta[p].label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="filter-select"
          style={{ maxWidth: 150 }}
          value={dueBefore}
          onChange={(e) => setDueBefore(e.target.value)}
          title="Vence antes de"
        />
        <button
          className={showArchived ? "btn btn-primary" : "btn btn-secondary"}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}
          onClick={() => setShowArchived((v) => !v)}
        >
          <ArchiveIcon size={13} />
          {showArchived ? "Ver tablero" : "Ver archivadas"}
        </button>
        {!showArchived && (
          <button className="btn btn-primary" onClick={() => setModal({ type: "form" })}>
            + Nueva tarea
          </button>
        )}
      </div>

      {showArchived ? (
        <div className="archived-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-muted)",
              marginBottom: 4,
            }}
          >
            <ArchiveIcon size={14} />
            Estás viendo las tareas archivadas de este proyecto
          </div>
          {tasksQuery.data?.length === 0 && (
            <div style={{ fontSize: 13.5, color: "var(--text-muted)", padding: "12px 0" }}>
              No hay tareas archivadas.
            </div>
          )}
          {tasksQuery.data?.map((task) => (
            <div
              key={task.id}
              className="task-card"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
              onClick={() => setModal({ type: "detail", task })}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{task.title}</div>
                <PriorityPill priority={task.priority} />
                {task.assignee && <Avatar id={task.assignee.id} name={task.assignee.name} size={22} />}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {task.completed_at ? `Terminada ${formatDateTime(task.completed_at)}` : ""}
                </span>
                {isAdmin && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "5px 11px", fontSize: 12.5 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      unarchiveMutation.mutate(task.id);
                    }}
                  >
                    Desarchivar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="kanban-board">
        {columns.map((col) => {
          const meta = statusMeta[col.status];
          return (
            <div key={col.status} className="kanban-column">
              <div className="kanban-column-bar" style={{ background: meta.color }} />
              <div
                className="kanban-column-body"
                style={{
                  background: meta.bg,
                  outline: dragOverStatus === col.status ? `2px dashed ${meta.color}` : "none",
                  outlineOffset: -4,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverStatus !== col.status) setDragOverStatus(col.status);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnColumn(col.status);
                }}
              >
                <div className="kanban-column-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="dot" style={{ background: meta.color }} />
                    <span style={{ fontWeight: 800, fontSize: 13.5 }}>{meta.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>
                    {col.tasks.length}
                  </span>
                </div>
                <div className="kanban-tasks">
                  {col.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => setModal({ type: "detail", task })}
                      dragging={draggedTaskId === task.id}
                      onDragStart={(e) => {
                        setDraggedTaskId(task.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(task.id));
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDragOverStatus(null);
                      }}
                    />
                  ))}
                </div>
                <button
                  style={{
                    border: "1.5px dashed #C7D3E8",
                    background: "none",
                    borderRadius: 9,
                    padding: 8,
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                  onClick={() => setModal({ type: "form", defaultStatus: col.status })}
                >
                  + Añadir tarea
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {modal?.type === "form" && (
        <TaskFormModal
          project={project}
          initialTask={modal.task}
          defaultStatus={modal.defaultStatus}
          onClose={() => setModal(null)}
          submitting={createMutation.isPending || updateMutation.isPending}
          error={createMutation.isError || updateMutation.isError}
          onSubmit={(payload) => {
            if (modal.task) {
              updateMutation.mutate({ id: modal.task.id, payload });
            } else {
              createMutation.mutate(payload);
            }
          }}
        />
      )}

      {modal?.type === "detail" && (
        <TaskDetailModal
          task={modal.task}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ type: "form", task: modal.task })}
          onStatusChange={(status) =>
            updateMutation.mutate({ id: modal.task.id, payload: { status } })
          }
          onArchive={() => archiveMutation.mutate(modal.task.id)}
          onUnarchive={() => unarchiveMutation.mutate(modal.task.id)}
          onDelete={() => deleteMutation.mutate(modal.task.id)}
          deleting={deleteMutation.isPending}
        />
      )}
    </>
  );
}
