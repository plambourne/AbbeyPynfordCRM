"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { useCurrentStaff, StaffRole } from "../components/useCurrentStaff";

type TaskStatus = "open" | "in_progress" | "done" | "blocked";
type TaskPriority = "low" | "medium" | "high";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  deal_id: string | null;
};

type Staff = {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  is_active: boolean;
};

type DealOption = {
  id: string;
  ap_number: number | null;
  client_name: string | null;
  site_name: string | null;
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done",        label: "Done" },
  { value: "blocked",     label: "Blocked" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
];

// RAG status from due date
type DueStatus = "overdue" | "due_soon" | "future" | "no_date";

function getDueStatus(dueDate: string | null): DueStatus {
  if (!dueDate) return "no_date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "no_date";

  const diffMs = due.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "due_soon";
  return "future";
}

function getDueStatusColorClass(status: DueStatus): string {
  switch (status) {
    case "overdue":
      return "bg-red-500";
    case "due_soon":
      return "bg-amber-400";
    case "future":
      return "bg-green-500";
    case "no_date":
    default:
      return "bg-gray-300";
  }
}

function getDueStatusLabel(status: DueStatus): string {
  switch (status) {
    case "overdue":
      return "Overdue";
    case "due_soon":
      return "Due soon (≤ 3 days)";
    case "future":
      return "More than 3 days away";
    case "no_date":
    default:
      return "No due date";
  }
}

export default function TasksPage() {
  const { staff: currentStaff, loading: staffLoading } = useCurrentStaff();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);

  const [deals, setDeals] = useState<DealOption[]>([]);
  const [dealsError, setDealsError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [assignedFilter, setAssignedFilter] = useState<string>("");
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  // New task form
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    deal_id: "",
    description: "",
    due_date: "",
    priority: "" as "" | TaskPriority,
    assigned_to: "", // staff id
  });

  // Expanded row & status update
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  // -----------------------
  // Load staff (for assignee picker)
  // -----------------------
  const loadStaff = async () => {
    setStaffError(null);

    const { data, error } = await supabase
      .from("staff_profiles")
      .select("id, full_name, email, role, is_active")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Error loading staff:", error);
      setStaffError(error.message);
    } else {
      setStaffList((data || []) as Staff[]);
    }
  };

  // -----------------------
  // Load deals (for linking tasks)
  // -----------------------
  const loadDeals = async () => {
    setDealsError(null);

    const { data, error } = await supabase
      .from("deals")
      .select("id, ap_number, client_name, site_name")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Error loading deals for tasks:", error);
      setDealsError(error.message);
    } else {
      setDeals((data || []) as DealOption[]);
    }
  };

  // -----------------------
  // Load tasks
  // -----------------------
  const loadTasks = async () => {
    setTasksLoading(true);
    setTasksError(null);

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_date, assigned_to, created_by, created_at, deal_id"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading tasks:", error);
      setTasksError(error.message || "Could not load tasks.");
    } else {
      setTasks((data || []) as Task[]);
    }

    setTasksLoading(false);
  };

  useEffect(() => {
    void loadStaff();
    void loadDeals();
    void loadTasks();
  }, []);

  // -----------------------
  // Helpers
  // -----------------------
  const handleCreateChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setCreateForm((prev) => ({ ...prev, [name]: value }));
  };

  const getDealLabel = (dealId: string | null): string => {
    if (!dealId) return "No lead linked";
    const d = deals.find((x) => x.id === dealId);
    if (!d) return "Lead not found";

    const apPart = d.ap_number ? `AP${d.ap_number}` : "";
    const clientPart = d.client_name || "";
    const sitePart = d.site_name || "";
    const bits = [apPart, clientPart, sitePart].filter(Boolean);
    return bits.join(" – ") || "Lead";
  };

  const getStaffName = (id: string | null) => {
    if (!id) return "Unassigned";
    const s = staffList.find((p) => p.id === id);
    return s ? s.full_name : "Unknown";
  };

  const formatDate = (v: string | null) =>
    v ? new Date(v).toLocaleDateString() : "—";

  // -----------------------
  // Create task
  // -----------------------
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStaff) {
      setCreateError("You must be logged in to create tasks.");
      return;
    }
    if (!createForm.deal_id) {
      setCreateError("Please select a lead / project.");
      return;
    }
    if (!createForm.description.trim()) {
      setCreateError("Please enter a brief description of the task.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    const selectedDeal = deals.find((d) => d.id === createForm.deal_id) || null;
    const baseTitle = selectedDeal ? getDealLabel(selectedDeal.id) : "Task";

    const descSnippet = createForm.description.trim().slice(0, 80);
    const title = descSnippet ? `${baseTitle} – ${descSnippet}` : baseTitle;

    const insertPayload = {
      title,
      description: createForm.description.trim() || null,
      status: "open" as TaskStatus,
      priority: (createForm.priority || null) as TaskPriority | null,
      due_date: createForm.due_date || null,
      assigned_to: createForm.assigned_to || currentStaff.id,
      created_by: currentStaff.id,
      deal_id: createForm.deal_id,
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Error creating task:", error);
      setCreateError(error.message || "Could not create task.");
    } else if (data) {
      const newTask = data as Task;
      setTasks((prev) => [newTask, ...prev]);
      setCreateForm({
        deal_id: "",
        description: "",
        due_date: "",
        priority: "",
        assigned_to: "",
      });

      // 🔔 PLACEHOLDER for email notification (see previous message)
      // You can call a Next.js API route here to send an email to the assignee.
    }

    setCreating(false);
  };

  // -----------------------
  // Update task status (e.g. Close / Re-open)
  // -----------------------
  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    setStatusUpdatingId(taskId);

    const { data, error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      console.error("Error updating task status:", error);
      // optional: toast
    } else if (data) {
      const updated = data as Task;
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    }

    setStatusUpdatingId(null);
  };

  // -----------------------
  // Filtering
  // -----------------------
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter && (t.status || "open") !== statusFilter) return false;
      if (priorityFilter && (t.priority || "") !== priorityFilter) return false;
      if (assignedFilter && t.assigned_to !== assignedFilter) return false;

      // "My tasks" filter – only tasks assigned to me
      if (myTasksOnly && currentStaff) {
        if (t.assigned_to !== currentStaff.id) return false;
      }

      return true;
    });
  }, [tasks, statusFilter, priorityFilter, assignedFilter, myTasksOnly, currentStaff]);

  const resetFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setAssignedFilter("");
    setMyTasksOnly(false);
  };

  // -----------------------
  // RENDER
  // -----------------------
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">
            Create and track tasks linked to specific leads / projects.
          </p>
        </div>
      </div>

      {/* New task form */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-800">
          New task
        </h2>

        {createError && (
          <p className="mb-2 text-sm text-red-600">{createError}</p>
        )}

        {dealsError && (
          <p className="mb-2 text-sm text-orange-600">
            Could not load leads for linking: {dealsError}
          </p>
        )}

        {staffLoading && !currentStaff ? (
          <p className="text-sm text-gray-500">
            Checking your user profile…
          </p>
        ) : !currentStaff ? (
          <p className="text-sm text-gray-500">
            You must be logged in with a staff profile to create tasks.
          </p>
        ) : (
          <form
            onSubmit={handleCreateTask}
            className="grid gap-3 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-gray-600">
                Lead / project *
              </label>
              <select
                name="deal_id"
                value={createForm.deal_id}
                onChange={handleCreateChange}
                className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
                required
              >
                <option value="">Select lead / project…</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {getDealLabel(d.id)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-gray-600">
                Description *
              </label>
              <textarea
                name="description"
                value={createForm.description}
                onChange={handleCreateChange}
                className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
                rows={3}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">
                Due date
              </label>
              <input
                type="date"
                name="due_date"
                value={createForm.due_date}
                onChange={handleCreateChange}
                className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">
                Priority
              </label>
              <select
                name="priority"
                value={createForm.priority}
                onChange={handleCreateChange}
                className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
              >
                <option value="">No priority</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">
                Assigned to
              </label>
              <select
                name="assigned_to"
                value={createForm.assigned_to}
                onChange={handleCreateChange}
                className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
              >
                <option value="">(Me) {currentStaff.full_name}</option>
                {staffList
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create task"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Filters */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-800">
          Filters
        </h2>

        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
            >
              <option value="">All</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Assigned to
            </label>
            <select
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
            >
              <option value="">All</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {!s.is_active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* My tasks only toggle */}
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={myTasksOnly}
                onChange={(e) => setMyTasksOnly(e.target.checked)}
                disabled={!currentStaff}
              />
              <span>My tasks only</span>
            </label>
          </div>

          {/* RAG legend */}
          <div className="flex items-end justify-end text-[11px] text-gray-500 gap-2">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Overdue
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              ≤ 3 days
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              &gt; 3 days
            </span>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Reset filters
          </button>
        </div>
      </section>

      {/* Tasks list */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">
            Tasks
          </h2>
          <p className="text-xs text-gray-500">
            Showing {filteredTasks.length} of {tasks.length} task
            {tasks.length === 1 ? "" : "s"}.
          </p>
        </div>

        {tasksError && (
          <p className="mb-2 text-sm text-red-600">
            Could not load tasks: {tasksError}
          </p>
        )}

        {staffError && (
          <p className="mb-2 text-sm text-orange-600">
            Could not load staff list: {staffError}
          </p>
        )}

        {tasksLoading ? (
          <p className="text-sm text-gray-500">Loading tasks…</p>
        ) : filteredTasks.length === 0 ? (
          <p className="text-sm text-gray-500">
            No tasks match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Lead / task
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Priority
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Assigned to
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Due date
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Created
                  </th>
                  <th className="text-right p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((t) => {
                  const dueStatus = getDueStatus(t.due_date);
                  const dueColor = getDueStatusColorClass(dueStatus);
                  const dueLabel = getDueStatusLabel(dueStatus);
                  const isExpanded = expandedTaskId === t.id;

                  return (
                    <tr key={t.id} className="border-b align-top">
                      <td className="p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            {t.deal_id ? (
                              <Link
                                href={`/deals/detail?id=${t.deal_id}`}
                                className="text-sm font-medium text-blue-600 hover:underline"
                              >
                                {getDealLabel(t.deal_id)}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-gray-500">
                                No lead linked
                              </span>
                            )}
                            {t.description && (
                              <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                                {t.description}
                              </div>
                            )}
                          </div>
                        </div>
                        {isExpanded && t.description && (
                          <div className="mt-2 rounded border bg-gray-50 p-2 text-xs text-gray-700">
                            <div className="mb-1 font-semibold">
                              Full description
                            </div>
                            <div className="whitespace-pre-wrap">
                              {t.description}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                          {STATUS_OPTIONS.find((s) => s.value === t.status)?.label ??
                            (t.status || "Open")}
                        </span>
                      </td>
                      <td className="p-2">
                        {t.priority ? (
                          <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                            {
                              PRIORITY_OPTIONS.find(
                                (p) => p.value === t.priority
                              )?.label
                            }
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs">
                        {getStaffName(t.assigned_to)}
                      </td>
                      <td className="p-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span>{formatDate(t.due_date)}</span>
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${dueColor}`}
                            title={dueLabel}
                          />
                        </div>
                      </td>
                      <td className="p-2 text-xs">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="p-2 text-right text-xs space-x-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTaskId(isExpanded ? null : t.id)
                          }
                          className="text-blue-600 hover:underline"
                        >
                          {isExpanded ? "Hide" : "View"}
                        </button>
                        {t.status !== "done" ? (
                          <button
                            type="button"
                            onClick={() => updateTaskStatus(t.id, "done")}
                            disabled={statusUpdatingId === t.id}
                            className="text-green-600 hover:underline disabled:opacity-50"
                          >
                            {statusUpdatingId === t.id ? "Closing…" : "Mark done"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateTaskStatus(t.id, "open")}
                            disabled={statusUpdatingId === t.id}
                            className="text-amber-600 hover:underline disabled:opacity-50"
                          >
                            {statusUpdatingId === t.id ? "Updating…" : "Re-open"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
