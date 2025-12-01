"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useCurrentStaff, StaffRole } from "../components/useCurrentStaff";

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
  // Who am I?
  const {
    staff: currentStaff,
    loading: currentStaffLoading,
  } = useCurrentStaff();

  const isAdminOrManager =
    currentStaff &&
    (currentStaff.role === "admin" || currentStaff.role === "manager");

  // Local state for staff list
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    full_name: string;
    email: string;
    role: StaffRole;
    is_active: boolean;
  } | null>(null);

  // Load staff (only if admin/manager)
  const loadStaff = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("staff_profiles")
      .select("id, full_name, email, role, is_active, created_at")
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

  // Filtering
  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      if (roleFilter && s.role !== roleFilter) return false;

      if (activeFilter === "active" && !s.is_active) return false;
      if (activeFilter === "inactive" && s.is_active) return false;

      return true;
    });
  }, [staff, roleFilter, activeFilter]);

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

  const target = e.target as HTMLInputElement | HTMLSelectElement;
  const { name, value } = target;

  let fieldValue: string | boolean = value;

  // Narrow to checkbox input before using `checked`
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

    const { error } = await supabase
      .from("staff_profiles")
      .update({
        full_name: full_name.trim(),
        email: email.trim(),
        role,
        is_active,
      })
      .eq("id", editingId);

    if (error) {
      console.error("Error updating staff member:", error);
      setError("Could not save changes.");
    } else {
      setStaff((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? {
                ...s,
                full_name: full_name.trim(),
                email: email.trim(),
                role,
                is_active,
              }
            : s
        )
      );
      setEditingId(null);
      setEditForm(null);
    }

    setSavingId(null);
  };

  const formatDate = (v: string) =>
    v ? new Date(v).toLocaleDateString() : "—";

  // -----------------------
  // Permission gate
  // -----------------------
  if (currentStaffLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff admin</h1>
        <p className="mt-2 text-sm text-gray-500">
          Checking your permissions…
        </p>
      </div>
    );
  }

  if (!currentStaff || !isAdminOrManager) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff admin</h1>
        <p className="mt-2 text-sm text-gray-500">
          You do not have permission to view this page. If you believe this is an
          error, please contact an admin.
        </p>
      </div>
    );
  }

  // -----------------------
  // Main content (for admins/managers only)
  // -----------------------
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff admin</h1>
          <p className="text-sm text-gray-500">
            Manage internal users, their roles, and whether they’re active.
          </p>
        </div>
      </div>

      {/* Filters */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold text-gray-800">Filters</h2>

          <div className="flex flex-wrap gap-3 text-xs">
            <div>
              <label className="mb-1 block text-gray-600">Role</label>
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

            <div>
              <label className="mb-1 block text-gray-600">Active status</label>
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
              onClick={() => {
                setRoleFilter("");
                setActiveFilter("all");
              }}
              className="self-end text-xs text-gray-500 underline"
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
            Showing {filteredStaff.length} of {staff.length} staff member
            {staff.length === 1 ? "" : "s"}.
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
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Name
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Email
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Role
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Active
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Created
                  </th>
                  <th className="text-left p-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((s) => {
                  const isEditing = editingId === s.id;

                  return (
                    <tr key={s.id} className="border-b align-top">
                      {/* Name */}
                      <td className="p-2">
                        {isEditing && editForm ? (
                          <input
                            name="full_name"
                            value={editForm.full_name}
                            onChange={handleEditChange}
                            className="w-full rounded border px-2 py-1 text-xs bg-white text-gray-900"
                          />
                        ) : (
                          <div className="font-medium">{s.full_name}</div>
                        )}
                      </td>

                      {/* Email */}
                      <td className="p-2">
                        {isEditing && editForm ? (
                          <input
                            name="email"
                            type="email"
                            value={editForm.email}
                            onChange={handleEditChange}
                            className="w-full rounded border px-2 py-1 text-xs bg-white text-gray-900"
                          />
                        ) : (
                          <div className="text-xs text-gray-700">{s.email}</div>
                        )}
                      </td>

                      {/* Role */}
                      <td className="p-2">
                        {isEditing && editForm ? (
                          <select
                            name="role"
                            value={editForm.role}
                            onChange={handleEditChange}
                            className="rounded border px-2 py-1 text-xs bg-white text-gray-900"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                            {ROLE_OPTIONS.find((r) => r.value === s.role)?.label ??
                              s.role}
                          </span>
                        )}
                      </td>

                      {/* Active */}
                      <td className="p-2">
                        {isEditing && editForm ? (
                          <label className="inline-flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              name="is_active"
                              checked={editForm.is_active}
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
                      <td className="p-2 text-xs">{formatDate(s.created_at)}</td>

                      {/* Actions */}
                      <td className="p-2 text-xs">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={savingId === s.id}
                              className="rounded bg-green-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                            >
                              {savingId === s.id ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="rounded border px-3 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(s)}
                            className="rounded border px-3 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                          >
                            Edit
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
