"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";



/* ===============================
   CONSTANTS
================================= */

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


/* ===============================
   TYPES
================================= */

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
  created_at: string;
  company_id: string | null;
  stage: string | null;
  probability: string | null;

  salesperson: string | null;
  salesperson_id: string | null;

  works_category: string | null;
  works_subcategory: string | null;
};

type Company = {
  id: string;
  company_name: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_line3: string | null;
  town_city: string | null;
  county: string | null;
  postcode: string | null;
  parent_company_id: string | null;
  is_private_client: boolean | null;
};

type Staff = { id: string; full_name: string };
type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company_id: string;
};

/* ====================================================
   INLINE COMPANY CREATION PANEL
==================================================== */

function CreateCompanyPanel({
  onCreated,
  onCancel,
}: {
  onCreated: (company: Company) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    address_line3: "",
    town_city: "",
    county: "",
    postcode: "",
    parent_company_id: "",
    is_private_client: false,
  });

  const update = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.company_name.trim() || !form.address_line1.trim() || !form.town_city.trim()) {
      alert("Company name, address line 1 and town/city are required.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("companies")
      .insert({
        company_name: form.company_name.trim(),
        phone: form.phone || null,
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2 || null,
        address_line3: form.address_line3 || null,
        town_city: form.town_city.trim(),
        county: form.county || null,
        postcode: form.postcode || null,
        parent_company_id: form.parent_company_id || null,
        is_private_client: form.is_private_client,
      })
      .select("*")
      .single();

    if (error) {
      alert("Could not create company.");
      console.error(error);
      setLoading(false);
      return;
    }

    setLoading(false);
    onCreated(data as Company);
  };

  return (
    <div className="border rounded p-4 bg-gray-50 mt-3 space-y-4">
      <h3 className="font-semibold text-sm">Create New Company</h3>

      <input
        placeholder="Company name *"
        className="w-full border rounded px-2 py-1 text-sm"
        value={form.company_name}
        onChange={(e) => update("company_name", e.target.value)}
      />

      <input
        placeholder="Phone"
        className="w-full border rounded px-2 py-1 text-sm"
        value={form.phone}
        onChange={(e) => update("phone", e.target.value)}
      />

      <input
        placeholder="Address line 1 *"
        className="w-full border rounded px-2 py-1 text-sm"
        value={form.address_line1}
        onChange={(e) => update("address_line1", e.target.value)}
      />

      <input
        placeholder="Address line 2"
        className="w-full border rounded px-2 py-1 text-sm"
        value={form.address_line2}
        onChange={(e) => update("address_line2", e.target.value)}
      />

      <input
        placeholder="Address line 3"
        className="w-full border rounded px-2 py-1 text-sm"
        value={form.address_line3}
        onChange={(e) => update("address_line3", e.target.value)}
      />

      <input
        placeholder="Town/City *"
        className="w-full border rounded px-2 py-1 text-sm"
        value={form.town_city}
        onChange={(e) => update("town_city", e.target.value)}
      />

      <input
        placeholder="County *"
        className="w-full border rounded px-2 py-1 text-sm"
        value={form.county}
        onChange={(e) => update("county", e.target.value)}
      />

      <input
        placeholder="Postcode"
        className="w-full border rounded px-2 py-1 text-sm"
        value={form.postcode}
        onChange={(e) => update("postcode", e.target.value)}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_private_client}
          onChange={(e) => update("is_private_client", e.target.checked)}
        />
        Private Client?
      </label>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs border rounded hover:bg-gray-100"
        >
          Cancel
        </button>

        <button
          disabled={loading}
          onClick={submit}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Create Company"}
        </button>
      </div>
    </div>
  );
}

