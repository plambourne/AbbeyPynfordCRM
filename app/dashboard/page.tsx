"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ---- Types ----

type Company = {
  id: string;
  company_name: string;
};

type Deal = {
  id: string;
  ap_number: number | null;
  company_id: string | null;
  site_name: string | null;
  enquiry_date: string | null;
  tender_return_date: string | null;
  stage: string | null;
  probability: string | null;
  tender_value: number | string | null;
  salesperson: string | null;
  estimated_start_date: string | null;
  works_category: string | null;
  works_subcategory: string | null;
};

// ---- Helpers ----

const toNumber = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(n) ? 0 : n;
};

const formatCurrency = (value: number | string | null | undefined): string => {
  const n = toNumber(value);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
};

const formatAp = (apNumber: number | null): string => {
  if (!apNumber) return "";
  return `AP${apNumber}`;
};

// Canonical stage labels
const STAGE_LABELS: Record<string, string> = {
  received: "Received",
  qualified: "Qualified",
  "in review": "In Review",
  "quote submitted": "Quote Submitted",
  won: "Won",
  lost: "Lost",
  "no tender": "No Tender",
};

const ACTIVE_STAGE_NAMES = [
  "Received",
  "Qualified",
  "In Review",
  "Quote Submitted",
];

const ACTIVE_STAGE_SET = new Set(
  ACTIVE_STAGE_NAMES.map((s) => s.toLowerCase())
);

const normaliseStage = (stage: string | null): string => {
  if (!stage) return "Unspecified";
  const raw = stage.trim();
  if (!raw) return "Unspecified";
  const key = raw.toLowerCase();
  return STAGE_LABELS[key] ?? raw;
};

// ---- Multi-tender per AP: choose the "best" deal ----

const STAGE_PRIORITY: Record<string, number> = {
  lost: 0,
  "no tender": 0,
  received: 1,
  qualified: 2,
  "in review": 3,
  "quote submitted": 4,
  won: 5,
};

const PROB_WEIGHTS: Record<string, number> = {
  A: 0.75,
  B: 0.5,
  C: 0.25,
  D: 0.1,
};
const PROB_OPTIONS = ["A", "B", "C", "D"];


const getDealWeight = (deal: Deal): number => {
  const stage = (deal.stage || "").toLowerCase();
  if (stage === "won") return 1;
  if (stage === "lost" || stage === "no tender") return 0;

  if (deal.probability && PROB_WEIGHTS[deal.probability]) {
    return PROB_WEIGHTS[deal.probability];
  }
  return 0;
};

const chooseBestDealForAp = (a: Deal, b: Deal): Deal => {
  const stageA = STAGE_PRIORITY[(a.stage || "").toLowerCase()] ?? 0;
  const stageB = STAGE_PRIORITY[(b.stage || "").toLowerCase()] ?? 0;

  // 1) Highest stage wins
  if (stageA !== stageB) {
    return stageA > stageB ? a : b;
  }

  // 2) Then highest probability weight (A/B/C/D)
  const weightA = getDealWeight(a);
  const weightB = getDealWeight(b);
  if (weightA !== weightB) {
    return weightA > weightB ? a : b;
  }

  // 3) Then highest tender value
  const valA = toNumber(a.tender_value);
  const valB = toNumber(b.tender_value);
  if (valA !== valB) {
    return valA > valB ? a : b;
  }

  // 4) Then newest enquiry date
  const dA = a.enquiry_date ? new Date(a.enquiry_date).getTime() : 0;
  const dB = b.enquiry_date ? new Date(b.enquiry_date).getTime() : 0;
  return dA >= dB ? a : b;
};

// Collapse multiple deals per AP number into a single "best" deal
const collapseDealsByAp = (deals: Deal[]): Deal[] => {
  const map = new Map<string, Deal>();

  deals.forEach((d) => {
    const key =
      d.ap_number !== null && d.ap_number !== undefined
        ? `AP-${d.ap_number}`
        : `ID-${d.id}`; // no AP => its own group

    const existing = map.get(key);
    if (!existing) {
      map.set(key, d);
    } else {
      map.set(key, chooseBestDealForAp(existing, d));
    }
  });

  return Array.from(map.values());
};

// ---- Types for KPI groupings ----

type BaseStageStat = {
  stage: string; // canonical label
  count: number;
  total: number;
};

type StageGroup = {
  key: "Active" | "Won" | "Lost" | "No Tender";
  label: string;
  count: number;
  total: number;
  children?: BaseStageStat[];
};

type ClientAgg = {
  companyId: string;
  companyName: string;
  count: number;
  wonCount: number;
  totalValue: number;
  wonValue: number;
  expectedValue: number;
};

