"use client";

import { useEffect, useMemo, useState } from "react";
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
  enquiry_date: string | null;
  tender_return_date: string | null;
  stage: string | null;
  probability: string | null;
  tender_value: number | string | null;
  salesperson: string | null;
  estimated_start_date: string | null; // commencement date
};

// ---- Constants / helpers ----

const STAGES = [
  "Received",
  "Qualified",
  "In Review",
  "Quote Submitted",
  "Won",
  "Lost",
  "No Tender",
];

const PROB_WEIGHTS: Record<string, number> = {
  A: 0.75,
  B: 0.5,
  C: 0.25,
  D: 0.1,
};

// Edit these to your actual targets (per month, GBP)
const MONTHLY_TARGETS: Record<string, number> = {
  // "YYYY-MM": value
  "2025-01": 500000,
  "2025-02": 500000,
  "2025-03": 750000,
  "2025-04": 750000,
  // etc...
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

type YoYRow = {
  monthIndex: number;
  monthName: string;
  currentYearCount: number;
  previousYearCount: number;
};

// ----- Helpers for forecast month range -----

const monthIndexFromYyyyMm = (s: string): number | null => {
  if (!s) return null;
  const [yStr, mStr] = s.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return null;
  return y * 12 + (m - 1); // monthIndex 0–11
};

const isDateInMonthRange = (dt: Date, fromMonth: string, toMonth: string): boolean => {
  if (!fromMonth && !toMonth) return true;
  const idx = dt.getFullYear() * 12 + dt.getMonth();

  if (fromMonth) {
    const fromIdx = monthIndexFromYyyyMm(fromMonth);
    if (fromIdx !== null && idx < fromIdx) return false;
  }

  if (toMonth) {
    const toIdx = monthIndexFromYyyyMm(toMonth);
    if (toIdx !== null && idx > toIdx) return false;
  }

  return true;
};

// For “multiple tenders per AP”: pick the best deal per AP for forecasting
const STAGE_PRIORITY: Record<string, number> = {
  lost: 0,
  "no tender": 0,
  received: 1,
  qualified: 2,
  "in review": 3,
  "quote submitted": 4,
  won: 5,
};

const chooseBetterDealForForecast = (a: Deal, b: Deal): Deal => {
  const stageA = STAGE_PRIORITY[(a.stage || "").toLowerCase()] ?? 0;
  const stageB = STAGE_PRIORITY[(b.stage || "").toLowerCase()] ?? 0;

  if (stageA !== stageB) {
    return stageA > stageB ? a : b;
  }

  const weightA = getDealWeight(a);
  const weightB = getDealWeight(b);
  if (weightA !== weightB) {
    return weightA > weightB ? a : b;
  }

  const valA = toNumber(a.tender_value);
  const valB = toNumber(b.tender_value);
  if (valA !== valB) {
    return valA > valB ? a : b;
  }

  // Fall back to newest enquiry_date
  const dA = a.enquiry_date ? new Date(a.enquiry_date).getTime() : 0;
  const dB = b.enquiry_date ? new Date(b.enquiry_date).getTime() : 0;
  return dA >= dB ? a : b;
};

const collapseDealsByAp = (deals: Deal[]): Deal[] => {
  const map = new Map<string, Deal>();

  deals.forEach((d) => {
    const key =
      d.ap_number !== null && d.ap_number !== undefined
        ? `AP-${d.ap_number}`
        : `ID-${d.id}`; // no AP => own group

    const existing = map.get(key);
    if (!existing) {
      map.set(key, d);
    } else {
      map.set(key, chooseBetterDealForForecast(existing, d));
    }
  });

  return Array.from(map.values());
};

export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (for most charts & KPIs – but NOT for the YoY enquiries section)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(""); // "" = all
  const [salespersonFilter, setSalespersonFilter] = useState<string>("");

  // Collapsible sections
  const [showKpis, setShowKpis] = useState(true);
  const [showYoy, setShowYoy] = useState(true);
  const [showMonthly, setShowMonthly] = useState(true);
  const [showForecast, setShowForecast] = useState(true);
  const [showSalespeople, setShowSalespeople] = useState(true);
  const [showTopClients, setShowTopClients] = useState(true);

  // YoY enquiries: selected years
  const [yoyYearCurrent, setYoyYearCurrent] = useState<number | null>(null);
  const [yoyYearPrevious, setYoyYearPrevious] = useState<number | null>(null);

  // Forecast filters
  const [forecastFromMonth, setForecastFromMonth] = useState("");
  const [forecastToMonth, setForecastToMonth] = useState("");
  const [excludeStartedWon, setExcludeStartedWon] = useState(true);

  // kept for future use (button removed from UI)
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: dealsData }, { data: companiesData }] = await Promise.all([
        supabase
          .from("deals")
          .select(
            "id, ap_number, company_id, enquiry_date, tender_return_date, stage, probability, tender_value, salesperson, estimated_start_date"
          ),
        supabase.from("companies").select("id, company_name"),
      ]);

      setDeals((dealsData || []) as Deal[]);
      setCompanies((companiesData || []) as Company[]);
      setLoading(false);
    };

    void load();
  }, []);

  // All distinct years (from all deals) for YoY selects
  const allYears = useMemo(() => {
    const set = new Set<number>();
    deals.forEach((d) => {
      if (!d.enquiry_date) return;
      const dt = new Date(d.enquiry_date);
      if (!Number.isNaN(dt.getTime())) {
        set.add(dt.getFullYear());
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [deals]);

  // Initialise YoY years once we know the available years
  useEffect(() => {
    if (allYears.length === 0) return;

    setYoyYearCurrent((prev) => prev ?? allYears[allYears.length - 1]);

    setYoyYearPrevious((prev) =>
      prev ??
      (allYears.length > 1
        ? allYears[allYears.length - 2]
        : allYears[allYears.length - 1])
    );
  }, [allYears]);

  // Helper: date filter (for enquiry_date, for most of the dashboard)
  const isWithinDateRange = (d: Deal) => {
    if (!dateFrom && !dateTo) return true;
    if (!d.enquiry_date) return false;

    const enquiry = new Date(d.enquiry_date);
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

  const filteredDeals = deals.filter((d) => {
    if (!isWithinDateRange(d)) return false;

    if (stageFilter && d.stage !== stageFilter) return false;

    if (salespersonFilter) {
      const sp = (d.salesperson || "").toLowerCase();
      if (sp !== salespersonFilter.toLowerCase()) return false;
    }

    return true;
  });

  // ---- GLOBAL KPIs (filtered) ----

  const totalTender = filteredDeals.reduce(
    (sum, d) => sum + toNumber(d.tender_value),
    0
  );

  const wonTender = filteredDeals
    .filter((d) => (d.stage || "").toLowerCase() === "won")
    .reduce((sum, d) => sum + toNumber(d.tender_value), 0);

  const expectedTender = filteredDeals.reduce(
    (sum, d) => sum + toNumber(d.tender_value) * getDealWeight(d),
    0
  );

  const winRate = totalTender > 0 ? wonTender / totalTender : null;

  // ---- Monthly pipeline & targets (filtered) ----

  const monthlyBuckets = useMemo(() => {
    const map = new Map<string, { total: number; won: number; target: number }>();

    filteredDeals.forEach((d) => {
      if (!d.enquiry_date) return;
      const dt = new Date(d.enquiry_date);
      if (Number.isNaN(dt.getTime())) return;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;

      const current =
        map.get(key) || {
          total: 0,
          won: 0,
          target: MONTHLY_TARGETS[key] || 0,
        };
      const val = toNumber(d.tender_value);
      current.total += val;
      if ((d.stage || "").toLowerCase() === "won") {
        current.won += val;
      }
      current.target = MONTHLY_TARGETS[key] || 0;
      map.set(key, current);
    });

    const arr = Array.from(map.entries()).map(([monthKey, v]) => ({
      monthKey,
      ...v,
    }));
    arr.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    return arr;
  }, [filteredDeals]);

  const maxMonthly = monthlyBuckets.reduce(
    (max, m) => Math.max(max, m.total, m.won, m.target),
    0
  );

  // ---- Forecast: by estimated start date, grouped by AP ----

  const forecastBuckets = useMemo(() => {
    if (deals.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // For forecast we respect salesperson filter, but ignore the enquiry date + stage filter.
    const base = deals.filter((d) => {
      if (salespersonFilter) {
        const sp = (d.salesperson || "").toLowerCase();
        if (sp !== salespersonFilter.toLowerCase()) return false;
      }
      return true;
    });

    // Collapse multiple tenders per AP number to the "best" one
    const collapsed = collapseDealsByAp(base);

    const map = new Map<
      string,
      {
        total: number; // sum of full tender values
        expected: number; // probability-weighted
        won: number; // won in that month
        target: number;
      }
    >();

    collapsed.forEach((d) => {
      if (!d.estimated_start_date) return;
      const dt = new Date(d.estimated_start_date);
      if (Number.isNaN(dt.getTime())) return;

      // Only include deals whose start month is within the forecast range
      if (!isDateInMonthRange(dt, forecastFromMonth, forecastToMonth)) {
        return;
      }

      const stage = (d.stage || "").toLowerCase();
      if (stage === "lost" || stage === "no tender") return;

      // Won but already started = not pipeline → exclude (if checkbox ticked)
      if (stage === "won" && excludeStartedWon && dt < today) {
        return;
      }

      const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
        2,
        "0"
      )}`;

      const current =
        map.get(monthKey) || {
          total: 0,
          expected: 0,
          won: 0,
          target: MONTHLY_TARGETS[monthKey] || 0,
        };

      const val = toNumber(d.tender_value);
      const weight = getDealWeight(d);

      current.total += val;
      current.expected += val * weight;
      if (stage === "won") {
        current.won += val;
      }
      current.target = MONTHLY_TARGETS[monthKey] || 0;

      map.set(monthKey, current);
    });

    const arr = Array.from(map.entries()).map(([monthKey, v]) => ({
      monthKey,
      ...v,
    }));
    arr.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    return arr;
  }, [deals, salespersonFilter, forecastFromMonth, forecastToMonth, excludeStartedWon]);

  const maxForecast = forecastBuckets.reduce(
    (max, m) => Math.max(max, m.total, m.expected, m.target),
    0
  );

  // ---- Salesperson breakdown (filtered) ----

  const salespersonMap = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        deals: number;
        total: number;
        won: number;
        expected: number;
      }
    >();

    filteredDeals.forEach((d) => {
      const name = d.salesperson?.trim() || "Unassigned";
      const existing =
        map.get(name) || {
          name,
          deals: 0,
          total: 0,
          won: 0,
          expected: 0,
        };

      const value = toNumber(d.tender_value);
      existing.deals += 1;
      existing.total += value;
      if ((d.stage || "").toLowerCase() === "won") {
        existing.won += value;
      }
      existing.expected += value * getDealWeight(d);

      map.set(name, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredDeals]);

  // ---- Top 10 clients this year (by won value) (all deals) ----

  const now = new Date();
  const currentYear = now.getFullYear();

  const topClients = useMemo(() => {
    const map = new Map<
      string,
      {
        companyId: string;
        companyName: string;
        totalWon: number;
        totalTender: number;
      }
    >();

    deals.forEach((d) => {
      if (!d.enquiry_date || !d.company_id) return;
      const dt = new Date(d.enquiry_date);
      if (Number.isNaN(dt.getTime())) return;
      if (dt.getFullYear() !== currentYear) return;

      const company = companies.find((c) => c.id === d.company_id);
      const companyName = company?.company_name || "Unknown";

      const existing =
        map.get(d.company_id) || {
          companyId: d.company_id,
          companyName,
          totalWon: 0,
          totalTender: 0,
        };

      const val = toNumber(d.tender_value);
      existing.totalTender += val;

      if ((d.stage || "").toLowerCase() === "won") {
        existing.totalWon += val;
      }

      map.set(d.company_id, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.totalWon - a.totalWon)
      .slice(0, 10);
  }, [deals, companies, currentYear]);

  // ---- Distinct salespeople for filter ----

  const distinctSalespeople = useMemo(
    () =>
      Array.from(new Set(deals.map((d) => (d.salesperson || "").trim())))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [deals]
  );

  // ---- Enquiries / month YoY (ALL data, ignores filters) ----
  const yoyData = useMemo(() => {
    if (deals.length === 0 || yoyYearCurrent === null || yoyYearPrevious === null) {
      return null;
    }

    const buildYearMonthCounts = (year: number) => {
      const map = new Map<number, number>();
      deals.forEach((d) => {
        if (!d.enquiry_date) return;
        const dt = new Date(d.enquiry_date);
        if (Number.isNaN(dt.getTime())) return;
        if (dt.getFullYear() !== year) return;
        const monthIndex = dt.getMonth(); // 0–11
        map.set(monthIndex, (map.get(monthIndex) || 0) + 1);
      });
      return map;
    };

    const currentMap = buildYearMonthCounts(yoyYearCurrent);
    const prevMap = buildYearMonthCounts(yoyYearPrevious);

    const rows: YoYRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push({
        monthIndex: i,
        monthName: MONTH_NAMES[i],
        currentYearCount: currentMap.get(i) || 0,
        previousYearCount: prevMap.get(i) || 0,
      });
    }

    const totalCurrent = rows.reduce((sum, r) => sum + r.currentYearCount, 0);
    const totalPrev = rows.reduce((sum, r) => sum + r.previousYearCount, 0);

    const avgCurrent = totalCurrent / 12;
    const avgPrev = totalPrev / 12;
    const delta = avgPrev > 0 ? (avgCurrent - avgPrev) / avgPrev : null;

    return {
      currentYear: yoyYearCurrent,
      previousYear: yoyYearPrevious,
      rows,
      avgCurrent,
      avgPrev,
      delta,
    };
  }, [deals, yoyYearCurrent, yoyYearPrevious]);

  return (
    <div className="p-6 space-y-6 bg-gray-50">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            BD / Pipeline Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            High-level view of tenders, wins, and pipeline performance.
          </p>
        </div>
      </div>

      {/* Filters */}
      <section className="rounded border bg-white p-4 shadow-sm print:hidden">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">
            Filters
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Enquiry date from
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
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
              className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Stage
            </label>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
            >
              <option value="">All stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              Salesperson
            </label>
            <select
              value={salespersonFilter}
              onChange={(e) => setSalespersonFilter(e.target.value)}
              className="w-full rounded border px-2 py-2 text-sm bg-white text-gray-900"
            >
              <option value="">All</option>
              {distinctSalespeople.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
              {distinctSalespeople.length === 0 && (
                <option value="" disabled>
                  No salesperson data
                </option>
              )}
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setStageFilter("");
              setSalespersonFilter("");
            }}
            className="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Reset filters
          </button>
        </div>
      </section>

      {/* KPIs */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">
            Key Metrics (filtered)
          </h2>
          <button
            type="button"
            onClick={() => setShowKpis((v) => !v)}
            className="text-xs text-gray-500"
          >
            {showKpis ? "Hide" : "Show"}
          </button>
        </div>

        {showKpis && (
          <>
            {loading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-4 text-sm">
                <div className="border rounded p-3">
                  <div className="text-gray-500 text-xs mb-1">
                    Total tender value
                  </div>
                  <div className="text-xl font-bold">
                    {formatCurrency(totalTender)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Across {filteredDeals.length} deal
                    {filteredDeals.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="border rounded p-3">
                  <div className="text-gray-500 text-xs mb-1">
                    Won value
                  </div>
                  <div className="text-xl font-bold">
                    {formatCurrency(wonTender)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Win rate (by value):{" "}
                    {winRate == null
                      ? "—"
                      : `${Math.round(winRate * 100)}%`}
                  </div>
                </div>

                <div className="border rounded p-3">
                  <div className="text-gray-500 text-xs mb-1">
                    Expected value
                  </div>
                  <div className="text-xl font-bold">
                    {formatCurrency(expectedTender)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Won = 100%, Lost / No Tender = 0, A/B/C/D weighted.
                  </div>
                </div>

                <div className="border rounded p-3">
                  <div className="text-gray-500 text-xs mb-1">
                    Avg deal size
                  </div>
                  <div className="text-xl font-bold">
                    {filteredDeals.length === 0
                      ? "—"
                      : formatCurrency(totalTender / filteredDeals.length)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Based on filtered deals only.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Enquiries / month YoY (all data, specific years) */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">
            Enquiries per month – year-on-year
          </h2>
          <button
            type="button"
            onClick={() => setShowYoy((v) => !v)}
            className="text-xs text-gray-500"
          >
            {showYoy ? "Hide" : "Show"}
          </button>
        </div>

        {showYoy && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              Uses <strong>all enquiries in the system</strong> (ignores
              the filters above). You can choose which years to compare.
            </p>

            {allYears.length === 0 ||
            yoyYearCurrent === null ||
            yoyYearPrevious === null ? (
              <p className="text-sm text-gray-500">
                Not enough data yet to calculate year-on-year enquiries.
              </p>
            ) : (
              <>
                {/* Year selectors */}
                <div className="flex flex-wrap gap-3 mb-3 text-xs">
                  <div>
                    <label className="block text-gray-600 mb-1">
                      Current year
                    </label>
                    <select
                      value={yoyYearCurrent}
                      onChange={(e) =>
                        setYoyYearCurrent(Number(e.target.value) || null)
                      }
                      className="border rounded px-2 py-1 bg-white text-gray-900"
                    >
                      {allYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1">
                      Comparison year
                    </label>
                    <select
                      value={yoyYearPrevious}
                      onChange={(e) =>
                        setYoyYearPrevious(Number(e.target.value) || null)
                      }
                      className="border rounded px-2 py-1 bg-white text-gray-900"
                    >
                      {allYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {yoyData === null ? (
                  <p className="text-sm text-gray-500">
                    Not enough data for the selected years.
                  </p>
                ) : (
                  <>
                    {/* KPI row */}
                    <div className="grid gap-4 md:grid-cols-3 text-sm mb-4">
                      <div className="border rounded p-3">
                        <div className="text-gray-500 text-xs mb-1">
                          Avg enquiries / month ({yoyData.currentYear})
                        </div>
                        <div className="text-xl font-bold">
                          {yoyData.avgCurrent.toFixed(1)}
                        </div>
                      </div>
                      <div className="border rounded p-3">
                        <div className="text-gray-500 text-xs mb-1">
                          Avg enquiries / month ({yoyData.previousYear})
                        </div>
                        <div className="text-xl font-bold">
                          {yoyData.avgPrev.toFixed(1)}
                        </div>
                      </div>
                      <div className="border rounded p-3">
                        <div className="text-gray-500 text-xs mb-1">
                          Year-on-year change
                        </div>
                        <div className="text-xl font-bold">
                          {yoyData.delta === null
                            ? "—"
                            : `${
                                yoyData.delta >= 0 ? "+" : ""
                              }${Math.round(yoyData.delta * 100)}%`}
                        </div>
                      </div>
                    </div>

                    {/* Month-by-month table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Month</th>
                            <th className="text-left p-2">
                              Enquiries {yoyData.currentYear}
                            </th>
                            <th className="text-left p-2">
                              Enquiries {yoyData.previousYear}
                            </th>
                            <th className="text-left p-2">Δ</th>
                            <th className="text-left p-2">Δ %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yoyData.rows.map((r) => {
                            const diff =
                              r.currentYearCount - r.previousYearCount;
                            const pct =
                              r.previousYearCount > 0
                                ? (diff / r.previousYearCount) * 100
                                : null;
                            return (
                              <tr key={r.monthIndex} className="border-b">
                                <td className="p-2">{r.monthName}</td>
                                <td className="p-2">{r.currentYearCount}</td>
                                <td className="p-2">{r.previousYearCount}</td>
                                <td className="p-2">
                                  {diff > 0
                                    ? `+${diff}`
                                    : diff === 0
                                    ? "0"
                                    : diff}
                                </td>
                                <td className="p-2">
                                  {pct === null
                                    ? "—"
                                    : `${
                                        pct >= 0 ? "+" : ""
                                      }${Math.round(pct)}%`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>

      {/* Forecast by estimated start date (pipeline) */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="mb-0 text-base font-semibold text-gray-800">
            Forecast by estimated start date (pipeline)
          </h2>
          <button
            type="button"
            onClick={() => setShowForecast((v) => !v)}
            className="text-xs text-gray-500"
          >
            {showForecast ? "Hide" : "Show"}
          </button>
        </div>

        {showForecast && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              Uses <strong>estimated start date</strong> on each deal.
              Multiple tenders for the same AP are collapsed to the{" "}
              <strong>best</strong> tender (highest stage / probability).
              Won jobs with a start date in the past are excluded from
              pipeline if{" "}
              <span className="font-semibold">
                &quot;Exclude started Won jobs&quot;
              </span>{" "}
              is ticked. Deals marked <strong>No Tender</strong> are also
              excluded from the pipeline.
            </p>

            {/* Forecast filters */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs">
              <div>
                <label className="block text-gray-600 mb-1">
                  Start month from
                </label>
                <input
                  type="month"
                  value={forecastFromMonth}
                  onChange={(e) => setForecastFromMonth(e.target.value)}
                  className="border rounded px-2 py-1 bg-white text-gray-900"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">
                  Start month to
                </label>
                <input
                  type="month"
                  value={forecastToMonth}
                  onChange={(e) => setForecastToMonth(e.target.value)}
                  className="border rounded px-2 py-1 bg-white text-gray-900"
                />
              </div>
              <label className="flex items-center gap-2 mt-5">
                <input
                  type="checkbox"
                  checked={excludeStartedWon}
                  onChange={(e) => setExcludeStartedWon(e.target.checked)}
                />
                <span className="text-gray-700">
                  Exclude Won jobs with start date in the past
                </span>
              </label>
            </div>

            {forecastBuckets.length === 0 ? (
              <p className="text-sm text-gray-500">
                No forecastable deals for the selected criteria.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-end gap-4 text-[11px] text-gray-500">
                  <span>
                    <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-1" />
                    Total tender (per best AP)
                  </span>
                  <span>
                    <span className="inline-block w-3 h-3 rounded-full bg-purple-500 mr-1" />
                    Expected value (probability-weighted)
                  </span>
                  <span>
                    <span className="inline-block w-3 h-3 rounded-full bg-gray-800 mr-1" />
                    Target
                  </span>
                </div>
                {forecastBuckets.map((m) => {
                  const totalWidth =
                    maxForecast > 0 ? (m.total / maxForecast) * 100 : 0;
                  const expectedWidth =
                    maxForecast > 0 ? (m.expected / maxForecast) * 100 : 0;
                  const targetWidth =
                    maxForecast > 0 ? (m.target / maxForecast) * 100 : 0;

                  const [year, month] = m.monthKey.split("-");
                  const label = `${month}/${year}`;

                  return (
                    <div key={m.monthKey} className="flex items-center gap-3">
                      <div className="w-16 text-gray-700 text-xs">
                        {label}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${totalWidth}%` }}
                          />
                        </div>
                        <div className="h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-purple-500"
                            style={{ width: `${expectedWidth}%` }}
                          />
                        </div>
                        <div className="h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-gray-800"
                            style={{ width: `${targetWidth}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-48 text-right text-[11px]">
                        <div>
                          Total (best per AP): {formatCurrency(m.total)}
                        </div>
                        <div>
                          Expected (weighted): {formatCurrency(m.expected)}
                        </div>
                        <div>
                          Target: {formatCurrency(m.target)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Monthly chart + targets (filtered) */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="mb-0 text-base font-semibold text-gray-800">
            Pipeline over time (monthly, filtered)
          </h2>
          <button
            type="button"
            onClick={() => setShowMonthly((v) => !v)}
            className="text-xs text-gray-500"
          >
            {showMonthly ? "Hide" : "Show"}
          </button>
        </div>

        {showMonthly && (
          <>
            {monthlyBuckets.length === 0 ? (
              <p className="text-sm text-gray-500">
                No deals match the current filters.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-end gap-4 text-[11px] text-gray-500">
                  <span>
                    <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-1" />
                    Total tender
                  </span>
                  <span>
                    <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-1" />
                    Won
                  </span>
                  <span>
                    <span className="inline-block w-3 h-3 rounded-full bg-gray-800 mr-1" />
                    Target
                  </span>
                </div>
                {monthlyBuckets.map((m) => {
                  const totalWidth =
                    maxMonthly > 0 ? (m.total / maxMonthly) * 100 : 0;
                  const wonWidth =
                    maxMonthly > 0 ? (m.won / maxMonthly) * 100 : 0;
                  const targetWidth =
                    maxMonthly > 0 ? (m.target / maxMonthly) * 100 : 0;

                  const [year, month] = m.monthKey.split("-");
                  const label = `${month}/${year}`;

                  return (
                    <div key={m.monthKey} className="flex items-center gap-3">
                      <div className="w-16 text-gray-700 text-xs">
                        {label}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${totalWidth}%` }}
                          />
                        </div>
                        <div className="h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${wonWidth}%` }}
                          />
                        </div>
                        <div className="h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-gray-800"
                            style={{ width: `${targetWidth}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-40 text-right text-[11px]">
                        <div>
                          Total: {formatCurrency(m.total)}
                        </div>
                        <div>
                          Won: {formatCurrency(m.won)}
                        </div>
                        <div>
                          Target: {formatCurrency(m.target)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Salesperson breakdown (filtered) */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="mb-0 text-base font-semibold text-gray-800">
            By salesperson / estimator (filtered)
          </h2>
          <button
            type="button"
            onClick={() => setShowSalespeople((v) => !v)}
            className="text-xs text-gray-500"
          >
            {showSalespeople ? "Hide" : "Show"}
          </button>
        </div>

        {showSalespeople && (
          <>
            {salespersonMap.length === 0 ? (
              <p className="text-sm text-gray-500">
                No deals match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">
                        Salesperson
                      </th>
                      <th className="text-left p-2">Deals</th>
                      <th className="text-left p-2">
                        Total value
                      </th>
                      <th className="text-left p-2">
                        Won value
                      </th>
                      <th className="text-left p-2">Win rate</th>
                      <th className="text-left p-2">
                        Expected value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {salespersonMap.map((s) => {
                      const winRateSp =
                        s.total > 0 ? s.won / s.total : null;
                      return (
                        <tr key={s.name} className="border-b">
                          <td className="p-2">{s.name}</td>
                          <td className="p-2">{s.deals}</td>
                          <td className="p-2">
                            {formatCurrency(s.total)}
                          </td>
                          <td className="p-2">
                            {formatCurrency(s.won)}
                          </td>
                          <td className="p-2">
                            {winRateSp == null
                              ? "—"
                              : `${Math.round(
                                  winRateSp * 100
                                )}%`}
                          </td>
                          <td className="p-2">
                            {formatCurrency(s.expected)}
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

      {/* Top 10 clients this year (by won value) */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="mb-0 text-base font-semibold text-gray-800">
            Top 10 clients this year (by won value)
          </h2>
          <button
            type="button"
            onClick={() => setShowTopClients((v) => !v)}
            className="text-xs text-gray-500"
          >
            {showTopClients ? "Hide" : "Show"}
          </button>
        </div>

        {showTopClients && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Year: {currentYear}. Based on enquiry date and
              &quot;Won&quot; deals.
            </p>
            {topClients.length === 0 ? (
              <p className="text-sm text-gray-500">
                No deals found for {currentYear}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Client</th>
                      <th className="text-left p-2">
                        Won value
                      </th>
                      <th className="text-left p-2">
                        Total tender
                      </th>
                      <th className="text-left p-2">
                        Win rate (by value)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topClients.map((c, idx) => {
                      const winRateClient =
                        c.totalTender > 0
                          ? c.totalWon / c.totalTender
                          : null;
                      return (
                        <tr key={c.companyId} className="border-b">
                          <td className="p-2">
                            {idx + 1}
                          </td>
                          <td className="p-2">
                            {c.companyName}
                          </td>
                          <td className="p-2">
                            {formatCurrency(c.totalWon)}
                          </td>
                          <td className="p-2">
                            {formatCurrency(c.totalTender)}
                          </td>
                          <td className="p-2">
                            {winRateClient == null
                              ? "—"
                              : `${Math.round(
                                  winRateClient * 100
                                )}%`}
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
    </div>
  );
}