/* ====================================================
   CREATE LEAD FORM (START)
==================================================== */
function CreateLeadForm({
  companies,
  staff,
  onCreated,
}: {
  companies: Company[];
  staff: Staff[];
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [showCompanyPanel, setShowCompanyPanel] = useState(false);

  const [apNumber, setApNumber] = useState<number | null>(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");

  const [newContact, setNewContact] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [enquiryDate, setEnquiryDate] = useState("");
  const [salespersonId, setSalespersonId] = useState("");

  const [worksCategory, setWorksCategory] = useState("");
  const [worksSubcategory, setWorksSubcategory] = useState("");
  /* -----------------------------
     Load next AP number
  ------------------------------ */
  useEffect(() => {
    const loadAP = async () => {
      const { data } = await supabase
        .from("deals")
        .select("ap_number")
        .not("ap_number", "is", null)
        .order("ap_number", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setApNumber((data[0].ap_number ?? 0) + 1);
      } else {
        setApNumber(10000); // Starting AP sequence
      }
    };

    loadAP();
  }, []);

  /* -----------------------------
     Load contacts for company
  ------------------------------ */
  useEffect(() => {
    if (!selectedCompanyId) {
      setContacts([]);
      setSelectedContactId("");
      return;
    }

    const loadContacts = async () => {
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .eq("company_id", selectedCompanyId)
        .order("first_name", { ascending: true });

      setContacts((data || []) as Contact[]);
    };

    loadContacts();
  }, [selectedCompanyId]);

  /* -----------------------------
     Submit Lead
  ------------------------------ */
  const handleCreate = async () => {
    if (!selectedCompanyId) {
      alert("Please select or create a company.");
      return;
    }

    setLoading(true);
    let contactIdToUse = selectedContactId;

    /* CREATE NEW CONTACT IF FILLED */
    if (
      !selectedContactId &&
      (newContact.first_name || newContact.last_name || newContact.email)
    ) {
      const { data: newC, error: newCErr } = await supabase
        .from("contacts")
        .insert({
          first_name: newContact.first_name,
          last_name: newContact.last_name,
          email: newContact.email,
          phone: newContact.phone,
          company_id: selectedCompanyId,
          status: "Active",
        })
        .select("*")
        .single();

      if (newCErr) {
        alert("Could not create contact");
        console.error(newCErr);
        setLoading(false);
        return;
      }

      contactIdToUse = newC.id;
    }

    /* Build display name for contact */
    const contactObj =
      contacts.find((c) => c.id === contactIdToUse) || newContact;

    const contactName = contactObj
      ? `${contactObj.first_name || ""} ${contactObj.last_name || ""}`.trim()
      : null;

    /* INSERT DEAL */
    const { error: dealErr } = await supabase.from("deals").insert({
      ap_number: apNumber,
      client_name:
        companies.find((c) => c.id === selectedCompanyId)?.company_name || null,

      site_name: siteName,
      site_address: siteAddress,
      enquiry_date: enquiryDate,

      contact_name: contactName || null,
      contact_email: contactObj?.email || null,
      contact_phone: contactObj?.phone || null,

      salesperson_id: salespersonId || null,

      works_category: worksCategory || null,
      works_subcategory:
        worksCategory === "Housedeck" ? worksSubcategory : null,

      company_id: selectedCompanyId,
      stage: "Received",
      created_at: new Date().toISOString(),
    });

    if (dealErr) {
      alert("Deal creation failed");
      console.error(dealErr);
      setLoading(false);
      return;
    }

    alert("Lead created successfully");
    setLoading(false);
    onCreated();
  };

  /* -----------------------------
     Render Create Lead Form
  ------------------------------ */
  return (
    <div className="border rounded p-6 bg-white shadow-sm space-y-6 mt-4">
      {/* AP NUMBER */}
      <div>
        <label className="block text-xs font-semibold mb-1">
          AP Number (auto)
        </label>
        <input
          disabled
          className="w-full border rounded px-3 py-2 bg-gray-100 text-sm"
          value={apNumber ?? ""}
        />
      </div>

      {/* COMPANY SELECT */}
      <div>
        <label className="block text-xs font-semibold mb-1">Company *</label>

        <div className="flex gap-2">
          <select
            className="flex-1 border rounded px-3 py-2 text-sm"
            value={selectedCompanyId}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value);
              setShowCompanyPanel(false);
            }}
          >
            <option value="">Select company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>

          {/* TEXT BUTTON instead of "+" */}
          <button
            type="button"
            onClick={() => {
              setSelectedCompanyId("");
              setShowCompanyPanel(true);
            }}
            className="text-blue-600 underline text-sm"
          >
            Create new company
          </button>
        </div>

        {/* INLINE CREATE COMPANY PANEL */}
        {showCompanyPanel && (
          <CreateCompanyPanel
            onCreated={(company) => {
              setShowCompanyPanel(false);
              // auto-select new company
              setSelectedCompanyId(company.id);
            }}
            onCancel={() => setShowCompanyPanel(false)}
          />
        )}
      </div>

      {/* CONTACT SELECTION */}
      {selectedCompanyId && !showCompanyPanel && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* EXISTING CONTACT */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              Existing Contact
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
            >
              <option value="">— None —</option>
              {contacts.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.first_name} {ct.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* NEW CONTACT */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              Or Create New Contact
            </label>

            <div className="space-y-2">
              <input
                placeholder="First name"
                className="w-full border rounded px-3 py-2 text-sm"
                value={newContact.first_name}
                onChange={(e) =>
                  setNewContact({ ...newContact, first_name: e.target.value })
                }
              />
              <input
                placeholder="Last name"
                className="w-full border rounded px-3 py-2 text-sm"
                value={newContact.last_name}
                onChange={(e) =>
                  setNewContact({ ...newContact, last_name: e.target.value })
                }
              />
              <input
                placeholder="Email"
                className="w-full border rounded px-3 py-2 text-sm"
                value={newContact.email}
                onChange={(e) =>
                  setNewContact({ ...newContact, email: e.target.value })
                }
              />
              <input
                placeholder="Phone"
                className="w-full border rounded px-3 py-2 text-sm"
                value={newContact.phone}
                onChange={(e) =>
                  setNewContact({ ...newContact, phone: e.target.value })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* SITE DETAILS */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold">Site name</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-semibold">Site address</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
          />
        </div>
      </div>

      {/* WORKS CATEGORY */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold">Works category</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={worksCategory}
            onChange={(e) => {
              setWorksCategory(e.target.value);
              setWorksSubcategory("");
            }}
          >
            <option value="">Select…</option>
            <option value="Piling">Piling</option>
            <option value="Comdeck">Comdeck</option>
            <option value="Housedeck">Housedeck</option>
          </select>
        </div>

        {worksCategory === "Housedeck" && (
          <div>
            <label className="text-xs font-semibold">Subcategory</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={worksSubcategory}
              onChange={(e) => setWorksSubcategory(e.target.value)}
            >
              <option value="">Select…</option>
              <option value="Standard">Standard</option>
              <option value="Floodsafe">Floodsafe</option>
              <option value="Treesafe">Treesafe</option>
            </select>
          </div>
        )}
      </div>

      {/* ENQUIRY DATE */}
      <div>
        <label className="text-xs font-semibold">Enquiry date</label>
        <input
          type="date"
          className="w-full border rounded px-3 py-2 text-sm"
          value={enquiryDate}
          onChange={(e) => setEnquiryDate(e.target.value)}
        />
      </div>

      {/* SALESPERSON */}
      <div>
        <label className="text-xs font-semibold">Salesperson</label>
        <select
          className="w-full border rounded px-3 py-2 text-sm"
          value={salespersonId}
          onChange={(e) => setSalespersonId(e.target.value)}
        >
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* SUBMIT */}
      <div className="flex justify-end">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? "Creating…" : "Create Lead"}
        </button>
      </div>
    </div>
  );
}
/* =====================================================
   DEALS PAGE — MAIN COMPONENT
===================================================== */

export default function DealsPage() {
  /* -----------------------
     CORE STATE
  ------------------------ */
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);

  /* -----------------------
     FILTER STATE
  ------------------------ */
  const [searchAp, setSearchAp] = useState("");
  const [searchCompany, setSearchCompany] = useState("");
  const [searchSalesperson, setSearchSalesperson] = useState("");

  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [filterProb, setFilterProb] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [filterWorksCategory, setFilterWorksCategory] = useState("");
  const [filterWorksSubcategory, setFilterWorksSubcategory] = useState("");

  /* -----------------------
     SORTING
  ------------------------ */
  type SortField =
    | "ap_number"
    | "client_name"
    | "site_name"
    | "stage"
    | "probability"
    | "enquiry_date"
    | "works_category"
    | "works_subcategory";

  const [sortField, setSortField] = useState<SortField>("ap_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  /* -----------------------
     PAGINATION
  ------------------------ */
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);

  /* =====================================================
     LOAD DATA
  ===================================================== */

  const loadDeals = async () => {
    setDealsLoading(true);
    const { data, error } = await supabase
      .from("deals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setDealsError("Could not load leads.");
    else setDeals(data || []);

    setDealsLoading(false);
  };

  const loadCompanies = async () => {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .order("company_name", { ascending: true });

    setCompanies(data || []);
    setCompaniesLoading(false);
  };

  const loadStaff = async () => {
    const { data, error } = await supabase
      .from("staff_profiles")
      .select("id, full_name")
      .order("full_name");

    if (error) setStaffError("Could not load staff list.");
    else setStaff(data || []);

    setStaffLoading(false);
  };

  useEffect(() => {
    loadDeals();
    loadCompanies();
    loadStaff();
  }, []);

  /* =====================================================
     RESET PAGE WHEN FILTERS CHANGE
  ===================================================== */
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
    filterWorksCategory,
    filterWorksSubcategory,
  ]);

  /* =====================================================
     FILTERED DEALS
  ===================================================== */

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      // AP #
      if (searchAp.trim()) {
        const ap = String(d.ap_number ?? "");
        if (!ap.includes(searchAp.trim())) return false;
      }

      // Company
      if (searchCompany.trim()) {
        const lower = searchCompany.toLowerCase();
        if (!(d.client_name || "").toLowerCase().includes(lower)) return false;
      }

      // Salesperson (text)
      if (searchSalesperson.trim()) {
        const lower = searchSalesperson.toLowerCase();
        if (!(d.salesperson || "").toLowerCase().includes(lower)) return false;
      }

      // Stages
      if (selectedStages.length > 0) {
        if (!d.stage || !selectedStages.includes(d.stage)) return false;
      }

      // Probability
      if (filterProb && filterProb !== d.probability) return false;

      // Date range
      if (dateFrom) {
        if (!d.enquiry_date) return false;
        if (new Date(d.enquiry_date) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        if (!d.enquiry_date) return false;
        if (new Date(d.enquiry_date) > new Date(dateTo)) return false;
      }

      // Works Category
      if (filterWorksCategory) {
        if (d.works_category !== filterWorksCategory) return false;
      }

      // Works Subcategory
      if (filterWorksCategory === "Housedeck" && filterWorksSubcategory) {
        if (d.works_subcategory !== filterWorksSubcategory) return false;
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
    filterWorksCategory,
    filterWorksSubcategory,
  ]);

  /* =====================================================
     SORTING
  ===================================================== */

  const sortedFilteredDeals = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const sortString = (a: string | null, b: string | null) => {
      const A = (a || "").toLowerCase();
      const B = (b || "").toLowerCase();
      return A < B ? -1 : A > B ? 1 : 0;
    };

    const sortDate = (a: string | null, b: string | null) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    };

    return [...filteredDeals].sort((a, b) => {
      let res = 0;
      switch (sortField) {
        case "ap_number":
          res = (a.ap_number ?? Infinity) - (b.ap_number ?? Infinity);
          break;
        case "client_name":
          res = sortString(a.client_name, b.client_name);
          break;
        case "site_name":
          res = sortString(a.site_name, b.site_name);
          break;
        case "stage":
          res = sortString(a.stage, b.stage);
          break;
        case "probability":
          res = sortString(a.probability, b.probability);
          break;
        case "enquiry_date":
          res = sortDate(a.enquiry_date, b.enquiry_date);
          break;
        case "works_category":
          res = sortString(a.works_category, b.works_category);
          break;
        case "works_subcategory":
          res = sortString(a.works_subcategory, b.works_subcategory);
          break;
      }

      if (res !== 0) return res * dir;

      // fallback: newest first
      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });
  }, [filteredDeals, sortField, sortDir]);

  /* =====================================================
     PAGINATION
  ===================================================== */

  const totalPages = Math.max(1, Math.ceil(sortedFilteredDeals.length / PAGE_SIZE));

  const visibleDeals = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedFilteredDeals.slice(start, start + PAGE_SIZE);
  }, [sortedFilteredDeals, page]);

  /* =====================================================
     HELPERS
  ===================================================== */
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
    setFilterWorksCategory("");
    setFilterWorksSubcategory("");
  };

  const activeSortArrow = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? "▲" : "▼") : "⇵";

  const getStaffNameById = (id: string | null) => {
    if (!id) return "—";
    const match = staff.find((s) => s.id === id);
    return match ? match.full_name : "Unknown";
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };
  /* =====================================================
     RENDER START
  ===================================================== */

  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);

  const toggleDealSelection = (id: string) => {
    setSelectedDealIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = (rows: Deal[]) => {
    const visibleIds = rows.map((d) => d.id);
    const allSelected = visibleIds.every((id) => selectedDealIds.includes(id));

    if (allSelected) {
      setSelectedDealIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedDealIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const allVisibleSelected =
    visibleDeals.length > 0 &&
    visibleDeals.every((d) => selectedDealIds.includes(d.id));

  /* =====================================================
     UI RENDER
  ===================================================== */

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads / Projects</h1>
          <p className="text-sm text-gray-500">
            Create and manage tenders, enquiries, and projects.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate((prev) => !prev)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
        >
          {showCreate ? "Close Form" : "New Lead / Project"}
        </button>
      </div>

      {/* CREATE FORM */}
      {showCreate && (
        <CreateLeadForm
          companies={companies}
          staff={staff}
          onCreated={() => {
            setShowCreate(false);
            loadDeals();
          }}
        />
      )}

      {/* FILTER PANEL */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-800">Search & Filters</h2>

        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {/* AP NUMBER */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">AP number</label>
            <input
              value={searchAp}
              onChange={(e) => setSearchAp(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
              placeholder="e.g. 28124"
            />
          </div>

          {/* COMPANY */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Company</label>
            <input
              value={searchCompany}
              onChange={(e) => setSearchCompany(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
              placeholder="Search by company name"
            />
          </div>

          {/* SALESPERSON TEXT */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Salesperson (text)</label>
            <input
              value={searchSalesperson}
              onChange={(e) => setSearchSalesperson(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
              placeholder="Legacy salesperson text"
            />
          </div>

          {/* STAGE */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Stage</label>
            <select
              multiple
              value={selectedStages}
              onChange={(e) =>
                setSelectedStages(
                  Array.from(e.target.selectedOptions).map((o) => o.value)
                )
              }
              className="h-[90px] w-full rounded border px-2 py-2 text-sm"
            >
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* PROBABILITY */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Probability</label>
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

          {/* DATE FROM */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Enquiry date from</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
            />
          </div>

          {/* DATE TO */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Enquiry date to</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm"
            />
          </div>

          {/* CATEGORY */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Category</label>
            <select
              value={filterWorksCategory}
              onChange={(e) => {
                setFilterWorksCategory(e.target.value);
                setFilterWorksSubcategory("");
              }}
              className="w-full rounded border px-2 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="Piling">Piling</option>
              <option value="Comdeck">Comdeck</option>
              <option value="Housedeck">Housedeck</option>
            </select>
          </div>

          {/* SUBCATEGORY */}
          {filterWorksCategory === "Housedeck" && (
            <div>
              <label className="mb-1 block text-xs text-gray-600">Sub-category</label>
              <select
                value={filterWorksSubcategory}
                onChange={(e) => setFilterWorksSubcategory(e.target.value)}
                className="w-full rounded border px-2 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="Standard">Standard</option>
                <option value="Floodsafe">Floodsafe</option>
                <option value="Treesafe">Treesafe</option>
              </select>
            </div>
          )}
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

      {/* =====================================================
          TABLE OF DEALS
      ===================================================== */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">
            Registered Leads / Projects
          </h2>
          <p className="text-xs text-gray-500">
            Showing {visibleDeals.length} of {sortedFilteredDeals.length}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {/* CHECKBOX */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => toggleSelectAllVisible(visibleDeals)}
                  />
                </th>

                {/* AP NUMBER */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <button
                    onClick={() => handleSort("ap_number")}
                    className="flex items-center gap-1"
                  >
                    AP #
                    <span className="text-[10px]">{activeSortArrow("ap_number")}</span>
                  </button>
                </th>

                {/* COMPANY */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <button
                    onClick={() => handleSort("client_name")}
                    className="flex items-center gap-1"
                  >
                    Company
                    <span className="text-[10px]">{activeSortArrow("client_name")}</span>
                  </button>
                </th>

                {/* CATEGORY */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <button
                    onClick={() => handleSort("works_category")}
                    className="flex items-center gap-1"
                  >
                    Category
                    <span className="text-[10px]">
                      {activeSortArrow("works_category")}
                    </span>
                  </button>
                </th>

                {/* SUBCATEGORY */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <button
                    onClick={() => handleSort("works_subcategory")}
                    className="flex items-center gap-1"
                  >
                    Sub-category
<span className="text-[10px]">

                      {activeSortArrow("works_subcategory")}
                    </span>
                  </button>
                </th>

                {/* SALESPERSON TEXT */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  Salesperson (text)
                </th>

                {/* SALESPERSON ASSIGNED */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  Salesperson (assigned)
                </th>

                {/* SITE */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <button
                    onClick={() => handleSort("site_name")}
                    className="flex items-center gap-1"
                  >
                    Site
                    <span className="text-[10px]">
                      {activeSortArrow("site_name")}
                    </span>
                  </button>
                </th>

                {/* STAGE */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <button
                    onClick={() => handleSort("stage")}
                    className="flex items-center gap-1"
                  >
                    Stage
                    <span className="text-[10px]">

                      {activeSortArrow("stage")}
                    </span>
                  </button>
                </th>

                {/* PROBABILITY */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <button
                    onClick={() => handleSort("probability")}
                    className="flex items-center gap-1"
                  >
                    Prob.
                    <span className="text-[10px]">

                      {activeSortArrow("probability")}
                    </span>
                  </button>
                </th>

                {/* DATE */}
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  <button
                    onClick={() => handleSort("enquiry_date")}
                    className="flex items-center gap-1"
                  >
                    Enquiry date
                    <span className="text-[10px]">

                      {activeSortArrow("enquiry_date")}
                    </span>
                  </button>
                </th>

                {/* ACTIONS */}
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {visibleDeals.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedDealIds.includes(d.id)}
                      onChange={() => toggleDealSelection(d.id)}
                    />
                  </td>

                  <td className="px-3 py-2">
                    {d.ap_number ? `AP${d.ap_number}` : "—"}
                  </td>

                  <td className="px-3 py-2 max-w-xs truncate">
                    {d.client_name || "—"}
                  </td>

                  <td className="px-3 py-2">{d.works_category || "—"}</td>
                  <td className="px-3 py-2">{d.works_subcategory || "—"}</td>

                  <td className="px-3 py-2 max-w-xs truncate">
                    {d.salesperson || "—"}
                  </td>

                  <td className="px-3 py-2 max-w-xs truncate">
                    {getStaffNameById(d.salesperson_id)}
                  </td>

                  <td className="px-3 py-2 max-w-xs truncate">
                    {d.site_name || "—"}
                  </td>

                  <td className="px-3 py-2 text-xs">{d.stage || "—"}</td>

                  <td className="px-3 py-2 text-xs">
                    {d.probability || "—"}
                  </td>

                  <td className="px-3 py-2 text-xs">
                    {formatDate(d.enquiry_date)}
                  </td>

                  <td className="px-3 py-2 text-right text-xs">
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

        {/* PAGINATION */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
          <span>
            Page {page} of {totalPages}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