type PipelineBucket = {
  monthKey: string; // YYYY-MM
  label: string; // e.g. 03/2025
  wonValue: number;
  probAValue: number;
  probBValue: number;
};
type FyTenderRow = {
  fyEndYear: number;
  tenders: number;
  quotesSubmitted: number;
  wonCount: number;
  totalTenderValue: number;
  wonTenderValue: number;
};


// ---- Financial year helpers ----
// FY is Dec -> Nov, labelled by the calendar year it ends (e.g. FY2025 = Dec 2024–Nov 2025)

const getFinancialYearEnd = (date: Date): number => {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0–11
  // December (11) belongs to next year's FY
  return m === 11 ? y + 1 : y;
};

const isInFinancialYear = (date: Date, fyEndYear: number): boolean => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0–11

  if (fyEndYear === year) {
    // Jan–Nov of FY end year
    return month >= 0 && month <= 10; // Jan–Nov
  }
  if (fyEndYear === year + 1) {
    // Dec of previous year
    return month === 11; // Dec
  }
  return false;
};

const monthIndexFromYyyyMm = (s: string): number | null => {
  if (!s) return null;
  const [yStr, mStr] = s.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return null;
  return y * 12 + (m - 1);
};

// ---- Component ----

type DateMode = "ALL" | "MONTH_RANGE" | "FY";
type ClientSortBy = "WIN_RATE" | "COUNT" | "EXPECTED_VALUE";

