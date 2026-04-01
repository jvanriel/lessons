"use client";

import { useState, useActionState, useTransition } from "react";
import {
  createTask,
  moveTask,
  deleteTask,
  updateTask,
  addTaskNote,
  getTaskNotes,
  type SerializedTask,
  type AdminUser,
  type TaskColumn,
  type TaskPriority,
} from "@/app/(admin)/admin/tasks/actions";

const COLUMNS: { id: TaskColumn; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "border-blue-400" },
  { id: "in_progress", label: "In Progress", color: "border-amber-400" },
  { id: "done", label: "Done", color: "border-green-400" },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  normal: "bg-blue-100 text-blue-700",
  low: "bg-gray-100 text-gray-600",
};

const COLOR_LABELS: Record<string, string> = {
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  yellow: "border-l-yellow-500",
  green: "border-l-green-500",
  blue: "border-l-blue-500",
  purple: "border-l-purple-500",
};

export default function KanbanBoard({
  tasks: initialTasks,
  adminUsers,
}: {
  tasks: SerializedTask[];
  adminUsers: AdminUser[];
}) {
  const [allTasks, setAllTasks] = useState(initialTasks);
  const [selectedTask, setSelectedTask] = useState<SerializedTask | null>(null);
  const [createState, createAction, createPending] = useActionState(
    async (
      prev: { error?: string; success?: boolean; task?: SerializedTask } | null,
      formData: FormData
    ) => {
      const result = await createTask(prev, formData);
      if (result.success && result.task) {
        setAllTasks((prev) => [...prev, result.task!]);
      }
      return result;
    },
    null
  );
  const [, startTransition] = useTransition();

  function handleMove(taskId: number, toColumn: TaskColumn) {
    setAllTasks((prev) => {
      const maxPos = Math.max(
        -1,
        ...prev.filter((t) => t.column === toColumn).map((t) => t.position)
      );
      return prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              column: toColumn,
              position: maxPos + 1,
              completedAt:
                toColumn === "done" ? new Date().toISOString() : null,
            }
          : t
      );
    });
    startTransition(() => {
      const maxPos = Math.max(
        -1,
        ...allTasks
          .filter((t) => t.column === toColumn)
          .map((t) => t.position)
      );
      moveTask(taskId, toColumn, maxPos + 1);
    });
  }

  function handleDelete(taskId: number) {
    if (!confirm("Delete this task?")) return;
    setAllTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTask(null);
    startTransition(() => {
      deleteTask(taskId);
    });
  }

  const userMap = new Map(
    adminUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`])
  );

  return (
    <div className="mt-8">
      {/* Create form */}
      <div className="mb-6 rounded-xl border border-green-200 bg-white p-4">
        <form action={createAction} className="flex gap-3">
          <input
            name="title"
            placeholder="New task..."
            required
            className="flex-1 rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
          <select
            name="priority"
            defaultValue="normal"
            className="rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <button
            type="submit"
            disabled={createPending}
            className="rounded-lg bg-gold-600 px-5 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {createPending ? "Creating..." : "Add"}
          </button>
        </form>
        {createState?.error && (
          <p className="mt-2 text-sm text-red-600">{createState.error}</p>
        )}
      </div>

      {/* Columns */}
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const columnTasks = allTasks
            .filter((t) => t.column === col.id)
            .sort((a, b) => a.position - b.position);

          return (
            <div key={col.id}>
              <div
                className={`mb-3 flex items-center gap-2 border-b-2 ${col.color} pb-2`}
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider text-green-800">
                  {col.label}
                </h2>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                  {columnTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    userMap={userMap}
                    onSelect={() => setSelectedTask(task)}
                    onMove={handleMove}
                  />
                ))}
                {columnTasks.length === 0 && (
                  <p className="py-4 text-center text-xs text-green-400">
                    No tasks
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          adminUsers={adminUsers}
          userMap={userMap}
          onClose={() => setSelectedTask(null)}
          onDelete={handleDelete}
          onUpdate={(updated) => {
            setAllTasks((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t))
            );
            setSelectedTask(updated);
          }}
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  userMap,
  onSelect,
  onMove,
}: {
  task: SerializedTask;
  userMap: Map<number, string>;
  onSelect: () => void;
  onMove: (taskId: number, column: TaskColumn) => void;
}) {
  const borderClass = task.colorLabel
    ? COLOR_LABELS[task.colorLabel] ?? ""
    : "";
  const checkDone = task.checklist?.filter((c) => c.done).length ?? 0;
  const checkTotal = task.checklist?.length ?? 0;

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border border-green-200 bg-white p-3 transition-colors hover:border-green-300 ${
        borderClass ? `border-l-2 ${borderClass}` : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-green-800">{task.title}</h3>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[task.priority]}`}
        >
          {task.priority}
        </span>
      </div>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-green-500">
          {task.description}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.assigneeIds.length > 0 && (
            <span className="text-[10px] text-green-500">
              {task.assigneeIds
                .map((id) => userMap.get(id)?.split(" ")[0] ?? "?")
                .join(", ")}
            </span>
          )}
          {checkTotal > 0 && (
            <span className="text-[10px] text-green-400">
              {checkDone}/{checkTotal}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {task.column !== "todo" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const prev =
                  task.column === "done" ? "in_progress" : "todo";
                onMove(task.id, prev as TaskColumn);
              }}
              className="rounded p-1 text-green-400 hover:bg-green-100 hover:text-green-600"
              title="Move left"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}
          {task.column !== "done" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const next =
                  task.column === "todo" ? "in_progress" : "done";
                onMove(task.id, next as TaskColumn);
              }}
              className="rounded p-1 text-green-400 hover:bg-green-100 hover:text-green-600"
              title="Move right"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskDetailPanel({
  task,
  adminUsers,
  userMap,
  onClose,
  onDelete,
  onUpdate,
}: {
  task: SerializedTask;
  adminUsers: AdminUser[];
  userMap: Map<number, string>;
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdate: (task: SerializedTask) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState(task.priority);
  const [saving, startSave] = useTransition();
  const [notes, setNotes] = useState<
    Array<{ id: number; content: string; authorName: string; createdAt: Date }>
  >([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [addingNote, startAddNote] = useTransition();

  // Load notes on mount
  if (!notesLoaded) {
    getTaskNotes(task.id).then((n) => {
      setNotes(n);
      setNotesLoaded(true);
    });
  }

  function handleSave() {
    startSave(async () => {
      await updateTask(task.id, {
        title,
        assigneeIds: task.assigneeIds,
        priority,
        colorLabel: task.colorLabel,
        dueDate: task.dueDate,
        checklist: task.checklist,
      });
      onUpdate({ ...task, title, priority: priority as SerializedTask["priority"] });
    });
  }

  function handleAddNote() {
    if (!noteContent.trim()) return;
    startAddNote(async () => {
      await addTaskNote(task.id, noteContent);
      const updated = await getTaskNotes(task.id);
      setNotes(updated);
      setNoteContent("");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12">
      <div className="w-full max-w-lg rounded-xl border border-green-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-green-100 px-5 py-4">
          <span className="text-xs text-green-500">#{task.id}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(task.id)}
              className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
            >
              Delete
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-green-400 hover:bg-green-100 hover:text-green-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-green-800">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-green-800">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1 block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                Status
              </label>
              <p className="mt-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-600">
                {COLUMNS.find((c) => c.id === task.column)?.label}
              </p>
            </div>
          </div>
          {task.assigneeIds.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-green-800">
                Assignees
              </label>
              <p className="mt-1 text-sm text-green-600">
                {task.assigneeIds
                  .map((id) => userMap.get(id) ?? "Unknown")
                  .join(", ")}
              </p>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-green-800 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>

          {/* Notes */}
          <div className="border-t border-green-100 pt-4">
            <h3 className="text-sm font-medium text-green-800">Notes</h3>
            <div className="mt-3 space-y-2">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg bg-green-50 px-3 py-2"
                >
                  <p className="text-sm text-green-700">{note.content}</p>
                  <p className="mt-1 text-[10px] text-green-400">
                    {note.authorName} &middot;{" "}
                    {new Date(note.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Add a note..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
                className="flex-1 rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote || !noteContent.trim()}
                className="rounded-lg bg-green-800 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
