"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Deal = {
  id: string;
  ap_number: number | null;
  client_name: string | null;
  site_name: string | null;
  site_address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  enquiry_date: string | null;
  tender_return_date: string | null;
  created_at: string;
  company_id: string | null;
  stage: string | null;
  probability: string | null;

  // NEW fields
  salesperson: string | null; // legacy free-text from import
  salesperson_id: string | null; // FK to staff_profiles.id
};

type Company = {
  id: string;
  company_name: string;
  address_line1: string | null;
  address_line2: string | null;
  town_city: string | null;
  county: string | null;
  postcode: string | null;
};

type Staff = {
  id: string;
  full_name: string;
};

type CreateFormState = {
  site_name: string;
  site_address_line1: string;
  site_address_line2: string;
  site_address_line3: string;
  site_city: string;
  site_postcode: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  enquiry_date: string;
};

type NewCompanyState = {
  company_name: string;
  address_line1: string;
  address_line2: string;
  town_city: string;
  county: string;
  postcode: string;
};

type SortField =
  | "ap_number"
  | "client_name"
  | "site_name"
  | "stage"
  | "probability"
  | "enquiry_date";

const PAGE_SIZE = 15;
const STAGES = [
  "Received",
  "Qualified",
  "In Review",
  "Quote Submitted",
  "Won",
  "Lost",
  "No Tender",
];
const PROB_OPTIONS = ["A", "B", "C", "D"];