export default function DashboardPage() {
  const router = useRouter();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global filters (applied to KPIs + table)
  const [dateMode, setDateMode] = useState<DateMode>("ALL");
  const [monthFrom, setMonthFrom] = useState<string>(""); // YYYY-MM
  const [monthTo, setMonthTo] = useState<string>(""); // YYYY-MM
  const [fyFilter, setFyFilter] = useState<string>(""); // e.g. "2025"

 const [salespersonFilter, setSalespersonFilter] = useState<string>("");
const [categoryFilter, setCategoryFilter] = useState<string>("");
const [subCategoryFilter, setSubCategoryFilter] = useState<string>("");
const [probFilter, setProbFilter] = useState<string[]>([]);


  // Stage filter (from clicking the stage breakdown)
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [showActiveDetails, setShowActiveDetails] = useState(false);

// Deals section collapsible
const [showDeals, setShowDeals] = useState(false);

// Deals table AP# sort (true = ascending, false = descending)
const [apSortAsc, setApSortAsc] = useState<boolean>(true);

// Top clients section collapsible
const [showTopClients, setShowTopClients] = useState(false);

// Financial year comparison collapsible
const [showFyTenderSummary, setShowFyTenderSummary] = useState(false);

// Top clients sort
const [clientSortBy, setClientSortBy] =
  useState<ClientSortBy>("WIN_RATE");




  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          { data: dealsData, error: dealsError },
          { data: companiesData, error: companiesError },
        ] = await Promise.all([
          supabase
            .from("deals")
            .select(
              `
              id,
              ap_number,
              company_id,
              site_name,
              enquiry_date,
              tender_return_date,
              stage,
              probability,
              tender_value,
              salesperson,
              estimated_start_date,
              works_category,
              works_subcategory
            `
            ),
          supabase.from("companies").select("id, company_name"),
        ]);

        if (dealsError) throw dealsError;
        if (companiesError) throw companiesError;

        setDeals((dealsData || []) as Deal[]);
        setCompanies((companiesData || []) as Company[]);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const getCompanyName = (companyId: string | null) => {
    if (!companyId) return "";
    const c = companies.find((co) => co.id === companyId);
    return c?.company_name ?? "";
  };

  // ---- Distinct lists for filters ----

  const distinctSalespeople = useMemo(() => {
    const set = new Set<string>();
    deals.forEach((d) => {
      const name = (d.salesperson || "").trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [deals]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    deals.forEach((d) => {
      const c = (d.works_category || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [deals]);

  const distinctSubCategories = useMemo(() => {
    const set = new Set<string>();
    deals.forEach((d) => {
      const sc = (d.works_subcategory || "").trim();
      if (!sc) return;
      if (categoryFilter) {
        const cat = (d.works_category || "").trim();
        if (cat !== categoryFilter) return;
      }
      set.add(sc);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [deals, categoryFilter]);

  const distinctFinancialYears = useMemo(() => {
    const set = new Set<number>();
    deals.forEach((d) => {
      if (!d.enquiry_date) return;
      const dt = new Date(d.enquiry_date);
      if (Number.isNaN(dt.getTime())) return;
      const fyEnd = getFinancialYearEnd(dt);
      set.add(fyEnd);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [deals]);

  // ---- Apply global filters (date, salesperson, category) ----

   const baseFilteredDeals = useMemo(() => {
    return deals.filter((d) => {
      // Date filtering is based on enquiry_date
      if (dateMode !== "ALL") {
        if (!d.enquiry_date) return false;
        const dt = new Date(d.enquiry_date);
        if (Number.isNaN(dt.getTime())) return false;

        if (dateMode === "MONTH_RANGE") {
          const idx = dt.getFullYear() * 12 + dt.getMonth();
          const fromIdx = monthFrom ? monthIndexFromYyyyMm(monthFrom) : null;
          const toIdx = monthTo ? monthIndexFromYyyyMm(monthTo) : null;

          if (fromIdx !== null && idx < fromIdx) return false;
          if (toIdx !== null && idx > toIdx) return false;
        }

        if (dateMode === "FY" && fyFilter) {
          const fyEndYear = Number(fyFilter);
          if (!isInFinancialYear(dt, fyEndYear)) return false;
        }
      }

      // Salesperson filter
      if (salespersonFilter) {
        const sp = (d.salesperson || "").trim().toLowerCase();
        if (sp !== salespersonFilter.toLowerCase()) return false;
      }

      // Category filter
      if (categoryFilter) {
        const cat = (d.works_category || "").trim();
        if (cat !== categoryFilter) return false;
      }

      // Sub-category filter
      if (subCategoryFilter) {
        const sc = (d.works_subcategory || "").trim();
        if (sc !== subCategoryFilter) return false;
      }

      // 🔹 Probability multi-select filter (A/B/C/D)
      if (probFilter.length > 0) {
        const prob = (d.probability || "").trim().toUpperCase();
        if (!prob || !probFilter.includes(prob)) return false;
      }

      return true;
    });
  }, [
    deals,
    dateMode,
    monthFrom,
    monthTo,
    fyFilter,
    salespersonFilter,
    categoryFilter,
    subCategoryFilter,
    probFilter,
  ]);

  // ---- Collapsed deals (best per AP) after filters ----

  const collapsedDeals = useMemo(
    () => collapseDealsByAp(baseFilteredDeals),
    [baseFilteredDeals]
  );

    // ---- Financial year tender numbers (ignores filters) ----

  const fyTenderSummary = useMemo<FyTenderRow[]>(() => {
    const map = new Map<number, FyTenderRow>();

    deals.forEach((d) => {
      if (!d.enquiry_date) return;
      const dt = new Date(d.enquiry_date);
      if (Number.isNaN(dt.getTime())) return;

      const fyEnd = getFinancialYearEnd(dt);

      const row =
        map.get(fyEnd) ||
        {
          fyEndYear: fyEnd,
          tenders: 0,
          quotesSubmitted: 0,
          wonCount: 0,
          totalTenderValue: 0,
          wonTenderValue: 0,
        };

      row.tenders += 1;

      const stageName = normaliseStage(d.stage);
      const value = toNumber(d.tender_value);

      if (stageName === "Quote Submitted") {
        row.quotesSubmitted += 1;
      }
      if (stageName === "Won") {
        row.wonCount += 1;
        row.wonTenderValue += value;
      }

      row.totalTenderValue += value;

      map.set(fyEnd, row);
    });

    return Array.from(map.values()).sort(
      (a, b) => a.fyEndYear - b.fyEndYear
    );
  }, [deals]);

  // ---- KPI calculations (using best-per-AP of filtered deals) ----

  const {
    totalTenderValue,
    groupedStageStats,
    tendersReceived,
    quotesSubmittedCount,
    wonValue,
  } = useMemo(() => {
    let total = 0;
    let tenders = 0;
    let quotesSubmitted = 0;
    let wonVal = 0;

    const baseMap = new Map<string, BaseStageStat>();

    collapsedDeals.forEach((d) => {
      const value = toNumber(d.tender_value);
      total += value;
      tenders += 1;

      const stageName = normaliseStage(d.stage);
      const existing =
        baseMap.get(stageName) || { stage: stageName, count: 0, total: 0 };

      existing.count += 1;
      existing.total += value;

      baseMap.set(stageName, existing);

      if (stageName === "Quote Submitted") {
        quotesSubmitted += 1;
      }
      if (stageName === "Won") {
        wonVal += value;
      }
    });

    

    const getStageStat = (name: string): BaseStageStat => {
      return (
        baseMap.get(name) || {
          stage: name,
          count: 0,
          total: 0,
        }
      );
    };

    // Active = Received + Qualified + In Review + Quote Submitted
    const activeChildren = ACTIVE_STAGE_NAMES.map((name) => getStageStat(name));
    const activeGroup: StageGroup = {
      key: "Active",
      label: "Active",
      count: activeChildren.reduce((s, c) => s + c.count, 0),
      total: activeChildren.reduce((s, c) => s + c.total, 0),
      children: activeChildren,
    };

    const won = getStageStat("Won");
    const lost = getStageStat("Lost");
    const noTender = getStageStat("No Tender");

    const groups: StageGroup[] = [
      activeGroup,
      {
        key: "Won",
        label: "Won",
        count: won.count,
        total: won.total,
      },
      {
        key: "Lost",
        label: "Lost",
        count: lost.count,
        total: lost.total,
      },
      {
        key: "No Tender",
        label: "No Tender",
        count: noTender.count,
        total: noTender.total,
      },
    ];

    return {
      totalTenderValue: total,
      groupedStageStats: groups,
      tendersReceived: tenders,
      quotesSubmittedCount: quotesSubmitted,
      wonValue: wonVal,
    };
  }, [collapsedDeals]);

  // ---- Top clients (based on collapsed deals + filters) ----

  const topClients = useMemo(() => {
    const map = new Map<string, ClientAgg>();

    collapsedDeals.forEach((d) => {
      if (!d.company_id) return;

      const companyId = d.company_id;
      const companyName =
        companies.find((c) => c.id === companyId)?.company_name ||
        "Unknown";

      const existing =
        map.get(companyId) || {
          companyId,
          companyName,
          count: 0,
          wonCount: 0,
          totalValue: 0,
          wonValue: 0,
          expectedValue: 0,
        };

      const value = toNumber(d.tender_value);
      const stageName = normaliseStage(d.stage);
      const weight = getDealWeight(d);

      existing.count += 1;
      existing.totalValue += value;
      existing.expectedValue += value * weight;
      if (stageName === "Won") {
        existing.wonCount += 1;
        existing.wonValue += value;
      }

      map.set(companyId, existing);
    });

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (clientSortBy === "COUNT") {
        return b.count - a.count;
      }
      if (clientSortBy === "EXPECTED_VALUE") {
        return b.expectedValue - a.expectedValue;
      }
      // WIN_RATE
      const winRateA = a.count > 0 ? a.wonCount / a.count : 0;
      const winRateB = b.count > 0 ? b.wonCount / b.count : 0;
      if (winRateB !== winRateA) return winRateB - winRateA;
      return b.count - a.count;
    });

    return arr;
  }, [collapsedDeals, companies, clientSortBy]);

  // ---- Pipeline by estimated start date (monthly, collapsed deals) ----

  const { pipelineBuckets, maxPipelineValue } = useMemo(() => {
    const map = new Map<string, PipelineBucket>();

    collapsedDeals.forEach((d) => {
      if (!d.estimated_start_date) return;
      const dt = new Date(d.estimated_start_date);
      if (Number.isNaN(dt.getTime())) return;

      const stage = (d.stage || "").toLowerCase();
      if (stage === "lost" || stage === "no tender") return;

      const year = dt.getFullYear();
      const month = dt.getMonth() + 1;
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const label = `${String(month).padStart(2, "0")}/${year}`;

      const existing =
        map.get(monthKey) || {
          monthKey,
          label,
          wonValue: 0,
          probAValue: 0,
          probBValue: 0,
        };

      const val = toNumber(d.tender_value);
      const prob = (d.probability || "").toUpperCase();

      if (stage === "won") {
        existing.wonValue += val;
      } else {
        if (prob === "A") existing.probAValue += val;
        if (prob === "B") existing.probBValue += val;
      }

      map.set(monthKey, existing);
    });

    const arr = Array.from(map.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    );

    const maxVal = arr.reduce(
      (max, b) =>
        Math.max(max, b.wonValue, b.probAValue, b.probBValue),
      0
    );

    return { pipelineBuckets: arr, maxPipelineValue: maxVal };
  }, [collapsedDeals]);

  // ---- Filtered deals for the table (global filters + stage filter, raw rows) ----

const filteredDeals = useMemo(() => {
  // When no stage filter: show all raw deals (line-by-line)
  if (!stageFilter) return baseFilteredDeals;

  // When stage filter is active: show best-per-AP list,
  // so counts match the KPI / stage breakdown.
  return collapsedDeals.filter((d) => {
    const s = normaliseStage(d.stage);
    if (stageFilter === "ACTIVE_GROUP") {
      return ACTIVE_STAGE_SET.has(s.toLowerCase());
    }
    return s === stageFilter;
  });
}, [baseFilteredDeals, collapsedDeals, stageFilter]);
const sortedDeals = useMemo(() => {
  // Copy the filtered deals into a new array so we don't mutate state
  const arr = [...filteredDeals];

  arr.sort((a, b) => {
    const aAp = a.ap_number;
    const bAp = b.ap_number;

    // Put rows with no AP# at the bottom
    if (aAp == null && bAp == null) return 0;
    if (aAp == null) return 1;
    if (bAp == null) return -1;

    // Otherwise sort numerically by AP number
    return apSortAsc ? aAp - bAp : bAp - aAp;
  });

  return arr;
}, [filteredDeals, apSortAsc]);



  const scrollToDealsTable = () => {
    if (typeof window !== "undefined") {
      const el = document.getElementById("deals-table");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const handleGroupRowClick = (groupKey: StageGroup["key"]) => {
    if (groupKey === "Active") {
      setStageFilter("ACTIVE_GROUP");
    } else {
      setStageFilter(groupKey);
    }
    scrollToDealsTable();
  };

  const handleChildStageClick = (stageName: string) => {
    setStageFilter(stageName);
    scrollToDealsTable();
  };

  const clearStageFilter = () => setStageFilter(null);

const handleResetFilters = () => {
  setDateMode("ALL");
  setMonthFrom("");
  setMonthTo("");
  setFyFilter("");
  setSalespersonFilter("");
  setCategoryFilter("");
  setSubCategoryFilter("");
  setProbFilter([]);
  setStageFilter(null);
};


  // ---- Render ----
  return (
    <div className="p-6 space-y-6 bg-gray-50">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Abbey Pynford / Sales Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Filterable KPIs and deals (best-per-AP for totals), with click-through
            to individual deals.
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">
            Filters
          </h2>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
          >
            Reset all
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4 text-xs">
          {/* Date mode */}
          <div className="md:col-span-2">
            <div className="mb-1 text-gray-600">Date (by enquiry)</div>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="datemode"
                  value="ALL"
                  checked={dateMode === "ALL"}
                  onChange={() => setDateMode("ALL")}
                />
                <span>All</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="datemode"
                  value="MONTH_RANGE"
                  checked={dateMode === "MONTH_RANGE"}
                  onChange={() => setDateMode("MONTH_RANGE")}
                />
                <span>Month range</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="datemode"
                  value="FY"
                  checked={dateMode === "FY"}
                  onChange={() => setDateMode("FY")}
                />
                <span>Financial year (Dec–Nov)</span>
              </label>
            </div>
          </div>

          {/* Month from */}
          <div>
            <label className="block mb-1 text-gray-600">
              Month from
            </label>
            <input
              type="month"
              value={monthFrom}
              onChange={(e) => setMonthFrom(e.target.value)}
              className="w-full border rounded px-2 py-1 text-xs"
              disabled={dateMode !== "MONTH_RANGE"}
            />
          </div>

          {/* Month to */}
          <div>
            <label className="block mb-1 text-gray-600">
              Month to
            </label>
            <input
              type="month"
              value={monthTo}
              onChange={(e) => setMonthTo(e.target.value)}
              className="w-full border rounded px-2 py-1 text-xs"
              disabled={dateMode !== "MONTH_RANGE"}
            />
          </div>

          {/* FY picker */}
          <div>
            <label className="block mb-1 text-gray-600">
              Financial year
            </label>
            <select
              value={fyFilter}
              onChange={(e) => setFyFilter(e.target.value)}
              disabled={dateMode !== "FY"}
              className="w-full border rounded px-2 py-1 text-xs bg-white"
            >
              <option value="">All</option>
              {distinctFinancialYears.map((fy) => (
                <option key={fy} value={fy}>
                  FY{fy}
                </option>
              ))}
            </select>
          </div>

          {/* Salesperson */}
          <div>
            <label className="block mb-1 text-gray-600">
              Salesperson
            </label>
            <select
              value={salespersonFilter}
              onChange={(e) => setSalespersonFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-xs bg-white"
            >
              <option value="">All</option>
              {distinctSalespeople.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>
{/* Probability (multi-select) */}
<div>
  <label className="block mb-1 text-gray-600">
    Probability (A/B/C/D)
  </label>
  <div className="flex flex-wrap gap-2">
    {PROB_OPTIONS.map((p) => {
      const checked = probFilter.includes(p);
      return (
        <label
          key={p}
          className="inline-flex items-center gap-1 text-xs"
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {
              setProbFilter((prev) =>
                checked
                  ? prev.filter((x) => x !== p)
                  : [...prev, p]
              );
            }}
          />
          <span>{p}</span>
        </label>
      );
    })}
  </div>
</div>

          {/* Category */}
          <div>
            <label className="block mb-1 text-gray-600">
              Work category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setSubCategoryFilter("");
              }}
              className="w-full border rounded px-2 py-1 text-xs bg-white"
            >
              <option value="">All</option>
              {distinctCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Sub-category */}
          <div>
            <label className="block mb-1 text-gray-600">
              Work sub-category
            </label>
            <select
              value={subCategoryFilter}
              onChange={(e) => setSubCategoryFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-xs bg-white"
              disabled={distinctSubCategories.length === 0}
            >
              <option value="">All</option>
              {distinctSubCategories.map((sc) => (
                <option key={sc} value={sc}>
                  {sc}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* State messages */}
      {loading && (
        <div className="rounded border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Loading data…</p>
        </div>
      )}

      {error && (
        <div className="rounded border bg-red-50 p-4 shadow-sm">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      )}

      {/* KPIs */}
      {!loading && !error && (
        <section className="rounded border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">
              Key metrics (best per AP, obeying filters)
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 text-sm">
            {/* Total tender value + tender numbers */}
            <div className="border rounded p-3 space-y-2">
              <div className="text-xs text-gray-500">
                Total tender value (all stages, best per AP#)
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(totalTenderValue)}
              </div>
              <div className="text-xs text-gray-500">
                Based on one &quot;best&quot; tender per AP number (highest
                stage / probability / value) after applying the filters above.
              </div>
              <div className="mt-2 border-t pt-2 text-xs">
                <div className="font-semibold mb-1">
                  Tender numbers (filtered, best per AP)
                </div>
                <div className="flex flex-wrap gap-4">
                  <div>
                    <div className="text-gray-500 text-[11px]">
                      Tenders received
                    </div>
                    <div className="font-semibold">{tendersReceived}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-[11px]">
                      Quotes submitted (stage)
                    </div>
                    <div className="font-semibold">
                      {quotesSubmittedCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-[11px]">
                      Won value
                    </div>
                    <div className="font-semibold">
                      {formatCurrency(wonValue)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown by grouped stage */}
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500 mb-2">
                Tender value by stage group (best per AP).{" "}
                <span className="font-semibold">
                  Active = Received, Qualified, In Review, Quote Submitted
                </span>
                . Click a row to filter, and expand Active to see its stages.
              </div>
              {groupedStageStats.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No deals found to summarise.
                </p>
              ) : (
                <div className="max-h-52 overflow-auto">
                  <table className="min-w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-1">Stage / Group</th>
                        <th className="text-right p-1"># leads</th>
                        <th className="text-right p-1">Tender value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Active group row */}
                      {groupedStageStats
                        .filter((g) => g.key === "Active")
                        .map((g) => (
                          <tr
                            key={g.key}
                            className={`border-b cursor-pointer hover:bg-gray-50 ${
                              stageFilter === "ACTIVE_GROUP"
                                ? "bg-blue-50"
                                : ""
                            }`}
                            onClick={() => handleGroupRowClick(g.key)}
                          >
                            <td className="p-1">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-left"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowActiveDetails((v) => !v);
                                }}
                              >
                                <span className="text-xs">
                                  {showActiveDetails ? "▾" : "▸"}
                                </span>
                                <span className="font-semibold">
                                  Active
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  (Received, Qualified, In Review, Quote
                                  Submitted)
                                </span>
                              </button>
                            </td>
                            <td className="p-1 text-right">{g.count}</td>
                            <td className="p-1 text-right">
                              {formatCurrency(g.total)}
                            </td>
                          </tr>
                        ))}

                      {/* Active children (detail rows) */}
                      {showActiveDetails &&
                        groupedStageStats
                          .find((g) => g.key === "Active")
                          ?.children?.map((child) => (
                            <tr
                              key={`active-${child.stage}`}
                              className={`border-b cursor-pointer hover:bg-gray-50 ${
                                stageFilter === child.stage ? "bg-blue-50" : ""
                              }`}
                              onClick={() =>
                                handleChildStageClick(child.stage)
                              }
                            >
                              <td className="p-1 pl-6">{child.stage}</td>
                              <td className="p-1 text-right">
                                {child.count}
                              </td>
                              <td className="p-1 text-right">
                                {formatCurrency(child.total)}
                              </td>
                            </tr>
                          ))}

                      {/* Other groups: Won, Lost, No Tender */}
                      {groupedStageStats
                        .filter((g) => g.key !== "Active")
                        .map((g) => (
                          <tr
                            key={g.key}
                            className={`border-b cursor-pointer hover:bg-gray-50 ${
                              stageFilter === g.label ? "bg-blue-50" : ""
                            }`}
                            onClick={() => handleGroupRowClick(g.key)}
                          >
                            <td className="p-1">{g.label}</td>
                            <td className="p-1 text-right">{g.count}</td>
                            <td className="p-1 text-right">
                              {formatCurrency(g.total)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
            {/* Financial year tender numbers (ignores filters) */}
      {!loading && !error && (
        <section className="rounded border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">
              Financial year tender numbers (all data)
            </h2>
            <button
              type="button"
              onClick={() => setShowFyTenderSummary((v) => !v)}
              className="border rounded px-2 py-1 text-[11px] hover:bg-gray-50"
            >
              {showFyTenderSummary ? "Hide" : "Show"}
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-3">
            Based on <strong>all deals in the system</strong>,{" "}
            <span className="underline">ignoring the filters above</span>.
            Financial year runs from December to November and is labelled
            by the calendar year it ends (e.g. FY2025 = Dec 2024–Nov 2025).
          </p>

          {showFyTenderSummary && (
            <>
              {fyTenderSummary.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No data available for financial years.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs border-collapse">
                    <thead className="bg-gray-100">
                      <tr className="border-b">
                        <th className="text-left p-2">
                          Financial year
                        </th>
                        <th className="text-right p-2">Tenders</th>
                        <th className="text-right p-2">
                          Quotes submitted
                        </th>
                        <th className="text-right p-2">Won count</th>
                        <th className="text-right p-2">
                          Total tender value
                        </th>
                        <th className="text-right p-2">
                          Won tender value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {fyTenderSummary.map((row) => (
                        <tr key={row.fyEndYear} className="border-b">
                          <td className="p-2">FY{row.fyEndYear}</td>
                          <td className="p-2 text-right">
                            {row.tenders}
                          </td>
                          <td className="p-2 text-right">
                            {row.quotesSubmitted}
                          </td>
                          <td className="p-2 text-right">
                            {row.wonCount}
                          </td>
                          <td className="p-2 text-right">
                            {formatCurrency(row.totalTenderValue)}
                          </td>
                          <td className="p-2 text-right">
                            {formatCurrency(row.wonTenderValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}


           {/* Deals table (collapsible) */}
      {!loading && !error && (
        <section
          id="deals-table"
          className="rounded border bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">
              Deals
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-600">
              {stageFilter ? (
                <>
                  <span>
                    Stage filter:{" "}
                    <strong>
                      {stageFilter === "ACTIVE_GROUP"
                        ? "Stage in (Received, Qualified, In Review, Quote Submitted)"
                        : `Stage = ${stageFilter}`}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={clearStageFilter}
                    className="border rounded px-2 py-1 text-[11px] hover:bg-gray-50"
                  >
                    Clear stage filter
                  </button>
                </>
              ) : (
                <span>Stage: All</span>
              )}
              <button
                type="button"
                onClick={() => setShowDeals((v) => !v)}
                className="border rounded px-2 py-1 text-[11px] hover:bg-gray-50"
              >
                {showDeals ? "Hide deals" : "Show deals"}
              </button>
            </div>
          </div>
          

          {showDeals && (
            <>
              <p className="text-xs text-gray-500 mb-3">
                Showing{" "}
                <span className="font-semibold">
                  {filteredDeals.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold">
                  {baseFilteredDeals.length}
                </span>{" "}
                deals after filters.
              </p>

              {filteredDeals.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No deals match the current filters.
                </p>
              ) : (
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="min-w-full text-xs border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr className="border-b">
                           <th
      className="text-left p-2 cursor-pointer select-none"
      onClick={() => setApSortAsc((v) => !v)}
    >
      AP # {apSortAsc ? "▲" : "▼"}
    </th>

                        <th className="text-left p-2">Site name</th>
                        <th className="text-left p-2">Company</th>
                        <th className="text-left p-2">Salesperson</th>
                        <th className="text-left p-2">Work category</th>
                        <th className="text-left p-2">
                          Work sub-category
                        </th>
                        <th className="text-left p-2">Enquiry date</th>
                        <th className="text-left p-2">
                          Tender return date
                        </th>
                        <th className="text-left p-2">Stage</th>
                        <th className="text-left p-2">Prob</th>
                        <th className="text-left p-2">Tender value</th>
                        <th className="text-left p-2">Estimated start</th>
                      </tr>
                    </thead>
                    <tbody>
  {sortedDeals.slice(0, 300).map((d) => (
    <tr
      key={d.id}
      className="border-b hover:bg-gray-50 cursor-pointer"
      onClick={() => router.push(`/deals/detail?id=${d.id}`)}
    >
      <td className="p-2 whitespace-nowrap">
        {formatAp(d.ap_number)}
      </td>
      <td className="p-2">{d.site_name ?? ""}</td>
      <td className="p-2">{getCompanyName(d.company_id)}</td>
      <td className="p-2">{d.salesperson ?? ""}</td>
      <td className="p-2">{d.works_category ?? ""}</td>
      <td className="p-2">{d.works_subcategory ?? ""}</td>
      <td className="p-2 whitespace-nowrap">
        {d.enquiry_date ?? ""}
      </td>
      <td className="p-2 whitespace-nowrap">
        {d.tender_return_date ?? ""}
      </td>
      <td className="p-2">{normaliseStage(d.stage)}</td>
      <td className="p-2">{d.probability ?? ""}</td>
      <td className="p-2 whitespace-nowrap">
        {d.tender_value == null || d.tender_value === ""
          ? ""
          : formatCurrency(d.tender_value)}
      </td>
      <td className="p-2 whitespace-nowrap">
        {d.estimated_start_date ?? ""}
      </td>
    </tr>
  ))}
</tbody>

                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Sales pipeline by estimated start date */}
      {!loading && !error && (
        <section className="rounded border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">
              Sales pipeline by estimated start (monthly)
            </h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Uses <strong>estimated start date</strong> and best-per-AP deals,
            filtered by enquiry date / salesperson / category above. Shows{" "}
            <strong>Won value</strong> and pipeline with{" "}
            <strong>probability A</strong> and <strong>probability B</strong>.
          </p>

          {pipelineBuckets.length === 0 ? (
            <p className="text-sm text-gray-500">
              No forecastable deals for the selected criteria.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex justify-end gap-4 text-[11px] text-gray-500 mb-1">
                <span>
                  <span className="inline-block w-3 h-3 rounded-full bg-gray-800 mr-1" />
                  Won value
                </span>
                <span>
                  <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-1" />
                  Probability A
                </span>
                <span>
                  <span className="inline-block w-3 h-3 rounded-full bg-purple-500 mr-1" />
                  Probability B
                </span>
              </div>
              {pipelineBuckets.map((b) => {
                const wonWidth =
                  maxPipelineValue > 0
                    ? (b.wonValue / maxPipelineValue) * 100
                    : 0;
                const aWidth =
                  maxPipelineValue > 0
                    ? (b.probAValue / maxPipelineValue) * 100
                    : 0;
                const bWidth =
                  maxPipelineValue > 0
                    ? (b.probBValue / maxPipelineValue) * 100
                    : 0;

                return (
                  <div
                    key={b.monthKey}
                    className="flex items-center gap-3"
                  >
                    <div className="w-16 text-gray-700 text-xs">
                      {b.label}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-gray-800"
                          style={{ width: `${wonWidth}%` }}
                        />
                      </div>
                      <div className="h-3 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${aWidth}%` }}
                        />
                      </div>
                      <div className="h-3 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-purple-500"
                          style={{ width: `${bWidth}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-48 text-right text-[11px]">
                      <div>Won: {formatCurrency(b.wonValue)}</div>
                      <div>A: {formatCurrency(b.probAValue)}</div>
                      <div>B: {formatCurrency(b.probBValue)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
 {/* Top clients table */}
{!loading && !error && (
  <section className="rounded border bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold text-gray-800">
        Top clients (subject to filters, best per AP)
      </h2>
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-600">Sort by:</span>
          <select
            value={clientSortBy}
            onChange={(e) =>
              setClientSortBy(e.target.value as ClientSortBy)
            }
            className="border rounded px-2 py-1 bg-white"
          >
            <option value="WIN_RATE">Win %</option>
            <option value="COUNT">Number of tenders</option>
            <option value="EXPECTED_VALUE">Expected value</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowTopClients((v) => !v)}
          className="border rounded px-2 py-1 text-[11px] hover:bg-gray-50"
        >
          {showTopClients ? "Hide clients" : "Show clients"}
        </button>
      </div>
    </div>

    {showTopClients && (
      <>
        {topClients.length === 0 ? (
          <p className="text-sm text-gray-500">
            No clients match the current filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead className="bg-gray-100">
                <tr className="border-b">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Client</th>
                  <th className="text-right p-2">Tenders</th>
                  <th className="text-right p-2">Win %</th>
                  <th className="text-right p-2">Won value</th>
                  <th className="text-right p-2">Expected value</th>
                  <th className="text-right p-2">
                    Total tender value
                  </th>
                </tr>
              </thead>
              <tbody>
                {topClients.slice(0, 50).map((c, idx) => {
                  const winRate =
                    c.count > 0 ? (c.wonCount / c.count) * 100 : 0;
                  return (
                    <tr key={c.companyId} className="border-b">
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2">{c.companyName}</td>
                      <td className="p-2 text-right">{c.count}</td>
                      <td className="p-2 text-right">
                        {c.count === 0 ? "—" : `${Math.round(winRate)}%`}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(c.wonValue)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(c.expectedValue)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(c.totalValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </>
    )}
  </section>
)}

    </div>
  );
}
