import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createComment, listComments } from "../../api/comments";
import { Avatar } from "../Avatar";
import { ConfirmModal } from "../ConfirmModal";
import { ArchiveIcon, TrashIcon } from "../icons";
import { PriorityPill } from "../Pills";
import { kanbanColumns, statusMeta } from "../../theme/tokens";
import { dueLabel, formatDateTime } from "../../utils/format";
import type { Task, TaskStatus } from "../../types";

interface TaskDetailModalProps {
  task: Task;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  deleting?: boolean;
}

export function TaskDetailModal({
  task,
  isAdmin,
  onClose,
  onEdit,
  onStatusChange,
  onArchive,
  onUnarchive,
  onDelete,
  deleting,
}: TaskDetailModalProps) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const commentsQuery = useQuery({
    queryKey: ["comments", task.id],
    queryFn: () => listComments(task.id),
  });

  const addComment = useMutation({
    mutationFn: (content: string) => createComment(task.id, content),
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["comments", task.id] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div className="modal-title" style={{ lineHeight: 1.3 }}>
            {task.title}
            {task.is_archived && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  background: "var(--bg-muted, #EEF1F6)",
                  borderRadius: 6,
                  padding: "2px 7px",
                  verticalAlign: "middle",
                }}
              >
                Archivada
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button className="btn btn-secondary" style={{ padding: "7px 13px" }} onClick={onEdit}>
              Editar
            </button>
            {isAdmin && task.status === "done" && !task.is_archived && (
              <button
                title="Archivar tarea"
                onClick={onArchive}
                style={{
                  border: "1.5px solid var(--border)",
                  background: "#fff",
                  color: "var(--text-muted)",
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <ArchiveIcon size={14} />
              </button>
            )}
            {isAdmin && task.is_archived && (
              <button
                title="Desarchivar tarea"
                onClick={onUnarchive}
                style={{
                  border: "1.5px solid var(--border)",
                  background: "#fff",
                  color: "var(--text-muted)",
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <ArchiveIcon size={14} />
              </button>
            )}
            {isAdmin && (
              <button
                title="Eliminar tarea"
                onClick={() => setShowDelete(true)}
                style={{
                  border: "1.5px solid var(--border)",
                  background: "#fff",
                  color: "var(--danger)",
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <TrashIcon size={14} />
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.55 }}>
          {task.description || "Sin descripción."}
        </div>

        <div style={{ display: "flex", gap: 22, marginTop: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-placeholder)", marginBottom: 6 }}>
              CREADO POR
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar id={task.created_by.id} name={task.created_by.name} size={24} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{task.created_by.name}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-placeholder)", marginBottom: 6 }}>
              ASIGNADO A
            </div>
            {task.assignee ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar id={task.assignee.id} name={task.assignee.name} size={24} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{task.assignee.name}</span>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Sin asignar</span>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-placeholder)", marginBottom: 6 }}>
              PRIORIDAD
            </div>
            <PriorityPill priority={task.priority} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-placeholder)", marginBottom: 6 }}>
              FECHA LÍMITE
            </div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{dueLabel(task.due_date)}</span>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-placeholder)", marginBottom: 8 }}>
            ESTADO
          </div>
          <div className="option-row">
            {kanbanColumns.map((s) => {
              const meta = statusMeta[s];
              const selected = task.status === s;
              return (
                <button
                  key={s}
                  className="option-pill"
                  onClick={() => onStatusChange(s)}
                  style={{
                    background: selected ? meta.bg : "#fff",
                    color: meta.color,
                    borderColor: selected ? meta.color : "var(--border)",
                  }}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 14 }}>Comentarios</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
            {commentsQuery.data?.map((c) => (
              <div key={c.id} className="comment-row">
                <Avatar id={c.user?.id ?? 0} name={c.user?.name ?? "?"} size={26} />
                <div className="comment-bubble">
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {c.user?.name ?? "Usuario eliminado"}{" "}
                    <span style={{ fontWeight: 500, color: "var(--text-placeholder)", fontSize: 11 }}>
                      · {formatDateTime(c.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#2A3446", marginTop: 3, lineHeight: 1.5 }}>{c.content}</div>
                </div>
              </div>
            ))}
            {commentsQuery.data?.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Sin comentarios todavía.</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escribe un comentario…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newComment.trim()) addComment.mutate(newComment);
              }}
            />
            <button
              className="btn btn-primary"
              disabled={!newComment.trim() || addComment.isPending}
              onClick={() => addComment.mutate(newComment)}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      {showDelete && (
        <ConfirmModal
          title="Eliminar tarea"
          message={`¿Seguro que quieres eliminar "${task.title}"? Esta acción no se puede deshacer.`}
          submitting={deleting}
          onClose={() => setShowDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}
