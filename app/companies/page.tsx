"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Company = {
  id: string;
  company_name: string;
  address_line1: string | null;
  address_line2: string | null;
  town_city: string | null;
  county: string | null;
  postcode: string | null;
  created_at: string;
  parent_company_id: string | null;
};

type Deal = {
  id: string;
  ap_number: number | null;
  company_id: string | null;
  contact_name: string | null;
  site_address: string | null;
  enquiry_date: string | null;
  tender_return_date: string | null;
  stage: string | null;
  probability: string | null;
  tender_value: number | string | null; // numeric in DB, comes back as string
};

const PROB_COLORS: Record<string, string> = {
  A: "bg-green-500",
  B: "bg-blue-500",
  C: "bg-orange-500",
  D: "bg-red-500",
};

const STAGES = [
  "Received",
  "Qualified",
  "In Review",
  "Quote Submitted",
  "Won",
  "Lost",
  "No Tender",
];

const STAGE_COLORS_HEX: Record<string, string> = {
  Received: "#3b82f6",
  Qualified: "#22c55e",
  "In Review": "#f97316",
  "Quote Submitted": "#6366f1",
  Won: "#16a34a",
  Lost: "#ef4444",
  "No Tender": "#6b7280",
};

const PROB_OPTIONS = ["A", "B", "C", "D"] as const;

// Probability → weighting for expected value (for non-won/non-lost)
const PROB_WEIGHTS: Record<string, number> = {
  A: 0.75,
  B: 0.5,
  C: 0.25,
  D: 0.1,
};

// Pagination sizes
const COMPANIES_PAGE_SIZE = 20;
const GROUPS_PAGE_SIZE = 10;

// --- helpers for numeric tender_value ---

const toNumber = (
  value: number | string | null | undefined
): number => {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(n) ? 0 : n;
};

const sumTenderValue = (ds: Deal[]) =>
  ds.reduce((sum, d) => sum + toNumber(d.tender_value), 0);

const formatCurrency = (
  value: number | string | null | undefined
): string => {
  const n = toNumber(value);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
};

// Expected-value weight per deal:
// - Won       -> 1 (100%)
// - Lost      -> 0
// - No Tender -> 0
// - Otherwise -> A/B/C/D weight (or 0 if none)
const getDealWeight = (deal: Deal): number => {
  const stage = (deal.stage || "").toLowerCase();
  if (stage === "won") return 1;
  if (stage === "lost" || stage === "no tender") return 0;

  if (deal.probability && PROB_WEIGHTS[deal.probability]) {
    return PROB_WEIGHTS[deal.probability];
  }

  return 0;
};

