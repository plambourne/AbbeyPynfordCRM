"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { useCurrentStaff, StaffRole } from "@/app/components/useCurrentStaff";

type StaffProfile = {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
};

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "estimator", label: "Estimator" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
];

export default function StaffAdminPage() {
  const { staff: currentStaff, loading: currentStaffLoading } = useCurrentStaff();

  const isAdminOrManager =
    currentStaff &&
    (currentStaff.role === "admin" || currentStaff.role === "manager");

  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    full_name: string;
    email: string;
    role: StaffRole;
    is_active: boolean;
  } | null>(null);

  // Add user modal
  const [newUserModalOpen, setNewUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    full_name: "",
    role: "staff" as StaffRole,
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Reset password loading
  const [resettingId, setResettingId] = useState<string | null>(null);

  // Deactivate & delete loading
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load staff list from staff_profiles
  const loadStaff = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("staff_profiles")
      .select("*")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Error loading staff:", error);
      setError("Could not load staff.");
    } else {
      setStaff((data || []) as StaffProfile[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!currentStaffLoading && isAdminOrManager) {
      void loadStaff();
    }
  }, [currentStaffLoading, isAdminOrManager]);

  // Filtered output
  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      if (roleFilter && s.role !== roleFilter) return false;

      if (activeFilter === "active" && !s.is_active) return false;
      if (activeFilter === "inactive" && s.is_active) return false;

      return true;
    });
  }, [staff, roleFilter, activeFilter]);

  // === Editing ===
  const handleStartEdit = (s: StaffProfile) => {
    setEditingId(s.id);
    setEditForm({
      full_name: s.full_name,
      email: s.email,
      role: s.role,
      is_active: s.is_active,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    if (!editForm) return;
    const target = e.target;
    const { name, value } = target;

    let fieldValue: string | boolean = value;

    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      fieldValue = target.checked;
    }

    setEditForm((prev) =>
      prev
        ? {
            ...prev,
            [name]: fieldValue,
          }
        : prev
    );
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm) return;

    setSavingId(editingId);
    setError(null);

    const { full_name, email, role, is_active } = editForm;

    // Call API route
    const res = await fetch("/api/users/update", {
      method: "POST",
      body: JSON.stringify({
        id: editingId,
        full_name,
        email,
        role,
        is_active,
      }),
    });

    setSavingId(null);

    if (!res.ok) {
      setError("Could not save staff member.");
      return;
    }

    // Refresh list
    await loadStaff();
    setEditingId(null);
    setEditForm(null);
  };

  const formatDate = (v: string) =>
    v ? new Date(v).toLocaleDateString() : "—";
  // ========= PERMISSION GATE =========
  if (currentStaffLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Staff admin</h1>
        <p className="text-sm text-gray-600">Checking your permissions…</p>
      </div>
    );
  }

  if (!currentStaff || !isAdminOrManager) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Staff admin</h1>
        <p className="text-sm text-gray-600">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  // ========= MAIN RENDER =========
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff admin</h1>
          <p className="text-sm text-gray-500">
            Manage internal users, their roles, and account status.
          </p>
        </div>

        <button
          className="rounded bg-blue-600 text-white px-3 py-1 text-sm hover:bg-blue-700"
          onClick={() => setNewUserModalOpen(true)}
        >
          + Add New User
        </button>
      </div>

      {/* Filters */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold text-gray-800">Filters</h2>

          <div className="flex flex-wrap gap-3 text-xs">
            {/* Role filter */}
            <div>
              <label className="text-gray-600 block mb-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded border px-2 py-1 bg-white text-gray-900"
              >
                <option value="">All roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Active filter */}
            <div>
              <label className="text-gray-600 block mb-1">Active status</label>
              <select
                value={activeFilter}
                onChange={(e) =>
                  setActiveFilter(e.target.value as "all" | "active" | "inactive")
                }
                className="rounded border px-2 py-1 bg-white text-gray-900"
              >
                <option value="all">All</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>

            <button
              type="button"
              className="self-end underline text-gray-500"
              onClick={() => {
                setRoleFilter("");
                setActiveFilter("all");
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
      </section>

      {/* Staff list */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Staff list</h2>
          <p className="text-xs text-gray-500">
            Showing {filteredStaff.length} of {staff.length} staff.
          </p>
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">Loading staff…</p>
        ) : filteredStaff.length === 0 ? (
          <p className="text-sm text-gray-500">No staff match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Active</th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((s) => {
                  const isEditing = editingId === s.id;

                  return (
                    <tr key={s.id} className="border-b align-top">
                      {/* Name */}
                      <td className="p-2">
                        {isEditing ? (
                          <input
                            name="full_name"
                            value={editForm?.full_name || ""}
                            onChange={handleEditChange}
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                        ) : (
                          <div className="font-medium">{s.full_name}</div>
                        )}
                      </td>

                      {/* Email */}
                      <td className="p-2">
                        {isEditing ? (
                          <input
                            name="email"
                            value={editForm?.email || ""}
                            onChange={handleEditChange}
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                        ) : (
                          <div className="text-xs">{s.email}</div>
                        )}
                      </td>

                      {/* Role */}
                      <td className="p-2">
                        {isEditing ? (
                          <select
                            name="role"
                            value={editForm?.role}
                            onChange={handleEditChange}
                            className="rounded border px-2 py-1 text-xs bg-white"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                            {ROLE_OPTIONS.find((r) => r.value === s.role)?.label ||
                              s.role}
                          </span>
                        )}
                      </td>

                      {/* Active */}
                      <td className="p-2">
                        {isEditing ? (
                          <label className="inline-flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              name="is_active"
                              checked={editForm?.is_active || false}
                              onChange={handleEditChange}
                            />
                            <span>Active</span>
                          </label>
                        ) : (
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] ${
                              s.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {s.is_active ? "Active" : "Inactive"}
                          </span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="p-2 text-xs">
                        {formatDate(s.created_at)}
                      </td>

                      {/* ACTIONS */}
                      <td className="p-2 text-xs space-x-2">

                        {isEditing ? (
                          <>
                            <button
                              className="rounded bg-green-600 px-3 py-1 text-[11px] text-white hover:bg-green-700"
                              onClick={handleSaveEdit}
                              disabled={savingId === s.id}
                            >
                              {savingId === s.id ? "Saving…" : "Save"}
                            </button>
                            <button
                              className="rounded border px-3 py-1 text-[11px]"
                              onClick={handleCancelEdit}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="rounded border px-3 py-1 text-[11px] hover:bg-gray-50"
                              onClick={() => handleStartEdit(s)}
                            >
                              Edit
                            </button>

                            {/* Reset Password, Deactivate, Delete → Filled in Chunk 3 */}
                            {/* RESET PASSWORD */}
<button
  className="text-blue-600 underline text-[11px]"
  onClick={async () => {
    setResettingId(s.id);
    await fetch("/api/users/reset-password", {
      method: "POST",
      body: JSON.stringify({ email: s.email }),
    });
    setResettingId(null);
    alert("Password reset email sent.");
  }}
  disabled={resettingId === s.id}
>
  {resettingId === s.id ? "Sending…" : "Reset Password"}
</button>

{/* DEACTIVATE */}
<button
  className="text-orange-600 underline text-[11px]"
  onClick={async () => {
    if (!confirm("Deactivate this user?")) return;

    setDeactivatingId(s.id);
    await fetch("/api/users/deactivate", {
      method: "POST",
      body: JSON.stringify({ id: s.id }),
    });
    setDeactivatingId(null);
    await loadStaff();
  }}
  disabled={deactivatingId === s.id}
>
  {deactivatingId === s.id ? "Deactivating…" : "Deactivate"}
</button>

{/* DELETE */}
<button
  className="text-red-600 underline text-[11px]"
  onClick={async () => {
    if (!confirm("Are you SURE you want to permanently delete this user?"))
      return;

    setDeletingId(s.id);
    await fetch("/api/users/delete", {
      method: "POST",
      body: JSON.stringify({ id: s.id }),
    });
    setDeletingId(null);
    await loadStaff();
  }}
  disabled={deletingId === s.id}
>
  {deletingId === s.id ? "Deleting…" : "Delete"}
</button>

                          </>
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
     
      {/* ======================= ADD USER MODAL ======================= */}


      {newUserModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-sm space-y-4">

            <h2 className="text-lg font-semibold">Add New User</h2>

            <input
              className="w-full border p-2 rounded text-sm"
              placeholder="Email"
              value={newUserForm.email}
              onChange={(e) =>
                setNewUserForm({ ...newUserForm, email: e.target.value })
              }
            />

            <input
              className="w-full border p-2 rounded text-sm"
              placeholder="Full Name"
              value={newUserForm.full_name}
              onChange={(e) =>
                setNewUserForm({ ...newUserForm, full_name: e.target.value })
              }
            />

            <select
              className="w-full border p-2 rounded text-sm bg-white"
              value={newUserForm.role}
              onChange={(e) =>
                setNewUserForm({
                  ...newUserForm,
                  role: e.target.value as StaffRole,
                })
              }
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="border px-3 py-1 rounded text-sm"
                onClick={() => setNewUserModalOpen(false)}
              >
                Cancel
              </button>

              <button
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                onClick={async () => {
                  setCreatingUser(true);

                  const res = await fetch("/api/users/create", {
                    method: "POST",
                    body: JSON.stringify(newUserForm),
                  });

                  setCreatingUser(false);

                  if (!res.ok) {
                    alert("Error creating user.");
                    return;
                  }

                  alert("User created!");

                  setNewUserModalOpen(false);
                  setNewUserForm({
                    email: "",
                    full_name: "",
                    role: "staff",
                  });

                  await loadStaff();
                }}
                disabled={creatingUser}
              >
                {creatingUser ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