export default function DealsPage() {
  // Data
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  // Staff (for salesperson_id lookup & bulk assignment)
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [companyMode, setCompanyMode] = useState<"existing" | "new">("existing");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const [newCompany, setNewCompany] = useState<NewCompanyState>({
    company_name: "",
    address_line1: "",
    address_line2: "",
    town_city: "",
    county: "",
    postcode: "",
  });

  const [createForm, setCreateForm] = useState<CreateFormState>({
    site_name: "",
    site_address_line1: "",
    site_address_line2: "",
    site_address_line3: "",
    site_city: "",
    site_postcode: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    enquiry_date: "",
  });

  // Project / AP mode
  const [projectMode, setProjectMode] = useState<"new" | "existing">("new");
  const [existingAp, setExistingAp] = useState<string>("");

  // Filters
  const [searchAp, setSearchAp] = useState("");
  const [searchCompany, setSearchCompany] = useState("");
  const [searchSalesperson, setSearchSalesperson] = useState(""); // NEW
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [filterProb, setFilterProb] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("ap_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc"); // default: highest AP / latest at top

  // Bulk selection / update
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [bulkStage, setBulkStage] = useState<string>("");
  const [bulkProb, setBulkProb] = useState<string>("");
  const [bulkSalespersonId, setBulkSalespersonId] = useState<string>(""); // NEW
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  // -----------------------
  // Load data
  // -----------------------
  const loadDeals = async () => {
    setDealsLoading(true);
    setDealsError(null);

    const { data, error } = await supabase
      .from("deals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading deals:", error);
      setDealsError("Could not load leads.");
    } else {
      setDeals((data || []) as Deal[]);
    }
    setDealsLoading(false);
  };

  const loadCompanies = async () => {
    setCompaniesLoading(true);
    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, company_name, address_line1, address_line2, town_city, county, postcode"
      )
      .order("company_name", { ascending: true });

    if (error) {
      console.error("Error loading companies:", error);
    } else {
      setCompanies((data || []) as Company[]);
    }
    setCompaniesLoading(false);
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    setStaffError(null);

    const { data, error } = await supabase
      .from("staff_profiles")
      .select("id, full_name")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Error loading staff:", error);
      setStaffError("Could not load staff list.");
    } else {
      setStaff((data || []) as Staff[]);
    }
    setStaffLoading(false);
  };

  useEffect(() => {
    void loadDeals();
    void loadCompanies();
    void loadStaff();
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [
    searchAp,
    searchCompany,
    searchSalesperson,
    selectedStages,
    filterProb,
    dateFrom,
    dateTo,
  ]);

  // Clear selections for deals that no longer exist
  useEffect(() => {
    setSelectedDealIds((prev) =>
      prev.filter((id) => deals.some((d) => d.id === id))
    );
  }, [deals]);

  // -----------------------
  // Derived data
  // -----------------------
  // Unique AP options for selecting existing project
  const existingApOptions = useMemo(() => {
    const map = new Map<number, { ap_number: number; label: string }>();

    deals.forEach((d) => {
      if (d.ap_number != null) {
        if (!map.has(d.ap_number)) {
          map.set(d.ap_number, {
            ap_number: d.ap_number,
            label: `AP${d.ap_number} – ${
              d.site_name || d.client_name || d.site_address || "No description"
            }`,
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.ap_number - b.ap_number);
  }, [deals]);

  // Count deals per AP for multi-tender badge
  const apCounts = useMemo(() => {
    const map = new Map<number, number>();
    deals.forEach((d) => {
      if (d.ap_number != null) {
        map.set(d.ap_number, (map.get(d.ap_number) ?? 0) + 1);
      }
    });
    return map;
  }, [deals]);

  // -----------------------
  // Handlers
  // -----------------------
  const handleCreateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCreateForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleNewCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewCompany((prev) => ({ ...prev, [name]: value }));
  };

  const handleStageFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedStages(values);
  };

  const handleSort = (field: SortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevField;
      } else {
        setSortDir("desc"); // always start with highest / latest on top
        return field;
      }
    });
  };

  const toggleDealSelection = (id: string) => {
    setSelectedDealIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = (visibleDeals: Deal[]) => {
    const visibleIds = visibleDeals.map((d) => d.id);
    const allSelected = visibleIds.every((id) => selectedDealIds.includes(id));

    if (allSelected) {
      // Unselect all visible
      setSelectedDealIds((prev) =>
        prev.filter((id) => !visibleIds.includes(id))
      );
    } else {
      // Select all visible (plus any already selected)
      setSelectedDealIds((prev) => {
        const set = new Set(prev);
        visibleIds.forEach((id) => set.add(id));
        return Array.from(set);
      });
    }
  };

  const handleBulkApply = async () => {
    setBulkError(null);
    setBulkSuccess(null);

    if (!bulkStage && !bulkProb && !bulkSalespersonId) {
      setBulkError("Select a Stage and/or Probability and/or Salesperson to apply.");
      return;
    }

    if (selectedDealIds.length === 0) {
      setBulkError("Select at least one job to update.");
      return;
    }

    const updatePayload: Partial<Deal> = {};
    if (bulkStage) updatePayload.stage = bulkStage;
    if (bulkProb) updatePayload.probability = bulkProb;
    if (bulkSalespersonId) updatePayload.salesperson_id = bulkSalespersonId;

    try {
      setBulkUpdating(true);

      const { error } = await supabase
        .from("deals")
        .update(updatePayload)
        .in("id", selectedDealIds);

      if (error) {
        console.error("Bulk update error:", error);
        setBulkError("Could not update selected jobs.");
        return;
      }

      // Update in-memory state instantly
      setDeals((prev) =>
        prev.map((d) =>
          selectedDealIds.includes(d.id)
            ? {
                ...d,
                stage: bulkStage || d.stage,
                probability: bulkProb || d.probability,
                salesperson_id: bulkSalespersonId || d.salesperson_id,
              }
            : d
        )
      );

      setBulkSuccess("Updated selected jobs successfully.");
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);

    try {
      // -----------------------
      // 1) Resolve company
      // -----------------------
      let companyIdToUse: string | null = null;
      let companyNameForDeal: string | null = null;

      if (companyMode === "existing") {
        if (!selectedCompanyId) {
          setCreateError("Please select a company or choose 'Create new company'.");
          return;
        }
        companyIdToUse = selectedCompanyId;
        const existing = companies.find((c) => c.id === selectedCompanyId);
        companyNameForDeal = existing?.company_name ?? null;
      } else {
        // New company
        if (!newCompany.company_name.trim()) {
          setCreateError("Please enter a company name.");
          return;
        }

        const { data: insertedCompany, error: companyError } = await supabase
          .from("companies")
          .insert({
            company_name: newCompany.company_name.trim(),
            address_line1: newCompany.address_line1 || null,
            address_line2: newCompany.address_line2 || null,
            town_city: newCompany.town_city || null,
            county: newCompany.county || null,
            postcode: newCompany.postcode || null,
          })
          .select()
          .single();

        if (companyError || !insertedCompany) {
          console.error("Company insert error:", companyError);
          setCreateError("Could not create new company.");
          return;
        }

        const typedCompany = insertedCompany as Company;
        companyIdToUse = typedCompany.id;
        companyNameForDeal = typedCompany.company_name;

        // update local list so the new company appears in the dropdown
        setCompanies((prev) => [typedCompany, ...prev]);
      }

      // -----------------------
      // 2) Build site address string
      // -----------------------
      const siteAddressParts = [
        createForm.site_address_line1,
        createForm.site_address_line2,
        createForm.site_address_line3,
        createForm.site_city,
        createForm.site_postcode,
      ].filter(Boolean);
      const fullSiteAddress = siteAddressParts.join(", ");

      // -----------------------
      // 3) Build insert payload (handle new vs existing AP)
      // -----------------------
      type DealInsert = {
        company_id: string | null;
        client_name: string | null;
        site_name: string | null;
        site_address: string | null;
        contact_name: string | null;
        contact_email: string | null;
        contact_phone: string | null;
        enquiry_date: string | null;
        stage: string | null;
        probability: string | null;
        ap_number?: number;
      };

      const payload: DealInsert = {
        company_id: companyIdToUse,
        client_name: companyNameForDeal,
        site_name: createForm.site_name || null,
        site_address: fullSiteAddress || null,
        contact_name: createForm.contact_name || null,
        contact_email: createForm.contact_email || null,
        contact_phone: createForm.contact_phone || null,
        enquiry_date: createForm.enquiry_date || null,
        stage: "Received",
        probability: null,
      };

      // If this lead is for an existing AP, attach that ap_number explicitly
      if (projectMode === "existing") {
        if (!existingAp) {
          setCreateError("Please select an existing AP number or choose 'New project'.");
          return;
        }
        payload.ap_number = Number(existingAp);
      }
      // If projectMode === "new", the database will assign the next AP automatically.

      const { data: insertedDeal, error: dealError } = await supabase
        .from("deals")
        .insert(payload)
        .select()
        .single();

      if (dealError || !insertedDeal) {
        console.error("Deal insert error:", dealError);
        setCreateError("Could not create lead.");
        return;
      }

      // -----------------------
      // 4) Reset form + update in-memory lists
      // -----------------------
      setCreateForm({
        site_name: "",
        site_address_line1: "",
        site_address_line2: "",
        site_address_line3: "",
        site_city: "",
        site_postcode: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        enquiry_date: "",
      });
      setCompanyMode("existing");
      setSelectedCompanyId("");
      setNewCompany({
        company_name: "",
        address_line1: "",
        address_line2: "",
        town_city: "",
        county: "",
        postcode: "",
      });
      setProjectMode("new");
      setExistingAp("");

      setDeals((prev) => [insertedDeal as Deal, ...prev]);
      setShowCreate(false);
    } finally {
      setCreateLoading(false);
    }
  };

  // -----------------------
  // Filtering, sorting & pagination
  // -----------------------
  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (searchAp.trim()) {
        const apStr = String(d.ap_number ?? "");
        if (!apStr.includes(searchAp.trim())) return false;
      }

      if (searchCompany.trim()) {
        const name = (d.client_name || "").toLowerCase();
        if (!name.includes(searchCompany.trim().toLowerCase())) return false;
      }

      // Salesperson (text) filter
      if (searchSalesperson.trim()) {
        const sp = (d.salesperson || "").toLowerCase();
        if (!sp.includes(searchSalesperson.trim().toLowerCase())) return false;
      }

      if (selectedStages.length > 0) {
        if (!d.stage || !selectedStages.includes(d.stage)) return false;
      }

      if (filterProb && d.probability !== filterProb) return false;

      if (dateFrom) {
        if (!d.enquiry_date) return false;
        if (new Date(d.enquiry_date) < new Date(dateFrom)) return false;
      }

      if (dateTo) {
        if (!d.enquiry_date) return false;
        if (new Date(d.enquiry_date) > new Date(dateTo)) return false;
      }

      return true;
    });
  }, [
    deals,
    searchAp,
    searchCompany,
    searchSalesperson,
    selectedStages,
    filterProb,
    dateFrom,
    dateTo,
  ]);

  const sortedFilteredDeals = useMemo(() => {
    const dirFactor = sortDir === "asc" ? 1 : -1;

    const compareString = (a: string | null, b: string | null) => {
      const aVal = (a || "").toLowerCase();
      const bVal = (b || "").toLowerCase();
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      return 0;
    };

    const compareDate = (a: string | null, b: string | null) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      const aTime = new Date(a).getTime();
      const bTime = new Date(b).getTime();
      if (aTime < bTime) return -1;
      if (aTime > bTime) return 1;
      return 0;
    };

    const compareAp = (a: Deal, b: Deal) => {
      const aAp = a.ap_number;
      const bAp = b.ap_number;

      if (aAp == null && bAp == null) {
        // Fallback to created_at desc when both null
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      if (aAp == null) return 1;
      if (bAp == null) return -1;

      if (aAp === bAp) {
        // Same AP: most recently created first
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      return (aAp - bAp) * dirFactor;
    };

    return [...filteredDeals].sort((a, b) => {
      let base = 0;

      switch (sortField) {
        case "ap_number":
          base = compareAp(a, b);
          break;
        case "client_name":
          base = compareString(a.client_name, b.client_name) * dirFactor;
          break;
        case "site_name":
          base = compareString(a.site_name, b.site_name) * dirFactor;
          break;
        case "stage":
          base = compareString(a.stage, b.stage) * dirFactor;
          break;
        case "probability":
          base = compareString(a.probability, b.probability) * dirFactor;
          break;
        case "enquiry_date":
          base = compareDate(a.enquiry_date, b.enquiry_date) * dirFactor;
          break;
        default:
          base = 0;
      }

      if (base !== 0) return base;

      // Final tiebreaker: created_at desc (most recent first)
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [filteredDeals, sortField, sortDir]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedFilteredDeals.length / PAGE_SIZE)
  );

  const visibleDeals = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    return sortedFilteredDeals.slice(startIndex, endIndex);
  }, [sortedFilteredDeals, page]);

  // -----------------------
  // Helpers
  // -----------------------
  const formatDate = (v: string | null) =>
    v ? new Date(v).toLocaleDateString() : "—";

  const resetFilters = () => {
    setSearchAp("");
    setSearchCompany("");
    setSearchSalesperson("");
    setSelectedStages([]);
    setFilterProb("");
    setDateFrom("");
    setDateTo("");
  };

  const activeSortArrow = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? "▲" : "▼") : "⇵";

  const allVisibleSelected =
    visibleDeals.length > 0 &&
    visibleDeals.every((d) => selectedDealIds.includes(d.id));

  const getStaffNameById = (id: string | null) => {
    if (!id) return "—";
    const match = staff.find((s) => s.id === id);
    return match ? match.full_name : "Unknown";
  };

  // -----------------------
  // RENDER
  // -----------------------
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads / Projects</h1>
          <p className="text-sm text-gray-500">
            Create new opportunities and manage your tender pipeline.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((prev) => !prev)}
          className="inline-flex items-center rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
        >
          {showCreate ? "Close form" : "New Lead / Project"}
        </button>
      </div>

      {/* Create Lead / Project */}
      {showCreate && (
        <form
          onSubmit={handleCreateLead}
          className="space-y-6 rounded border bg-white p-4 shadow-sm"
        >
          {createError && (
            <p className="mb-2 text-sm text-red-600">{createError}</p>
          )}

          {/* Company */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-800">
              Company
            </h2>

            <div className="mb-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  value="existing"
                  checked={companyMode === "existing"}
                  onChange={() => setCompanyMode("existing")}
                />
                <span>Use existing company</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  value="new"
                  checked={companyMode === "new"}
                  onChange={() => setCompanyMode("new")}
                />
                <span>Create new company</span>
              </label>
            </div>

            {companyMode === "existing" ? (
              <div className="max-w-lg">
                <label className="mb-1 block text-xs text-gray-600">
                  Select company
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  disabled={companiesLoading}
                  className="w-full rounded border px-2 py-2 text-sm"
                >
                  <option value="">Select company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    Company name *
                  </label>
                  <input
                    name="company_name"
                    value={newCompany.company_name}
                    onChange={handleNewCompanyChange}
                    className="w-full rounded border px-2 py-2 text-sm"
                    placeholder="e.g. Abbey Pynford Limited"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Address line 1
                    </label>
                    <input
                      name="address_line1"
                      value={newCompany.address_line1}
                      onChange={handleNewCompanyChange}
                      className="w-full rounded border px-2 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Address line 2
                    </label>
                    <input
                      name="address_line2"
                      value={newCompany.address_line2}
                      onChange={handleNewCompanyChange}
                      className="w-full rounded border px-2 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Town / City
                    </label>
                    <input
                      name="town_city"
                      value={newCompany.town_city}
                      onChange={handleNewCompanyChange}
                      className="w-full rounded border px-2 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      County
                    </label>
                    <input
                      name="county"
                      value={newCompany.county}
                      onChange={handleNewCompanyChange}
                      className="w-full rounded border px-2 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Postcode
                    </label>
                    <input
                      name="postcode"
                      value={newCompany.postcode}
                      onChange={handleNewCompanyChange}
                      className="w-full rounded border px-2 py-2 text-sm"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  These details will be saved into the Companies table and
                  linked to this lead.
                </p>
              </div>
            )}
          </section>

          {/* Project (AP number) */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-800">
              Project (AP number)
            </h2>

            <div className="mb-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  value="new"
                  checked={projectMode === "new"}
                  onChange={() => {
                    setProjectMode("new");
                    setExistingAp("");
                  }}
                />
                <span>New project (new AP number)</span>
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  value="existing"
                  checked={projectMode === "existing"}
                  onChange={() => setProjectMode("existing")}
                />
                <span>Enquiry for existing AP number</span>
              </label>
            </div>

            {projectMode === "existing" && (
              <div className="max-w-lg">
                <label className="mb-1 block text-xs text-gray-600">
                  Select existing AP (project)
                </label>
                <select
                  value={existingAp}
                  onChange={(e) => setExistingAp(e.target.value)}
                  className="w-full rounded border px-2 py-2 text-sm"
                >
                  <option value="">Select AP…</option>
                  {existingApOptions.map((opt) => (
                    <option key={opt.ap_number} value={opt.ap_number}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Use this when another company is tendering on the same scheme
                  and should share the AP number.
                </p>
              </div>
            )}

            {projectMode === "new" && (
              <p className="text-xs text-gray-500">
                A new AP number will be assigned automatically when this lead is
                created.
              </p>
            )}
          </section>

          {/* Site */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-800">Site</h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-gray-600">
                  Site name
                </label>
                <input
                  name="site_name"
                  value={createForm.site_name}
                  onChange={handleCreateChange}
                  className="w-full rounded border px-2 py-2 text-sm"
                  placeholder="e.g. Oak Farm, Phase 2"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    Address line 1
                  </label>
                  <input
                    name="site_address_line1"
                    value={createForm.site_address_line1}
                    onChange={handleCreateChange}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    Address line 2
                  </label>
                  <input
                    name="site_address_line2"
                    value={createForm.site_address_line2}
                    onChange={handleCreateChange}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    Address line 3
                  </label>
                  <input
                    name="site_address_line3"
                    value={createForm.site_address_line3}
                    onChange={handleCreateChange}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    Town / City
                  </label>
                  <input
                    name="site_city"
                    value={createForm.site_city}
                    onChange={handleCreateChange}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    Postcode
                  </label>
                  <input
                    name="site_postcode"
                    value={createForm.site_postcode}
                    onChange={handleCreateChange}
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-800">
              Contact
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-600">
                  Contact name
                </label>
                <input
                  name="contact_name"
                  value={createForm.contact_name}
                  onChange={handleCreateChange}
                  className="w-full rounded border px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600">
                  Contact email
                </label>
                <input
                  name="contact_email"
                  type="email"
                  value={createForm.contact_email}
                  onChange={handleCreateChange}
                  className="w-full rounded border px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600">
                  Contact phone
                </label>
                <input
                  name="contact_phone"
                  value={createForm.contact_phone}
                  onChange={handleCreateChange}
                  className="w-full rounded border px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600">
                  Enquiry date
                </label>
                <input
                  name="enquiry_date"
                  type="date"
                  value={createForm.enquiry_date}
                  onChange={handleCreateChange}
                  className="w-full rounded border px-2 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createLoading}
              className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {createLoading ? "Creating…" : "Create Lead / Project"}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-800">
          Search & Filters
        </h2>

        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              AP number
            </label>
            <input
              value={searchAp}
              onChange={(e) => setSearchAp(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
              placeholder="e.g. 28124"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Company
            </label>
            <input
              value={searchCompany}
              onChange={(e) => setSearchCompany(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
              placeholder="Search by client / company"
            />
          </div>

          {/* NEW: Salesperson (text) filter */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Salesperson (text)
            </label>
            <input
              value={searchSalesperson}
              onChange={(e) => setSearchSalesperson(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
              placeholder="Search by legacy salesperson text"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Stage (multi-select)
            </label>
            <select
              multiple
              value={selectedStages}
              onChange={handleStageFilterChange}
              className="h-[90px] w-full rounded border px-2 py-2 text-sm"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-500">
              Hold Ctrl (Windows) or Cmd (Mac) to select multiple stages. Leave
              empty for all stages.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Probability
            </label>
            <select
              value={filterProb}
              onChange={(e) => setFilterProb(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
            >
              <option value="">All</option>
              {PROB_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Enquiry date from
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Enquiry date to
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
            />
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

      {/* Leads table */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">
            Registered Leads / Projects
          </h2>
          <p className="text-xs text-gray-500">
            Showing {visibleDeals.length} of {sortedFilteredDeals.length} filtered
            result{sortedFilteredDeals.length === 1 ? "" : "s"}
          </p>
        </div>

        {(staffError || staffLoading) && (
          <p className="mb-2 text-[11px] text-gray-500">
            {staffError
              ? staffError
              : "Loading staff for salesperson view / bulk assign…"}
          </p>
        )}

        {/* Bulk update toolbar */}
        {selectedDealIds.length > 0 && (
          <div className="mb-3 flex flex-col gap-2 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="font-semibold">
                {selectedDealIds.length} job
                {selectedDealIds.length === 1 ? "" : "s"} selected
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] uppercase tracking-wide">
                  Stage
                </span>
                <select
                  value={bulkStage}
                  onChange={(e) => setBulkStage(e.target.value)}
                  className="rounded border bg-white px-2 py-1 text-xs"
                >
                  <option value="">(no change)</option>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] uppercase tracking-wide">
                  Prob.
                </span>
                <select
                  value={bulkProb}
                  onChange={(e) => setBulkProb(e.target.value)}
                  className="rounded border bg-white px-2 py-1 text-xs"
                >
                  <option value="">(no change)</option>
                  {PROB_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* NEW: bulk salesperson_id */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] uppercase tracking-wide">
                  Salesperson
                </span>
                <select
                  value={bulkSalespersonId}
                  onChange={(e) => setBulkSalespersonId(e.target.value)}
                  className="rounded border bg-white px-2 py-1 text-xs"
                  disabled={staffLoading || !!staffError}
                >
                  <option value="">(no change)</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleBulkApply}
                disabled={bulkUpdating}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {bulkUpdating ? "Updating…" : "Apply to selected"}
              </button>
            </div>
          </div>
        )}

        {bulkError && <p className="mb-2 text-xs text-red-600">{bulkError}</p>}
        {bulkSuccess && (
          <p className="mb-2 text-xs text-green-600">{bulkSuccess}</p>
        )}

        {dealsLoading ? (
          <p className="text-sm text-gray-500">Loading leads…</p>
        ) : dealsError ? (
          <p className="text-sm text-red-600">{dealsError}</p>
        ) : visibleDeals.length === 0 ? (
          <p className="text-sm text-gray-500">
            No leads match your filters. Try adjusting the search criteria.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={() => toggleSelectAllVisible(visibleDeals)}
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <button
                        type="button"
                        onClick={() => handleSort("ap_number")}
                        className="flex items-center gap-1"
                      >
                        <span>AP #</span>
                        <span className="text-[10px]">
                          {activeSortArrow("ap_number")}
                        </span>
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <button
                        type="button"
                        onClick={() => handleSort("client_name")}
                        className="flex items-center gap-1"
                      >
                        <span>Company</span>
                        <span className="text-[10px]">
                          {activeSortArrow("client_name")}
                        </span>
                      </button>
                    </th>

                    {/* NEW: Salesperson (text) */}
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Salesperson (text)
                    </th>

                    {/* NEW: Salesperson (assigned) */}
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Salesperson (assigned)
                    </th>

                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <button
                        type="button"
                        onClick={() => handleSort("site_name")}
                        className="flex items-center gap-1"
                      >
                        <span>Site</span>
                        <span className="text-[10px]">
                          {activeSortArrow("site_name")}
                        </span>
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <button
                        type="button"
                        onClick={() => handleSort("stage")}
                        className="flex items-center gap-1"
                      >
                        <span>Stage</span>
                        <span className="text-[10px]">
                          {activeSortArrow("stage")}
                        </span>
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <button
                        type="button"
                        onClick={() => handleSort("probability")}
                        className="flex items-center gap-1"
                      >
                        <span>Prob.</span>
                        <span className="text-[10px]">
                          {activeSortArrow("probability")}
                        </span>
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <button
                        type="button"
                        onClick={() => handleSort("enquiry_date")}
                        className="flex items-center gap-1"
                      >
                        <span>Enquiry date</span>
                        <span className="text-[10px]">
                          {activeSortArrow("enquiry_date")}
                        </span>
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {visibleDeals.map((d) => (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedDealIds.includes(d.id)}
                          onChange={() => toggleDealSelection(d.id)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {d.ap_number ? (
                          <div className="flex flex-col">
                            <span>{`AP${d.ap_number}`}</span>
                            {(() => {
                              const count = apCounts.get(d.ap_number!) ?? 0;
                              return count > 1 ? (
                                <span className="text-[10px] font-semibold text-amber-600">
                                  {count} tenders
                                </span>
                              ) : null;
                            })()}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2">
                        {d.client_name || "—"}
                      </td>

                      {/* Salesperson (text) */}
                      <td className="max-w-xs truncate px-3 py-2">
                        {d.salesperson || "—"}
                      </td>

                      {/* Salesperson (assigned / from salesperson_id) */}
                      <td className="max-w-xs truncate px-3 py-2">
                        {getStaffNameById(d.salesperson_id)}
                      </td>

                      <td className="max-w-xs truncate px-3 py-2">
                        {d.site_name || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {d.stage || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {d.probability || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {formatDate(d.enquiry_date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                        <Link
                          href={`/deals/detail?id=${d.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={page === totalPages}
                  className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