// Build conic-gradient string for stage pie chart
const buildStagePieGradient = (
  stageSummary: { name: string; count: number }[]
) => {
  const total = stageSummary.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return "conic-gradient(#e5e7eb 0deg 360deg)";
  }

  let currentAngle = 0;
  const segments: string[] = [];

  stageSummary.forEach((s) => {
    if (s.count === 0) return;
    const angle = (s.count / total) * 360;
    const start = currentAngle;
    const end = currentAngle + angle;
    const color = STAGE_COLORS_HEX[s.name] || "#9ca3af";
    segments.push(`${color} ${start}deg ${end}deg`);
    currentAngle = end;
  });

  return `conic-gradient(${segments.join(", ")})`;
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(true);

  // Add company
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit company
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(
    null
  );
  const [editForm, setEditForm] = useState({
    company_name: "",
    address_line1: "",
    address_line2: "",
    town_city: "",
    county: "",
    postcode: "",
    parent_company_id: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(
    null
  );

  // Group view
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(
    null
  );

  // Toggle "Add Company" form
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);

  // Date range filter (applies to leads within companies)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Company search filter
  const [companySearch, setCompanySearch] = useState("");

  // Pagination state
  const [companyPage, setCompanyPage] = useState(1);
  const [groupPage, setGroupPage] = useState(1);

  const [form, setForm] = useState({
    company_name: "",
    address_line1: "",
    address_line2: "",
    town_city: "",
    county: "",
    postcode: "",
    parent_company_id: "",
  });

  // Load companies
  const loadCompanies = async () => {
    setLoadingCompanies(true);
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("company_name", { ascending: true });

    if (error) {
      console.error(error);
      setError(error.message);
    } else {
      setCompanies((data || []) as Company[]);
      setError(null);
    }

    setLoadingCompanies(false);
  };

  // Load deals (with tender_value)
  const loadDeals = async () => {
    setLoadingDeals(true);
    const { data, error } = await supabase
      .from("deals")
      .select(
        "id, ap_number, company_id, contact_name, site_address, enquiry_date, tender_return_date, stage, probability, tender_value"
      );

    if (error) {
      console.error(error);
    } else {
      setDeals((data || []) as Deal[]);
    }

    setLoadingDeals(false);
  };

  useEffect(() => {
    loadCompanies();
    loadDeals();
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setCompanyPage(1);
  }, [companySearch, dateFrom, dateTo, companies.length]);

  useEffect(() => {
    setGroupPage(1);
  }, [dateFrom, dateTo, companies.length]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim()) return;

    setSaving(true);
    setError(null);

    const { data, error } = await supabase
      .from("companies")
      .insert({
        company_name: form.company_name.trim(),
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim() || null,
        town_city: form.town_city.trim(),
        county: form.county.trim() || null,
        postcode: form.postcode.trim(),
        parent_company_id: form.parent_company_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setError(error.message);
    } else if (data) {
      setCompanies((prev) =>
        [...prev, data as Company].sort((a, b) =>
          a.company_name.localeCompare(b.company_name)
        )
      );
      setForm({
        company_name: "",
        address_line1: "",
        address_line2: "",
        town_city: "",
        county: "",
        postcode: "",
        parent_company_id: "",
      });
      setAddCompanyOpen(false);
    }

    setSaving(false);
  };

  // ---- EDIT COMPANY HANDLERS ----
  const startEditCompany = (company: Company) => {
    setEditingCompanyId(company.id);
    setEditForm({
      company_name: company.company_name || "",
      address_line1: company.address_line1 || "",
      address_line2: company.address_line2 || "",
      town_city: company.town_city || "",
      county: company.county || "",
      postcode: company.postcode || "",
      parent_company_id: company.parent_company_id || "",
    });
    setEditError(null);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompanyId) return;

    if (!editForm.company_name.trim()) {
      setEditError("Company name is required.");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    const { data, error } = await supabase
      .from("companies")
      .update({
        company_name: editForm.company_name.trim(),
        address_line1: editForm.address_line1.trim() || null,
        address_line2: editForm.address_line2.trim() || null,
        town_city: editForm.town_city.trim() || null,
        county: editForm.county.trim() || null,
        postcode: editForm.postcode.trim() || null,
        parent_company_id: editForm.parent_company_id || null,
      })
      .eq("id", editingCompanyId)
      .select()
      .single();

    if (error) {
      console.error(error);
      setEditError(error.message);
    } else if (data) {
      setCompanies((prev) =>
        prev
          .map((c) => (c.id === editingCompanyId ? (data as Company) : c))
          .sort((a, b) => a.company_name.localeCompare(b.company_name))
      );
      setEditingCompanyId(null);
    }

    setEditSaving(false);
  };

  const handleCancelEdit = () => {
    setEditingCompanyId(null);
    setEditError(null);
  };

  // Helper: date range filter applied to deals via enquiry_date
  const isWithinDateRange = (deal: Deal) => {
    if (!dateFrom && !dateTo) return true;
    if (!deal.enquiry_date) return false;

    const enquiry = new Date(deal.enquiry_date);
    if (Number.isNaN(enquiry.getTime())) return false;

    if (dateFrom) {
      const from = new Date(dateFrom);
      if (enquiry < from) return false;
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (enquiry > to) return false;
    }

    return true;
  };

  const dealsForCompany = (companyId: string) =>
    deals.filter((d) => d.company_id === companyId && isWithinDateRange(d));

  const getChildCompanies = (parentId: string) =>
    companies.filter((c) => c.parent_company_id === parentId);

  const dealsForCompanyAndChildren = (parentId: string) => {
    const childIds = getChildCompanies(parentId).map((c) => c.id);
    const ids = new Set<string>([parentId, ...childIds]);
    return deals.filter(
      (d) =>
        d.company_id !== null &&
        ids.has(d.company_id) &&
        isWithinDateRange(d)
    );
  };

  const formatAddress = (c: Company) =>
    [
      c.address_line1,
      c.address_line2,
      c.town_city,
      c.county,
      c.postcode,
    ]
      .filter(Boolean)
      .join(", ");

  // Filters & pagination for companies
  const filteredCompanies = companies.filter((c) => {
    const term = companySearch.trim().toLowerCase();
    if (!term) return true;
    const address = formatAddress(c).toLowerCase();
    return (
      c.company_name.toLowerCase().includes(term) ||
      address.includes(term)
    );
  });

  const totalCompanyPages = Math.max(
    1,
    Math.ceil(filteredCompanies.length / COMPANIES_PAGE_SIZE)
  );
  const clampedCompanyPage = Math.min(companyPage, totalCompanyPages);
  const visibleCompanies = filteredCompanies.slice(
    (clampedCompanyPage - 1) * COMPANIES_PAGE_SIZE,
    clampedCompanyPage * COMPANIES_PAGE_SIZE
  );

  // Parents that actually have child companies (groups)
  const allGroupParents = companies.filter((parent) =>
    companies.some((child) => child.parent_company_id === parent.id)
  );

  const totalGroupPages = Math.max(
    1,
    Math.ceil(allGroupParents.length / GROUPS_PAGE_SIZE)
  );
  const clampedGroupPage = Math.min(groupPage, totalGroupPages);
  const visibleGroupParents = allGroupParents.slice(
    (clampedGroupPage - 1) * GROUPS_PAGE_SIZE,
    clampedGroupPage * GROUPS_PAGE_SIZE
  );

  // CSV export (filtered deals)
const handleExportCsv = () => {
  const filteredDeals = deals.filter(isWithinDateRange);
  const headers = [
    "AP Number",
    "Company",
    "Parent Company",
    "Stage",
    "Probability",
    "Enquiry Date",
    "Tender Return Date",
    "Tender Value",
  ];

  const rows = filteredDeals.map((d) => {
    const company = companies.find((c) => c.id === d.company_id) ?? null;

    let parent: Company | null = null;
    if (company?.parent_company_id) {
      parent =
        companies.find((c) => c.id === company.parent_company_id) ?? null;
    }

    const ap = d.ap_number ? `AP${d.ap_number}` : "";
    const tenderVal = toNumber(d.tender_value);

    const fields = [
      ap,
      company?.company_name ?? "",
      parent?.company_name ?? "",
      d.stage ?? "",
      d.probability ?? "",
      d.enquiry_date ?? "",
      d.tender_return_date ?? "",
      tenderVal.toString(),
    ];

    return fields
      .map((f) => {
        const s = String(f ?? "");
        const escaped = s.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(",");
  });

  const csv = [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    `deals_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};


  return (
    <div>
      {/* Header with title + Add Company button */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Companies</h1>

        <button
          onClick={() => setAddCompanyOpen((open) => !open)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
        >
          {addCompanyOpen ? "Close form" : "Add new company"}
        </button>
      </div>

      {/* Add company (toggleable) */}
      {addCompanyOpen && (
        <div className="mb-8 bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Add Company</h2>
          {error && <p className="text-red-600 mb-2">Error: {error}</p>}

          <form
            onSubmit={handleAddCompany}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <input
              name="company_name"
              placeholder="Company Name"
              value={form.company_name}
              onChange={handleChange}
              required
              className="border p-2 rounded bg-white text-gray-900"
            />

            <input
              name="address_line1"
              placeholder="Address Line 1"
              value={form.address_line1}
              onChange={handleChange}
              required
              className="border p-2 rounded bg-white text-gray-900"
            />

            <input
              name="address_line2"
              placeholder="Address Line 2 (optional)"
              value={form.address_line2}
              onChange={handleChange}
              className="border p-2 rounded bg-white text-gray-900"
            />

            <input
              name="town_city"
              placeholder="Town / City"
              value={form.town_city}
              onChange={handleChange}
              required
              className="border p-2 rounded bg-white text-gray-900"
            />

            <input
              name="county"
              placeholder="County (optional)"
              value={form.county}
              onChange={handleChange}
              className="border p-2 rounded bg-white text-gray-900"
            />

            <input
              name="postcode"
              placeholder="Postcode"
              value={form.postcode}
              onChange={handleChange}
              required
              className="border p-2 rounded bg-white text-gray-900"
            />

            {/* Parent company selector */}
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">
                Parent Company (optional)
              </label>
              <select
                name="parent_company_id"
                value={form.parent_company_id}
                onChange={handleChange}
                className="border p-2 rounded bg-white text-gray-900 w-full text-sm"
              >
                <option value="">No parent (standalone)</option>
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
              className="md:col-span-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Add Company"}
            </button>
          </form>
        </div>
      )}

      {/* Company list card */}
      <div className="bg-white p-4 rounded shadow">
        {/* Header + filters */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">Company List</h2>

          <div className="flex flex-col md:flex-row gap-3 text-xs md:text-sm md:items-end">
            {/* Search filter */}
            <div className="flex flex-col">
              <span className="text-gray-600 mb-1">Search</span>
              <input
                type="text"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Search name or address"
                className="border rounded px-2 py-1 bg-white text-gray-900 w-56"
              />
            </div>

            {/* Date range filter */}
            <div className="flex gap-3">
              <div className="flex flex-col">
                <span className="text-gray-600 mb-1">Enquiry from</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border rounded px-2 py-1 bg-white text-gray-900"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-gray-600 mb-1">Enquiry to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border rounded px-2 py-1 bg-white text-gray-900"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1 md:items-end">
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-xs text-gray-500 underline"
              >
                Clear dates
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="text-xs bg-gray-800 text-white px-3 py-1 rounded"
              >
                Export CSV (filtered deals)
              </button>
            </div>
          </div>
        </div>

        {loadingCompanies ? (
          <p>Loading companies...</p>
        ) : filteredCompanies.length === 0 ? (
          <p>
            No companies match your filters. Try adjusting the search or date
            range.
          </p>
        ) : (
          <>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Company Name</th>
                  <th className="text-left p-2">Group</th>
                  <th className="text-left p-2">Address</th>
                  <th className="text-left p-2">Leads (in date range)</th>
                  <th className="text-left p-2">Total Value</th>
                  <th className="text-left p-2">Win rate</th>
                  <th className="text-left p-2">Expected Value</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCompanies.map((c) => {
                  const companyDeals = dealsForCompany(c.id);
                  const parent =
                    c.parent_company_id &&
                    companies.find((p) => p.id === c.parent_company_id);
                  const totalValue = sumTenderValue(companyDeals);
                  const wonValue = sumTenderValue(
                    companyDeals.filter(
                      (d) => (d.stage || "").toLowerCase() === "won"
                    )
                  );
                  const winRate =
                    totalValue > 0 ? wonValue / totalValue : null;
                  const expectedValue = companyDeals.reduce(
                    (sum, d) =>
                      sum +
                      toNumber(d.tender_value) * getDealWeight(d),
                    0
                  );

                  // data for inline expanded panel
                  const stageSummary = STAGES.map((s) => ({
                    name: s,
                    count: companyDeals.filter(
                      (d) => (d.stage || "Received") === s
                    ).length,
                  }));

                  const probSummary = PROB_OPTIONS.map((p) => ({
                    prob: p,
                    count: companyDeals.filter(
                      (d) => d.probability === p
                    ).length,
                  }));

                  const totalCompanyLeads = companyDeals.length;
                  const totalCompanyValue = totalValue;
                  const wonCompanyValue = wonValue;
                  const companyWinRate = winRate;
                  const expectedCompanyValue = expectedValue;

                  const pieGradient = buildStagePieGradient(stageSummary);

                  return (
                    <React.Fragment key={c.id}>
                      {/* main row */}
                      <tr className="border-b align-top">
                        <td className="p-2">{c.company_name}</td>
                        <td className="p-2">
                          {parent ? parent.company_name : "—"}
                        </td>
                        <td className="p-2">{formatAddress(c)}</td>
                        <td className="p-2">
                          {loadingDeals
                            ? "Loading..."
                            : `${companyDeals.length} lead(s)`}
                        </td>
                        <td className="p-2">
                          {loadingDeals
                            ? "…"
                            : formatCurrency(totalValue)}
                        </td>
                        <td className="p-2">
                          {loadingDeals
                            ? "…"
                            : companyWinRate == null
                            ? "—"
                            : `${Math.round(companyWinRate * 100)}%`}
                        </td>
                        <td className="p-2">
                          {loadingDeals
                            ? "…"
                            : formatCurrency(expectedValue)}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-col gap-1 text-xs">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCompanyId(
                                  expandedCompanyId === c.id ? null : c.id
                                )
                              }
                              className="text-blue-600 underline"
                            >
                              {expandedCompanyId === c.id
                                ? "Hide leads"
                                : "View leads"}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditCompany(c)}
                              className="text-gray-700 underline"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* inline expanded row */}
                      {expandedCompanyId === c.id && (
                        <tr className="bg-gray-50">
                          <td colSpan={8} className="p-3">
                            <h3 className="text-lg font-semibold mb-2">
                              Leads for {c.company_name}
                            </h3>

                            {/* Mini stats + pie chart */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                              {/* Total + stage chips + value */}
                              <div className="border rounded p-3 text-xs">
                                <div className="text-gray-500 mb-1">
                                  Total leads (in date range)
                                </div>
                                <div className="text-2xl font-bold mb-2">
                                  {totalCompanyLeads}
                                </div>

                                <div className="text-gray-500 mb-1">
                                  Total value
                                </div>
                                <div className="text-lg font-semibold mb-2">
                                  {formatCurrency(totalCompanyValue)}
                                </div>

                                <div className="text-gray-500 mb-1">
                                  Won value (by value)
                                </div>
                                <div className="text-sm mb-2">
                                  {formatCurrency(wonCompanyValue)}{" "}
                                  {companyWinRate != null &&
                                    `(${Math.round(
                                      companyWinRate * 100
                                    )}%)`}
                                </div>

                                <div className="text-gray-500 mb-1">
                                  Expected value
                                </div>
                                <div className="text-sm mb-2">
                                  {formatCurrency(expectedCompanyValue)}
                                </div>

                                <div className="flex flex-wrap gap-1 mt-2">
                                  {stageSummary.map((s) => (
                                    <span
                                      key={s.name}
                                      className="px-2 py-0.5 bg-gray-100 rounded"
                                    >
                                      {s.name}: {s.count}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Probability chips */}
                              <div className="border rounded p-3 text-xs">
                                <div className="text-gray-500 mb-1">
                                  By probability
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {probSummary.map((p) => (
                                    <span
                                      key={p.prob}
                                      className={`px-2 py-0.5 rounded text-white ${
                                        PROB_COLORS[p.prob] ||
                                        "bg-gray-400"
                                      }`}
                                    >
                                      {p.prob}: {p.count}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Stage pie chart */}
                              <div className="border rounded p-3 text-xs flex flex-col items-center justify-center">
                                <div className="text-gray-500 mb-2">
                                  Stage breakdown
                                </div>
                                <div
                                  className="w-28 h-28 md:w-32 md:h-32 rounded-full mb-2"
                                  style={{ backgroundImage: pieGradient }}
                                />
                                <div className="flex flex-wrap justify-center gap-2">
                                  {stageSummary
                                    .filter((s) => s.count > 0)
                                    .map((s) => (
                                      <div
                                        key={s.name}
                                        className="flex items-center gap-1"
                                      >
                                        <span
                                          className="w-2 h-2 rounded-full inline-block"
                                          style={{
                                            backgroundColor:
                                              STAGE_COLORS_HEX[s.name] ||
                                              "#9ca3af",
                                          }}
                                        />
                                        <span className="text-[11px]">
                                          {s.name}
                                        </span>
                                      </div>
                                    ))}
                                  {stageSummary.every(
                                    (s) => s.count === 0
                                  ) && (
                                    <span className="text-[11px] text-gray-400">
                                      No leads in range
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Leads table */}
                            {companyDeals.length === 0 ? (
                              <p className="text-sm text-gray-500">
                                No leads for this company in the selected
                                date range.
                              </p>
                            ) : (
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left p-2">
                                      AP No
                                    </th>
                                    <th className="text-left p-2">
                                      Stage
                                    </th>
                                    <th className="text-left p-2">
                                      Prob
                                    </th>
                                    <th className="text-left p-2">
                                      Value
                                    </th>
                                    <th className="text-left p-2">
                                      Contact
                                    </th>
                                    <th className="text-left p-2">
                                      Site Address
                                    </th>
                                    <th className="text-left p-2">
                                      Enquiry Date
                                    </th>
                                    <th className="text-left p-2">
                                      Tender Return Date
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {companyDeals.map((d) => (
                                    <tr key={d.id} className="border-b">
                                      {/* AP number – clickable into the lead card */}
                                      <td className="p-2">
                                        {d.ap_number ? (
                                          <Link
                                            href={`/deals/detail?id=${d.id}`}
                                            className="text-blue-600 underline"
                                          >
                                            {`AP${d.ap_number}`}
                                          </Link>
                                        ) : (
                                          "—"
                                        )}
                                      </td>

                                      {/* Stage */}
                                      <td className="p-2">
                                        <span className="inline-block text-xs px-2 py-1 rounded bg-gray-100">
                                          {d.stage || "Received"}
                                        </span>
                                      </td>

                                      {/* Probability */}
                                      <td className="p-2">
                                        {d.probability ? (
                                          <span
                                            className={`inline-block text-xs text-white px-2 py-1 rounded ${
                                              PROB_COLORS[
                                                d.probability as keyof typeof PROB_COLORS
                                              ] || "bg-gray-400"
                                            }`}
                                          >
                                            {d.probability}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-gray-400">
                                            -
                                          </span>
                                        )}
                                      </td>

                                      {/* Value */}
                                      <td className="p-2">
                                        {d.tender_value == null
                                          ? "—"
                                          : formatCurrency(
                                              d.tender_value
                                            )}
                                      </td>

                                      {/* Rest of fields */}
                                      <td className="p-2">
                                        {d.contact_name}
                                      </td>
                                      <td className="p-2">
                                        {d.site_address}
                                      </td>
                                      <td className="p-2">
                                        {d.enquiry_date
                                          ? new Date(
                                              d.enquiry_date
                                            ).toLocaleDateString()
                                          : ""}
                                      </td>
                                      <td className="p-2">
                                        {d.tender_return_date
                                          ? new Date(
                                              d.tender_return_date
                                            ).toLocaleDateString()
                                          : ""}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Company pagination */}
            <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
              <span>
                Showing{" "}
                {filteredCompanies.length === 0
                  ? 0
                  : (clampedCompanyPage - 1) * COMPANIES_PAGE_SIZE + 1}{" "}
                –{" "}
                {Math.min(
                  clampedCompanyPage * COMPANIES_PAGE_SIZE,
                  filteredCompanies.length
                )}{" "}
                of {filteredCompanies.length} companies
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCompanyPage((p) => Math.max(1, p - 1))
                  }
                  disabled={clampedCompanyPage <= 1}
                  className="px-2 py-1 border rounded disabled:opacity-40"
                >
                  Prev
                </button>
                <span>
                  Page {clampedCompanyPage} of {totalCompanyPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCompanyPage((p) =>
                      Math.min(totalCompanyPages, p + 1)
                    )
                  }
                  disabled={clampedCompanyPage >= totalCompanyPages}
                  className="px-2 py-1 border rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {/* Edit company panel */}
        {editingCompanyId && (
          <div className="mt-6 border-t pt-4">
            {(() => {
              const company = companies.find(
                (c) => c.id === editingCompanyId
              );
              if (!company) return null;

              return (
                <div className="mb-6 bg-gray-50 p-4 rounded">
                  <h3 className="text-lg font-semibold mb-3">
                    Edit company: {company.company_name}
                  </h3>
                  {editError && (
                    <p className="text-red-600 text-sm mb-2">
                      {editError}
                    </p>
                  )}

                  <form
                    onSubmit={handleSaveCompany}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
                  >
                    <input
                      name="company_name"
                      placeholder="Company Name"
                      value={editForm.company_name}
                      onChange={handleEditChange}
                      required
                      className="border p-2 rounded bg-white text-gray-900"
                    />

                    <input
                      name="address_line1"
                      placeholder="Address Line 1"
                      value={editForm.address_line1}
                      onChange={handleEditChange}
                      required
                      className="border p-2 rounded bg-white text-gray-900"
                    />

                    <input
                      name="address_line2"
                      placeholder="Address Line 2 (optional)"
                      value={editForm.address_line2}
                      onChange={handleEditChange}
                      className="border p-2 rounded bg-white text-gray-900"
                    />

                    <input
                      name="town_city"
                      placeholder="Town / City"
                      value={editForm.town_city}
                      onChange={handleEditChange}
                      className="border p-2 rounded bg-white text-gray-900"
                    />

                    <input
                      name="county"
                      placeholder="County (optional)"
                      value={editForm.county}
                      onChange={handleEditChange}
                      className="border p-2 rounded bg-white text-gray-900"
                    />

                    <input
                      name="postcode"
                      placeholder="Postcode"
                      value={editForm.postcode}
                      onChange={handleEditChange}
                      className="border p-2 rounded bg-white text-gray-900"
                    />

                    {/* Parent selector in edit */}
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-600 mb-1">
                        Parent Company (optional)
                      </label>
                      <select
                        name="parent_company_id"
                        value={editForm.parent_company_id}
                        onChange={handleEditChange}
                        className="border p-2 rounded bg-white text-gray-900 w-full text-sm"
                      >
                        <option value="">
                          No parent (standalone)
                        </option>
                        {companies
                          .filter((c) => c.id !== editingCompanyId)
                          .map((c) => (
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
              );
            })()}
          </div>
        )}
      </div>

      {/* Company Groups (parent + children, aggregated) */}
      {allGroupParents.length > 0 && (
        <div className="mt-8 bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Company Groups</h2>
          </div>

          {visibleGroupParents.length === 0 ? (
            <p className="text-sm text-gray-500">
              No company groups to show.
            </p>
          ) : (
            <>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Group (Parent)</th>
                    <th className="text-left p-2">Member Companies</th>
                    <th className="text-left p-2">
                      Total Leads (in date range)
                    </th>
                    <th className="text-left p-2">Total Value</th>
                    <th className="text-left p-2">Win rate</th>
                    <th className="text-left p-2">Expected Value</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGroupParents.map((parent) => {
                    const children = getChildCompanies(parent.id);
                    const groupDeals = dealsForCompanyAndChildren(
                      parent.id
                    );
                    const totalGroupValue = sumTenderValue(groupDeals);
                    const wonGroupValue = sumTenderValue(
                      groupDeals.filter(
                        (d) => (d.stage || "").toLowerCase() === "won"
                      )
                    );
                    const groupWinRate =
                      totalGroupValue > 0
                        ? wonGroupValue / totalGroupValue
                        : null;
                    const expectedGroupValue = groupDeals.reduce(
                      (sum, d) =>
                        sum +
                        toNumber(d.tender_value) * getDealWeight(d),
                      0
                    );

                    return (
                      <tr
                        key={parent.id}
                        className="border-b align-top"
                      >
                        <td className="p-2">{parent.company_name}</td>
                        <td className="p-2">
                          <ul className="list-disc list-inside">
                            {[parent, ...children].map((c) => (
                              <li key={c.id}>{c.company_name}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="p-2">{groupDeals.length}</td>
                        <td className="p-2">
                          {formatCurrency(totalGroupValue)}
                        </td>
                        <td className="p-2">
                          {groupWinRate == null
                            ? "—"
                            : `${Math.round(groupWinRate * 100)}%`}
                        </td>
                        <td className="p-2">
                          {formatCurrency(expectedGroupValue)}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedGroupId(
                                expandedGroupId === parent.id
                                  ? null
                                  : parent.id
                              )
                            }
                            className="text-blue-600 underline text-xs"
                          >
                            {expandedGroupId === parent.id
                              ? "Hide group details"
                              : "View group details"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Group pagination */}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                <span>
                  Showing{" "}
                  {allGroupParents.length === 0
                    ? 0
                    : (clampedGroupPage - 1) * GROUPS_PAGE_SIZE + 1}{" "}
                  –{" "}
                  {Math.min(
                    clampedGroupPage * GROUPS_PAGE_SIZE,
                    allGroupParents.length
                  )}{" "}
                  of {allGroupParents.length} groups
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setGroupPage((p) => Math.max(1, p - 1))
                    }
                    disabled={clampedGroupPage <= 1}
                    className="px-2 py-1 border rounded disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span>
                    Page {clampedGroupPage} of {totalGroupPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupPage((p) =>
                        Math.min(totalGroupPages, p + 1)
                      )
                    }
                    disabled={clampedGroupPage >= totalGroupPages}
                    className="px-2 py-1 border rounded disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Expanded group details */}
          {expandedGroupId && (
            <div className="mt-6 border-t pt-4">
              {(() => {
                const parent = allGroupParents.find(
                  (p) => p.id === expandedGroupId
                );
                if (!parent) return null;

                const children = getChildCompanies(parent.id);
                const groupDeals = dealsForCompanyAndChildren(
                  parent.id
                );

                const stageSummary = STAGES.map((s) => ({
                  name: s,
                  count: groupDeals.filter(
                    (d) => (d.stage || "Received") === s
                  ).length,
                }));

                const probSummary = PROB_OPTIONS.map((p) => ({
                  prob: p,
                  count: groupDeals.filter(
                    (d) => d.probability === p
                  ).length,
                }));

                const totalGroupLeads = groupDeals.length;
                const totalGroupValue = sumTenderValue(groupDeals);
                const wonGroupValue = sumTenderValue(
                  groupDeals.filter(
                    (d) => (d.stage || "").toLowerCase() === "won"
                  )
                );
                const groupWinRate =
                  totalGroupValue > 0
                    ? wonGroupValue / totalGroupValue
                    : null;
                const expectedGroupValue = groupDeals.reduce(
                  (sum, d) =>
                    sum +
                    toNumber(d.tender_value) * getDealWeight(d),
                  0
                );

                const pieGradient = buildStagePieGradient(stageSummary);

                return (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      Group details: {parent.company_name}
                    </h3>

                    <p className="text-xs text-gray-500 mb-3">
                      Members: {[parent, ...children]
                        .map((c) => c.company_name)
                        .join(", ")}
                    </p>

                    {/* Group stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 text-xs">
                      <div className="border rounded p-3">
                        <div className="text-gray-500 mb-1">
                          Total leads (in date range)
                        </div>
                        <div className="text-2xl font-bold mb-2">
                          {totalGroupLeads}
                        </div>
                        <div className="text-gray-500 mb-1">
                          Total value
                        </div>
                        <div className="text-lg font-semibold mb-2">
                          {formatCurrency(totalGroupValue)}
                        </div>
                        <div className="text-gray-500 mb-1">
                          Won value (by value)
                        </div>
                        <div className="text-sm mb-2">
                          {formatCurrency(wonGroupValue)}{" "}
                          {groupWinRate != null &&
                            `(${Math.round(groupWinRate * 100)}%)`}
                        </div>
                        <div className="text-gray-500 mb-1">
                          Expected value
                        </div>
                        <div className="text-sm mb-2">
                          {formatCurrency(expectedGroupValue)}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {stageSummary.map((s) => (
                            <span
                              key={s.name}
                              className="px-2 py-0.5 bg-gray-100 rounded"
                            >
                              {s.name}: {s.count}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="border rounded p-3">
                        <div className="text-gray-500 mb-1">
                          By probability
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {probSummary.map((p) => (
                            <span
                              key={p.prob}
                              className={`px-2 py-0.5 rounded text-white ${
                                PROB_COLORS[p.prob] || "bg-gray-400"
                              }`}
                            >
                              {p.prob}: {p.count}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="border rounded p-3 flex flex-col items-center justify-center">
                        <div className="text-gray-500 mb-2">
                          Stage breakdown
                        </div>
                        <div
                          className="w-28 h-28 md:w-32 md:h-32 rounded-full mb-2"
                          style={{ backgroundImage: pieGradient }}
                        />
                      </div>
                    </div>

                    {/* Member companies quick links */}
                    <div className="border rounded p-3 text-xs">
                      <div className="text-gray-500 mb-2">
                        Member companies
                      </div>
                      <ul className="space-y-1">
                        {[parent, ...children].map((c) => {
                          const companyDeals = dealsForCompany(c.id);
                          const count = companyDeals.length;
                          const value = sumTenderValue(companyDeals);

                          return (
                            <li
                              key={c.id}
                              className="flex items-center justify-between"
                            >
                              <span>{c.company_name}</span>
                              <span className="flex items-center gap-2">
                                <span className="text-gray-500">
                                  {count} lead(s) ·{" "}
                                  {formatCurrency(value)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedCompanyId(c.id)
                                  }
                                  className="text-blue-600 underline"
                                >
                                  View company leads
                                </button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
