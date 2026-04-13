"use client";

import { useState, useActionState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createTask,
  moveTask,
  deleteTask,
  updateTask,
  type SerializedTask,
  type AdminUser,
  type TaskColumn,
  type TaskPriority,
} from "@/app/(admin)/admin/tasks/actions";
import Comments from "@/components/comments/Comments";

const COLUMNS: { id: TaskColumn; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "border-blue-400" },
  { id: "in_progress", label: "In Progress", color: "border-amber-400" },
  { id: "to_test", label: "To Test", color: "border-purple-400" },
  { id: "done", label: "Done", color: "border-green-400" },
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const COLOR_LABELS = [
  { value: "", label: "None" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
];

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  normal: "bg-blue-100 text-blue-700",
  low: "bg-gray-100 text-gray-600",
};

const PRIORITY_RANK: Record<string, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

type SortMode = "priority" | "time_desc" | "time_asc";

function sortTasks(tasks: SerializedTask[], mode: SortMode): SerializedTask[] {
  const sorted = [...tasks];
  if (mode === "priority") {
    sorted.sort((a, b) => {
      const rankDiff =
        (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } else if (mode === "time_desc") {
    sorted.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } else {
    sorted.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }
  return sorted;
}

const COLOR_MAP: Record<string, string> = {
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  yellow: "border-l-yellow-500",
  green: "border-l-green-500",
  blue: "border-l-blue-500",
  purple: "border-l-purple-500",
};

type DetailTab = "task" | "comments" | "share";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "task", label: "Task" },
  { id: "comments", label: "Comments" },
  { id: "share", label: "Share" },
];

export default function KanbanBoard({
  tasks: initialTasks,
  adminUsers,
  currentUserId,
}: {
  tasks: SerializedTask[];
  adminUsers: AdminUser[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [allTasks, setAllTasks] = useState(initialTasks);
  const [selectedTask, setSelectedTask] = useState<SerializedTask | null>(
    null
  );
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "mine" | number>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [doneRange, setDoneRange] = useState<1 | 7 | 30 | 90 | "all">(7);

  // Restore filter + sort selections from localStorage after hydration
  useEffect(() => {
    try {
      const af = localStorage.getItem("kanban-assignee-filter");
      if (af === "all" || af === "mine") setAssigneeFilter(af);
      else if (af) {
        const n = Number(af);
        if (!isNaN(n)) setAssigneeFilter(n);
      }
    } catch {}
    try {
      const sm = localStorage.getItem("kanban-sort-mode");
      if (sm === "priority" || sm === "time_desc" || sm === "time_asc") {
        setSortMode(sm);
      }
    } catch {}
    try {
      const dr = localStorage.getItem("kanban-done-range");
      if (dr === "all") setDoneRange("all");
      else if (dr) {
        const n = Number(dr);
        if ([1, 7, 30, 90].includes(n)) setDoneRange(n as 1 | 7 | 30 | 90);
      }
    } catch {}
  }, []);

  // Persist filter + sort selections
  useEffect(() => {
    try {
      localStorage.setItem("kanban-assignee-filter", String(assigneeFilter));
    } catch {}
  }, [assigneeFilter]);
  useEffect(() => {
    try {
      localStorage.setItem("kanban-sort-mode", sortMode);
    } catch {}
  }, [sortMode]);
  useEffect(() => {
    try {
      localStorage.setItem("kanban-done-range", String(doneRange));
    } catch {}
  }, [doneRange]);

  // Keep local state in sync with server data (refreshed every 15s below)
  useEffect(() => {
    setAllTasks(initialTasks);
    // If a task is open in the detail panel, refresh its data too
    if (selectedTask) {
      const fresh = initialTasks.find((t) => t.id === selectedTask.id);
      if (fresh) setSelectedTask(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTasks]);

  // Auto-refresh every 15s, paused while a detail panel is open so we don't
  // clobber whatever the user is editing.
  useEffect(() => {
    if (selectedTask) return;
    const id = setInterval(() => {
      router.refresh();
    }, 15000);
    return () => clearInterval(id);
  }, [router, selectedTask]);
  const [createState, createAction, createPending] = useActionState(
    async (
      prev: {
        error?: string;
        success?: boolean;
        task?: SerializedTask;
      } | null,
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
    setAllTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTask(null);
    startTransition(() => {
      deleteTask(taskId);
    });
  }

  function handleUpdate(updated: SerializedTask) {
    setAllTasks((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t))
    );
    setSelectedTask(updated);
  }

  const userMap = new Map(
    adminUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`])
  );

  return (
    <div className="mt-5">
      {/* Create form */}
      <div className="mb-4 rounded-lg border border-green-200 bg-white p-3">
        <form action={createAction} className="flex gap-2">
          <input
            name="title"
            placeholder="New task..."
            required
            className="flex-1 rounded-md border border-green-300 px-2.5 py-1.5 text-xs focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
          <select
            name="priority"
            defaultValue="normal"
            className="rounded-md border border-green-300 px-2.5 py-1.5 text-xs focus:border-gold-500 focus:outline-none"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={createPending}
            className="rounded-md bg-gold-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {createPending ? "Creating..." : "Add"}
          </button>
        </form>
        {createState?.error && (
          <p className="mt-2 text-xs text-red-600">{createState.error}</p>
        )}
      </div>

      {/* Toolbar: sort + assignee filter */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-green-200 bg-white px-2 py-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-green-600">
            Sort
          </label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded px-1 py-0.5 text-xs text-green-800 focus:outline-none focus:ring-1 focus:ring-gold-500"
          >
            <option value="priority">Priority (high → low)</option>
            <option value="time_desc">Newest first</option>
            <option value="time_asc">Oldest first</option>
          </select>
        </div>

        <div className="flex items-center gap-0.5 rounded-md border border-green-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setAssigneeFilter("all")}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              assigneeFilter === "all"
                ? "bg-green-700 text-white"
                : "text-green-700 hover:bg-green-50"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setAssigneeFilter("mine")}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              assigneeFilter === "mine"
                ? "bg-green-700 text-white"
                : "text-green-700 hover:bg-green-50"
            }`}
          >
            Mine
          </button>
          {adminUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() =>
                setAssigneeFilter(assigneeFilter === u.id ? "all" : u.id)
              }
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                assigneeFilter === u.id
                  ? "bg-green-700 text-white"
                  : "text-green-700 hover:bg-green-50"
              }`}
            >
              {u.firstName}
            </button>
          ))}
        </div>
      </div>

      {/* Columns */}
      <div className="grid gap-3 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          let columnTasks = allTasks.filter((t) => t.column === col.id);
          // Apply assignee filter
          if (assigneeFilter !== "all") {
            const filterUserId =
              assigneeFilter === "mine" ? currentUserId : assigneeFilter;
            columnTasks = columnTasks.filter((t) =>
              t.assigneeIds.includes(filterUserId)
            );
          }
          // Done column has its own time-window filter on top of assignee
          let totalCount: number | undefined;
          if (col.id === "done" && doneRange !== "all") {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - doneRange);
            const before = columnTasks.length;
            columnTasks = columnTasks.filter((t) => {
              if (!t.completedAt) return true; // legacy rows without timestamp
              return new Date(t.completedAt) >= cutoff;
            });
            if (columnTasks.length !== before) totalCount = before;
          }
          // Apply sort
          columnTasks = sortTasks(columnTasks, sortMode);

          return (
            <div key={col.id}>
              <div
                className={`mb-2 flex items-center gap-1.5 border-b-2 ${col.color} pb-1.5`}
              >
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-green-800">
                  {col.label}
                </h2>
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-600">
                  {totalCount !== undefined
                    ? `${columnTasks.length} / ${totalCount}`
                    : columnTasks.length}
                </span>
                {col.id === "done" && (
                  <select
                    value={doneRange}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDoneRange(
                        v === "all" ? "all" : (Number(v) as 1 | 7 | 30 | 90)
                      );
                    }}
                    className="ml-auto rounded border border-green-200 bg-white px-1 py-0.5 text-[10px] text-green-700 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  >
                    <option value={1}>1 day</option>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value="all">All</option>
                  </select>
                )}
              </div>
              <div className="space-y-1.5">
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
                  <p className="py-3 text-center text-[11px] text-green-400">
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
          currentUserId={currentUserId}
          onClose={() => setSelectedTask(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

// ─── Task Card ──────────────────────────────────────────

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
    ? COLOR_MAP[task.colorLabel] ?? ""
    : "";
  const checkDone = task.checklist?.filter((c) => c.done).length ?? 0;
  const checkTotal = task.checklist?.length ?? 0;

  const colIdx = COLUMNS.findIndex((c) => c.id === task.column);
  const prevCol = colIdx > 0 ? COLUMNS[colIdx - 1].id : null;
  const nextCol = colIdx >= 0 && colIdx < COLUMNS.length - 1 ? COLUMNS[colIdx + 1].id : null;

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-md border border-green-200 bg-white p-2 transition-colors hover:border-green-300 ${
        borderClass ? `border-l-2 ${borderClass}` : ""
      }`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <h3 className="text-[12px] font-medium leading-snug text-green-800">
          <span className="mr-1 text-green-400">#{task.id}</span>
          {task.title}
        </h3>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${PRIORITY_BADGE[task.priority]}`}
        >
          {task.priority}
        </span>
      </div>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-[11px] text-green-500">
          {task.description}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
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
          {task.dueDate && (
            <span className="text-[10px] text-green-400">
              {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex gap-0.5">
          {prevCol && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove(task.id, prevCol);
              }}
              className="rounded p-0.5 text-green-400 hover:bg-green-100 hover:text-green-600"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}
          {nextCol && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove(task.id, nextCol);
              }}
              className="rounded p-0.5 text-green-400 hover:bg-green-100 hover:text-green-600"
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

// ─── Detail Panel ───────────────────────────────────────

function TaskDetailPanel({
  task,
  adminUsers,
  userMap,
  currentUserId,
  onClose,
  onDelete,
  onUpdate,
}: {
  task: SerializedTask;
  adminUsers: AdminUser[];
  userMap: Map<number, string>;
  currentUserId: number;
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdate: (task: SerializedTask) => void;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("task");
  const [prevTaskId, setPrevTaskId] = useState(task.id);

  if (prevTaskId !== task.id) {
    setPrevTaskId(task.id);
    setActiveTab("task");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12">
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-green-200 bg-white shadow-2xl" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-green-100 px-6 py-4">
          <h2 className="font-display text-xl font-semibold text-green-950">
            <span className="mr-2 text-sm font-medium text-green-800/40">
              #{task.id}
            </span>
            {task.title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-green-800/50 hover:bg-green-100 hover:text-green-800"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-green-100 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-green-700 text-green-900"
                  : "border-transparent text-green-800/50 hover:text-green-800"
              }`}
            >
              {tab.label}
              {tab.id === "share" && task.sharedWithIds.length > 0 && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                    activeTab === tab.id
                      ? "bg-green-700 text-white"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {task.sharedWithIds.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "task" && (
            <TaskTab
              task={task}
              adminUsers={adminUsers}
              onSave={onUpdate}
              onDelete={onDelete}
              onClose={onClose}
            />
          )}
          {activeTab === "comments" && (
            <Comments
              contextType="task"
              contextId={task.id}
              userId={currentUserId}
              mentionUsers={adminUsers}
              onUpload={async (file: File) => {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("taskId", String(task.id));
                const res = await fetch("/api/admin/tasks/upload", {
                  method: "POST",
                  body: formData,
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({ error: "Upload failed" }));
                  console.error("Task upload error:", err.error);
                  return null;
                }
                return res.json();
              }}
            />
          )}
          {activeTab === "share" && (
            <ShareTab
              task={task}
              adminUsers={adminUsers}
              onSave={onUpdate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Tab ───────────────────────────────────────────

function TaskTab({
  task,
  adminUsers,
  onSave,
  onDelete,
  onClose,
}: {
  task: SerializedTask;
  adminUsers: AdminUser[];
  onSave: (updated: SerializedTask) => void;
  onDelete: (taskId: number) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [assigneeIds, setAssigneeIds] = useState<number[]>(task.assigneeIds);
  const [priority, setPriority] = useState(task.priority);
  const [colorLabel, setColorLabel] = useState(task.colorLabel ?? "");
  const [dueDate, setDueDate] = useState(
    task.dueDate ? task.dueDate.split("T")[0] : ""
  );
  const [checklist, setChecklist] = useState<
    Array<{ text: string; done: boolean }>
  >(task.checklist ?? []);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [prevTask, setPrevTask] = useState(task);

  if (prevTask !== task) {
    setPrevTask(task);
    setTitle(task.title);
    setAssigneeIds(task.assigneeIds);
    setPriority(task.priority);
    setColorLabel(task.colorLabel ?? "");
    setDueDate(task.dueDate ? task.dueDate.split("T")[0] : "");
    setChecklist(task.checklist ?? []);
    setError(null);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateTask(task.id, {
        title,
        assigneeIds,
        priority,
        colorLabel: colorLabel || null,
        dueDate: dueDate || null,
        checklist: checklist.length > 0 ? checklist : null,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onSave({
          ...task,
          title,
          assigneeIds,
          priority: priority as TaskPriority,
          colorLabel: colorLabel || null,
          dueDate: dueDate || null,
          checklist: checklist.length > 0 ? checklist : null,
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  function handleDeleteTask() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    startTransition(async () => {
      await deleteTask(task.id);
      onDelete(task.id);
    });
  }

  return (
    <>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-green-900">
            Title *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-green-900">
            Assigned to
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-green-200 bg-white px-3 py-2.5">
            {adminUsers.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-1.5 text-sm text-green-900"
              >
                <input
                  type="checkbox"
                  checked={assigneeIds.includes(u.id)}
                  onChange={() =>
                    setAssigneeIds((prev) =>
                      prev.includes(u.id)
                        ? prev.filter((a) => a !== u.id)
                        : [...prev, u.id]
                    )
                  }
                  className="h-4 w-4 rounded border-green-300 text-green-600 focus:ring-green-500"
                />
                {u.firstName} {u.lastName}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-green-900">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-green-900">
              Color label
            </label>
            <select
              value={colorLabel}
              onChange={(e) => setColorLabel(e.target.value)}
              className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              {COLOR_LABELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-green-900">
              Due date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Checklist */}
        <div>
          <label className="mb-2 block text-sm font-medium text-green-900">
            Checklist
          </label>
          <div className="space-y-2">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => {
                    const updated = checklist.map((c, j) =>
                      j === i ? { ...c, done: !c.done } : c
                    );
                    setChecklist(updated);
                  }}
                  className="h-4 w-4 rounded border-green-300 text-green-600 focus:ring-green-500"
                />
                <span
                  className={`flex-1 text-sm ${
                    item.done
                      ? "text-green-800/40 line-through"
                      : "text-green-900"
                  }`}
                >
                  {item.text}
                </span>
                <button
                  onClick={() =>
                    setChecklist(checklist.filter((_, j) => j !== i))
                  }
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newCheckItem}
              onChange={(e) => setNewCheckItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCheckItem.trim()) {
                  e.preventDefault();
                  setChecklist([
                    ...checklist,
                    { text: newCheckItem.trim(), done: false },
                  ]);
                  setNewCheckItem("");
                }
              }}
              placeholder="New item..."
              className="flex-1 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none"
            />
            <button
              onClick={() => {
                if (!newCheckItem.trim()) return;
                setChecklist([
                  ...checklist,
                  { text: newCheckItem.trim(), done: false },
                ]);
                setNewCheckItem("");
              }}
              className="rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-200"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={handleDeleteTask}
          className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Share Tab ──────────────────────────────────────────

function ShareTab({
  task,
  adminUsers,
  onSave,
}: {
  task: SerializedTask;
  adminUsers: AdminUser[];
  onSave: (updated: SerializedTask) => void;
}) {
  const [sharedWithIds, setSharedWithIds] = useState<number[]>(
    task.sharedWithIds
  );
  const [assigneeIds, setAssigneeIds] = useState<number[]>(task.assigneeIds);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [prevId, setPrevId] = useState(task.id);

  if (prevId !== task.id) {
    setPrevId(task.id);
    setSharedWithIds(task.sharedWithIds);
    setAssigneeIds(task.assigneeIds);
    setSaved(false);
  }

  function toggleMember(userId: number) {
    if (sharedWithIds.includes(userId)) {
      setSharedWithIds((prev) => prev.filter((id) => id !== userId));
      setAssigneeIds((prev) => prev.filter((id) => id !== userId));
    } else {
      setSharedWithIds((prev) => [...prev, userId]);
    }
  }

  function toggleAssignee(userId: number) {
    if (assigneeIds.includes(userId)) {
      setAssigneeIds((prev) => prev.filter((id) => id !== userId));
    } else {
      setAssigneeIds((prev) => [...prev, userId]);
      if (!sharedWithIds.includes(userId)) {
        setSharedWithIds((prev) => [...prev, userId]);
      }
    }
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateTask(task.id, {
        title: task.title,
        assigneeIds,
        priority: task.priority,
        colorLabel: task.colorLabel || null,
        dueDate: task.dueDate || null,
        checklist: task.checklist,
      });
      if (!result.error) {
        onSave({
          ...task,
          assigneeIds,
          sharedWithIds,
          updatedAt: new Date().toISOString(),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex gap-4 text-xs text-green-800/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-green-300" />{" "}
          Shared
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-green-700" />{" "}
          Assigned
        </span>
      </div>

      <div className="space-y-1">
        {adminUsers.map((u) => {
          const isOwner = u.id === task.createdById;
          const isShared = sharedWithIds.includes(u.id);
          const isAssigned = assigneeIds.includes(u.id);
          return (
            <div
              key={u.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isShared ? "bg-green-50" : "hover:bg-green-50/50"
              }`}
            >
              <span
                className={`flex-1 ${
                  isShared
                    ? "font-medium text-green-900"
                    : "text-green-800/50"
                }`}
              >
                {u.firstName} {u.lastName}
                {isOwner && (
                  <span className="ml-1.5 text-[11px] font-normal text-green-800/40">
                    Owner
                  </span>
                )}
              </span>
              <button
                onClick={() => toggleAssignee(u.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isAssigned
                    ? "bg-green-700 text-white hover:bg-green-800"
                    : "border border-green-200 text-green-700 hover:bg-green-100"
                }`}
              >
                {isAssigned ? "Assigned" : "Assign"}
              </button>
              {isOwner ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800/50">
                  Shared
                </span>
              ) : (
                <button
                  onClick={() => toggleMember(u.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isShared
                      ? "bg-green-100 text-green-800 hover:bg-green-200"
                      : "border border-dashed border-green-300 text-green-600 hover:bg-green-50"
                  }`}
                >
                  {isShared ? "Shared" : "Share"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-green-800 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && (
          <span className="text-sm text-green-700">Saved</span>
        )}
      </div>
    </div>
  );
}
