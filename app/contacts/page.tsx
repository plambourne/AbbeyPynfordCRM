"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  company_id: string | null;
  company_name: string | null;
};

type Company = {
  id: string;
  company_name: string;
};

const GROUPS_PAGE_SIZE = 10;

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);

  // Add contact form
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company_id: "",
  });

  // Search filters
  const [searchName, setSearchName] = useState("");
  const [searchContact, setSearchContact] = useState("");
  const [searchCompany, setSearchCompany] = useState(""); // NEW

  // Pagination
  const [page, setPage] = useState(1);

  // Edit contact
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company_id: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // -------------------------------
  // Load data
  // -------------------------------

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    const { data, error } = await supabase
      .from("companies")
      .select("id, company_name")
      .order("company_name", { ascending: true });

    if (error) {
      console.error(error);
    } else {
      setCompanies((data || []) as Company[]);
    }
    setLoadingCompanies(false);
  };

  const loadContacts = async () => {
    setLoadingContacts(true);
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, email, phone, status, company_id, companies ( company_name )"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError(error.message);
      setLoadingContacts(false);
      return;
    }

    const mapped: Contact[] =
      (data || []).map((row: any) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        company_id: row.company_id,
        company_name: row.companies?.company_name || null,
      })) ?? [];

    setContacts(mapped);
    setError(null);
    setLoadingContacts(false);
  };

  useEffect(() => {
    void loadCompanies();
    void loadContacts();
  }, []);

  // Reset pagination when filters or contact list length changes
  useEffect(() => {
    setPage(1);
  }, [searchName, searchContact, searchCompany, contacts.length]);

  // -------------------------------
  // Handlers – Add contact
  // -------------------------------

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: "lead",
        company_id: form.company_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setError(error.message);
    } else if (data) {
      const companyName =
        companies.find((c) => c.id === data.company_id)?.company_name || null;

      setContacts((prev) => [
        {
          id: data.id,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone: data.phone,
          status: data.status,
          company_id: data.company_id,
          company_name: companyName,
        },
        ...prev,
      ]);

      setForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        company_id: "",
      });

      setShowForm(false);
    }

    setSaving(false);
  };

  // -------------------------------
  // Handlers – Edit contact
  // -------------------------------

  const startEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setEditForm({
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email || "",
      phone: contact.phone || "",
      company_id: contact.company_id || "",
    });
    setEditError(null);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContactId) return;

    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      setEditError("First name and last name are required.");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    const { data, error } = await supabase
      .from("contacts")
      .update({
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        company_id: editForm.company_id || null,
      })
      .eq("id", editingContactId)
      .select()
      .single();

    if (error) {
      console.error(error);
      setEditError(error.message);
    } else if (data) {
      const companyName =
        companies.find((c) => c.id === data.company_id)?.company_name || null;

      setContacts((prev) =>
        prev.map((c) =>
          c.id === editingContactId
            ? {
                id: data.id,
                first_name: data.first_name,
                last_name: data.last_name,
                email: data.email,
                phone: data.phone,
                status: data.status,
                company_id: data.company_id,
                company_name: companyName,
              }
            : c
        )
      );
      setEditingContactId(null);
    }

    setEditSaving(false);
  };

  const handleCancelEdit = () => {
    setEditingContactId(null);
    setEditError(null);
  };

  // -------------------------------
  // Derived: filtering, grouping, pagination
  // -------------------------------

  const filteredContacts = contacts.filter((c) => {
    const nameTerm = searchName.trim().toLowerCase();
    const contactTerm = searchContact.trim().toLowerCase();
    const companyTerm = searchCompany.trim().toLowerCase(); // NEW

    if (nameTerm) {
      const fullName = `${c.first_name || ""} ${c.last_name || ""}`
        .toLowerCase()
        .trim();
      if (!fullName.includes(nameTerm)) return false;
    }

    if (contactTerm) {
      const email = (c.email || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      if (!email.includes(contactTerm) && !phone.includes(contactTerm)) {
        return false;
      }
    }

    if (companyTerm) {
      const compName = (c.company_name || "unassigned").toLowerCase();
      if (!compName.includes(companyTerm)) return false;
    }

    return true;
  });

  // Group contacts by company name
  const grouped = filteredContacts.reduce<Record<string, Contact[]>>(
    (acc, c) => {
      const key = c.company_name || "Unassigned";
      if (!acc[key]) acc[key] = [];
      acc[key].push(c);
      return acc;
    },
    {}
  );

  const sortedCompanyNames = Object.keys(grouped).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  const totalGroups = sortedCompanyNames.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / GROUPS_PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);

  const visibleCompanyNames = sortedCompanyNames.slice(
    (clampedPage - 1) * GROUPS_PAGE_SIZE,
    clampedPage * GROUPS_PAGE_SIZE
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header with toggle button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">Contacts</h1>
          <p className="text-sm text-gray-500">
            Contacts linked to companies and leads.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          {showForm ? "Close form" : "Add contact"}
        </button>
      </div>

      {/* Add contact (toggleable) */}
      {showForm && (
        <div className="mb-4 bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-3">Add Contact</h2>
          {error && <p className="text-red-600 mb-2">Error: {error}</p>}
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <input
              name="first_name"
              placeholder="First name"
              value={form.first_name}
              onChange={handleChange}
              required
              className="border p-2 rounded bg-white text-gray-900"
            />
            <input
              name="last_name"
              placeholder="Last name"
              value={form.last_name}
              onChange={handleChange}
              required
              className="border p-2 rounded bg-white text-gray-900"
            />
            <input
              name="email"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="border p-2 rounded bg-white text-gray-900"
            />
            <input
              name="phone"
              placeholder="Phone"
              value={form.phone}
              onChange={handleChange}
              className="border p-2 rounded bg-white text-gray-900"
            />

            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">
                Company (optional)
              </label>
              <select
                name="company_id"
                value={form.company_id}
                onChange={handleChange}
                disabled={loadingCompanies}
                className="border p-2 rounded bg-white text-gray-900 w-full text-sm"
              >
                <option value="">
                  {loadingCompanies
                    ? "Loading companies..."
                    : "Unassigned"}
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="col-span-1 md:col-span-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Add Contact"}
            </button>
          </form>
        </div>
      )}

      {/* Grouped contact list */}
      <div className="bg-white p-4 rounded shadow">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">Contact List</h2>

          {/* Search filters */}
          <div className="flex flex-col md:flex-row gap-3 text-xs md:text-sm">
            <div className="flex flex-col">
              <span className="text-gray-600 mb-1">Search name</span>
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="First or last name"
                className="border rounded px-2 py-1 bg-white text-gray-900 w-56"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-gray-600 mb-1">Search contact</span>
              <input
                type="text"
                value={searchContact}
                onChange={(e) => setSearchContact(e.target.value)}
                placeholder="Email or phone"
                className="border rounded px-2 py-1 bg-white text-gray-900 w-56"
              />
            </div>
            {/* NEW: Company search */}
            <div className="flex flex-col">
              <span className="text-gray-600 mb-1">Search company</span>
              <input
                type="text"
                value={searchCompany}
                onChange={(e) => setSearchCompany(e.target.value)}
                placeholder="Company name"
                className="border rounded px-2 py-1 bg-white text-gray-900 w-56"
              />
            </div>
          </div>
        </div>

        {loadingContacts ? (
          <p>Loading contacts...</p>
        ) : filteredContacts.length === 0 ? (
          <p>
            No contacts match your filters. Adjust name/contact/company search
            or add a new contact.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {visibleCompanyNames.map((companyName) => (
                <details
                  key={companyName}
                  className="border rounded"
                  // all collapsed by default
                >
                  <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-sm bg-gray-50">
                    <span className="font-semibold">
                      {companyName === "Unassigned"
                        ? "No company"
                        : companyName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {grouped[companyName].length} contact
                      {grouped[companyName].length === 1 ? "" : "s"}
                    </span>
                  </summary>
                  <div className="p-3 bg-white">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Name</th>
                          <th className="text-left p-2">Email</th>
                          <th className="text-left p-2">Phone</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped[companyName].map((c) => (
                          <tr key={c.id} className="border-b">
                            <td className="p-2">
                              {c.first_name} {c.last_name}
                            </td>
                            <td className="p-2">{c.email || "—"}</td>
                            <td className="p-2">{c.phone || "—"}</td>
                            <td className="p-2 text-xs">
                              {c.status || "—"}
                            </td>
                            <td className="p-2 text-xs">
                              <button
                                type="button"
                                onClick={() => startEditContact(c)}
                                className="text-blue-600 underline"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
              <span>
                Showing{" "}
                {totalGroups === 0
                  ? 0
                  : (clampedPage - 1) * GROUPS_PAGE_SIZE + 1}{" "}
                –{" "}
                {Math.min(
                  clampedPage * GROUPS_PAGE_SIZE,
                  totalGroups
                )}{" "}
                of {totalGroups} company groups
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage <= 1}
                  className="px-2 py-1 border rounded disabled:opacity-40"
                >
                  Prev
                </button>
                <span>
                  Page {clampedPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={clampedPage >= totalPages}
                  className="px-2 py-1 border rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit contact panel */}
      {editingContactId && (
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-3">Edit contact</h2>
          {editError && (
            <p className="text-red-600 text-sm mb-2">{editError}</p>
          )}
          <form
            onSubmit={handleSaveContact}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
          >
            <input
              name="first_name"
              placeholder="First name"
              value={editForm.first_name}
              onChange={handleEditChange}
              required
              className="border p-2 rounded bg-white text-gray-900"
            />
            <input
              name="last_name"
              placeholder="Last name"
              value={editForm.last_name}
              onChange={handleEditChange}
              required
              className="border p-2 rounded bg-white text-gray-900"
            />
            <input
              name="email"
              placeholder="Email"
              type="email"
              value={editForm.email}
              onChange={handleEditChange}
              className="border p-2 rounded bg-white text-gray-900"
            />
            <input
              name="phone"
              placeholder="Phone"
              value={editForm.phone}
              onChange={handleEditChange}
              className="border p-2 rounded bg-white text-gray-900"
            />

            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">
                Company (optional)
              </label>
              <select
                name="company_id"
                value={editForm.company_id}
                onChange={handleEditChange}
                disabled={loadingCompanies}
                className="border p-2 rounded bg-white text-gray-900 w-full text-sm"
              >
                <option value="">
                  {loadingCompanies
                    ? "Loading companies..."
                    : "Unassigned"}
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={editSaving}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60 text-sm"
              >
                {editSaving ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 rounded border text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
