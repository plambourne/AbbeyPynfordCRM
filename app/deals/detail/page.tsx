"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Deal = {
  id: string;
  ap_number: number | null;
  lead_source: string | null;
  client_name: string | null;
  contact_name: string | null;
  site_name: string | null;
  site_address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  enquiry_date: string | null;
  tender_return_date: string | null;
  estimated_start_date: string | null; // stored as YYYY-MM-DD (first of month)
  created_at: string;
  company_id: string | null;
  stage: string | null;
  probability: string | null;
  notes: string | null;

  tender_value: number | null;
  tender_cost: number | null;
  tender_margin: number | null;
  tender_margin_percent: number | null;
    works_category: string | null;
  works_subcategory: string | null;


  /** NEW: link to staff_profiles.id */
  salesperson_id: string | null;
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

type DealAction = {
  id: string;
  deal_id: string;
  action_type: string | null;
  notes: string | null;
  file_url: string | null;
  created_at: string;
};

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
  created_at: string;
};

type Staff = {
  id: string;
  full_name: string;
};

const STAGES = [
  "Received",
  "Qualified",
  "In Review",
  "Quote Submitted",
  "Won",
  "Lost",
  "No Tender",
] as const;

const PROB_OPTIONS = ["A", "B", "C", "D"] as const;

const WORKS_CATEGORY_OPTIONS = [
  "Housedeck",
  "Piling",
  "Slab",
  "Other",
] as const;
const PROB_COLORS: Record<string, string> = {
  A: "bg-green-500",
  B: "bg-blue-500",
  C: "bg-orange-500",
  D: "bg-red-500",
};

const HOUSEDECK_SUBCATEGORY_OPTIONS = [
  "Floodsafe",
  "Standard",
  "Other",
] as const;

const ACTION_TYPE_OPTIONS = [
  "Drawing issue",
  "Phone call",
  "Email",
  "Meeting",
  "Site visit",
  "RFI / Query",
  "Status update",
  "Other",
];

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// RAG for due dates
type DueStatus = "overdue" | "due_soon" | "future" | "no_date";

const getDueStatus = (dueDate: string | null): DueStatus => {
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
};

const dueDotClass = (status: DueStatus) => {
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
};

// Make URLs clickable in notes (returns HTML string)
const linkify = (text: string) => {
  if (!text) return "";
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">${url}</a>`;
  });
};

const formatNumber = (value: number | null, decimals = 2) => {
  if (value === null || Number.isNaN(value)) return "";
  return value.toFixed(decimals);
};

const formatDate = (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—");
const formatDateTime = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

// Show a YYYY-MM-DD date as YYYY-MM for <input type="month">
const toMonthInputValue = (dateStr: string | null) => {
  if (!dateStr) return "";
  // e.g. "2025-03-01" → "2025-03"
  return dateStr.slice(0, 7);
};
  // -----------------------
  // Works category / subcategory handlers
  // -----------------------
  const handleWorksCategoryChange = async (value: string) => {
    if (!lead) return;

    const newCategory = value || null;
    const shouldClearSubcategory = newCategory !== "Housedeck";

    // optimistic local update – also clear subcategory if not Housedeck
    setLead((prev) =>
      prev
        ? {
            ...prev,
            works_category: newCategory,
            ...(shouldClearSubcategory ? { works_subcategory: null } : {}),
          }
        : prev
    );

    await updateLeadField("works_category", newCategory);
    if (shouldClearSubcategory) {
      await updateLeadField("works_subcategory", null);
    }
  };

  const handleWorksSubcategoryChange = async (value: string) => {
    if (!lead) return;
    const newSub = value || null;

    // optimistic local update
    setLead((prev) =>
      prev ? { ...prev, works_subcategory: newSub } : prev
    );

    await updateLeadField("works_subcategory", newSub);
  };


// Save "YYYY-MM" from the month picker as a full date in the DB ("YYYY-MM-01")
const saveEstimatedStartMonth = async (
  value: string,
  updateFn: (field: keyof Deal, v: any) => Promise<void>
) => {
  const dbValue = value ? `${value}-01` : null;
  await updateFn("estimated_start_date", dbValue);
};

function DealDetailInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [lead, setLead] = useState<Deal | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  

  // Actions / Timeline
  const [actions, setActions] = useState<DealAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(true);
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({
    action_type: "",
    notes: "",
    file_url: "",
  });

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Stage gate modal
  const [gateModalOpen, setGateModalOpen] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [gateAnswers, setGateAnswers] = useState<Record<string, string>>({});

  // Collapsible groups
  const [showSiteDetails, setShowSiteDetails] = useState(true);
  const [showNotesTimeline, setShowNotesTimeline] = useState(true);

  // Tender summary draft state (strings for inputs)
  const [tenderDraft, setTenderDraft] = useState({
    tender_value: "",
    tender_cost: "",
    tender_margin: "",
    tender_margin_percent: "",
  });
  const [tenderSaving, setTenderSaving] = useState(false);
  const [tenderError, setTenderError] = useState<string | null>(null);
  const [tenderSuccess, setTenderSuccess] = useState<string | null>(null);

  const id = searchParams.get("id");

  const formatAddress = (c: Company | null) =>
    c
      ? [c.address_line1, c.address_line2, c.town_city, c.county, c.postcode]
          .filter(Boolean)
          .join(", ")
      : "—";

  const currentStage =
    lead?.stage && STAGES.includes(lead.stage as (typeof STAGES)[number])
      ? (lead.stage as (typeof STAGES)[number])
      : "Received";

  const currentStageIndex = STAGES.indexOf(currentStage);

  const isTerminalStage =
  currentStage === "Won" || currentStage === "Lost" || currentStage === "No Tender";

  // Helper for gating answers
  const ans = (key: string) => (gateAnswers[key] || "").trim();

  // How many quote submissions so far (v1, v2, v3…)
  const getQuoteSubmissionCount = () => {
    return actions.filter((a) => a.action_type?.startsWith("Stage gate: Quote Submitted")).length;
  };

  const openTasks = tasks.filter((t) => t.status !== "done");

  const getStaffName = (id: string | null) => {
    if (!id) return "Unassigned";
    const s = staff.find((p) => p.id === id);
    return s ? s.full_name : "Unknown";
  };

  // -----------------------
  // Load tasks for a deal
  // -----------------------
  const loadTasksForDeal = async (dealId: string) => {
    setTasksLoading(true);
    setTasksError(null);

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, description, status, priority, due_date, assigned_to, created_at")
      .eq("deal_id", dealId)
      .order("due_date", { ascending: true });

    if (error) {
      console.error(error);
      setTasksError("Could not load tasks for this lead.");
    } else {
      setTasks((data || []) as Task[]);
    }

    setTasksLoading(false);
  };

  // -----------------------
  // Load staff
  // -----------------------
  useEffect(() => {
    const loadStaff = async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .order("full_name", { ascending: true });

      if (error) {
        console.error(error);
        setStaffError("Could not load staff list.");
      } else {
        setStaff((data || []) as Staff[]);
      }
    };

    void loadStaff();
  }, []);

  // -----------------------
  // Load actions for a deal
  // -----------------------
  const loadActions = async (dealId: string) => {
    setLoadingActions(true);
    const { data, error } = await supabase
      .from("deal_actions")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setActionError("Could not load actions.");
    } else {
      setActions((data || []) as DealAction[]);
      setActionError(null);
    }

    setLoadingActions(false);
  };

  // -----------------------
  // Load lead + company + tasks + actions
  // -----------------------
  useEffect(() => {
    const load = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      const { data: deal, error } = await supabase.from("deals").select("*").eq("id", id).single();

      if (error) {
        console.error(error);
        setError("Could not load lead.");
        setLoading(false);
        return;
      }

      const typedDeal = deal as Deal;
      setLead(typedDeal);

      // Seed tender draft values from deal
      setTenderDraft({
        tender_value: typedDeal.tender_value != null ? formatNumber(typedDeal.tender_value) : "",
        tender_cost: typedDeal.tender_cost != null ? formatNumber(typedDeal.tender_cost) : "",
        tender_margin:
          typedDeal.tender_margin != null ? formatNumber(typedDeal.tender_margin) : "",
        tender_margin_percent:
          typedDeal.tender_margin_percent != null
            ? formatNumber(typedDeal.tender_margin_percent, 1)
            : "",
      });

      if (typedDeal.company_id) {
        const { data: comp, error: compError } = await supabase
          .from("companies")
          .select("*")
          .eq("id", typedDeal.company_id)
          .single();

        if (!compError && comp) {
          setCompany(comp as Company);
        }
      }

      // Load actions timeline & tasks
      await loadActions(typedDeal.id);
      await loadTasksForDeal(typedDeal.id);

      setLoading(false);
    };

    void load();
  }, [id]);

  // -----------------------
  // Generic field update helper
  // -----------------------
  const updateLeadField = async (field: keyof Deal, value: any) => {
    if (!lead) return;
    setSavingField(field);
    setError(null);

    const previousValue = (lead as any)[field];

    // Optimistic update
    setLead({ ...lead, [field]: value });

    const { error } = await supabase.from("deals").update({ [field]: value }).eq("id", lead.id);

    if (error) {
      console.error(error);
      setError(`Could not update ${field}.`);
      // revert optimistic update
      setLead((prev) => (prev ? { ...prev, [field]: previousValue } : prev));
    } else {
      // If stage changed, create an automatic action log entry
      if (field === "stage" && previousValue !== value) {
        const { data: actionData, error: actionError } = await supabase
          .from("deal_actions")
          .insert({
            deal_id: lead.id,
            action_type: "Stage changed",
            notes: `Stage changed from ${previousValue || "none"} to ${value}`,
          })
          .select()
          .single();

        if (!actionError && actionData) {
          setActions((prev) => [actionData as DealAction, ...prev]);
        }
      }
    }

    setSavingField(null);
  };

  const handleTextChange = (
    field: keyof Deal,
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!lead) return;
    const value = e.target.value;
    setLead({ ...lead, [field]: value as any });
  };

  const handleTextBlur = async (field: keyof Deal) => {
    if (!lead) return;
    await updateLeadField(field, (lead as any)[field]);
  };

  const handleDateChange = async (field: keyof Deal, value: string) => {
    await updateLeadField(field, value || null);
  };

  const handleProbabilityClick = async (prob: (typeof PROB_OPTIONS)[number]) => {
    if (!lead) return;
    await updateLeadField("probability", prob);
  };

  // -----------------------
  // Gate validation helpers
  // -----------------------
  const areAllQualifiedGateQuestionsComplete = () => {
    if (!ans("scope_works")) return false;
    if (!ans("est_start_month")) return false;
    if (!ans("qualified_tender_return_date")) return false;
    if (!ans("scheme_size")) return false;

    if (ans("scheme_size") === "Multiple Plots") {
      if (!ans("multi_basis")) return false;
      if (ans("multi_basis") === "Individual Plots" && !ans("multi_plot_numbers")) return false;
      if (!ans("multi_extra_over_offered")) return false;
      if (!ans("multi_extra_over_client_agreed")) return false;
    }

    return true;
  };

  const areAllInReviewGateQuestionsComplete = () => {
    if (!ans("arch_housetype")) return false;
    if (!ans("arch_siteplans")) return false;
    if (!ans("civils_levels")) return false;
    if (!ans("civils_drainage")) return false;
    if (!ans("si_depth")) return false;
    if (!ans("drawings_in_sharepoint")) return false;
    return true;
  };

  const areAllQuoteSubmittedGateQuestionsComplete = () => {
    if (!ans("quote_reference")) return false;
    if (!ans("quote_date")) return false;
    if (!ans("quote_submission_link")) return false;
    if (!ans("quote_drawings_link")) return false;
    if (!ans("tender_value")) return false;
    if (!ans("tender_cost")) return false;
    if (!ans("tender_margin")) return false;
    if (!ans("tender_margin_percent")) return false;
    if (!ans("key_material_rates")) return false;
    if (!ans("overall_duration")) return false;
    if (!ans("phases_priced")) return false;

    return true;
  };

  // Helper: recompute tender margin and % for quote gate modal
  const updateGateFinance = (field: "tender_value" | "tender_cost", value: string) => {
    setGateAnswers((prev) => {
      const next = { ...prev, [field]: value };
      const val = parseFloat(next.tender_value || "0");
      const cost = parseFloat(next.tender_cost || "0");

      if (!Number.isNaN(val) && !Number.isNaN(cost) && val !== 0) {
        const margin = val - cost;
        const marginPercent = (margin / val) * 100;
        next.tender_margin = margin.toFixed(2);
        next.tender_margin_percent = marginPercent.toFixed(1);
      } else {
        next.tender_margin = "";
        next.tender_margin_percent = "";
      }

      return next;
    });
  };

  // -----------------------
  // Stage click handler
  // -----------------------
  const handleStageClick = (stage: string) => {
    if (!lead) return;
    if (stage === currentStage) return;

    // If this lead is already No Tender, do not allow moving to any other stage
    if (currentStage === "No Tender" && stage !== "No Tender") {
      setError("This lead has been marked 'No Tender' and cannot move to another stage.");
      return;
    }

// Moving *to* No Tender – lock the deal there
if (stage === "No Tender") {
  const ok = window.confirm(
    "Mark this lead as 'No Tender'? This will lock the stage and you won't be able to move it to another stage."
  );
  if (!ok) return;

  // Clear probability immediately
  void updateLeadField("probability", null);
  void updateLeadField("stage", "No Tender");
  return;
}


    // Don't allow moving back to Received once you've left it
    if (stage === "Received" && currentStage !== "Received") {
      setError("Moving back to 'Received' is disabled. Use notes or actions to record any changes.");
      return;
    }

    // Cannot mark Won/Lost without tender summary completed
    if (stage === "Won" || stage === "Lost") {
      const { tender_value, tender_cost, tender_margin, tender_margin_percent } = lead;
      if (
        tender_value == null ||
        tender_cost == null ||
        tender_margin == null ||
        tender_margin_percent == null
      ) {
        setError("Tender summary must be completed before marking this deal as Won or Lost.");
        return;
      }
    }
// If moving to Won / Lost, clear probability immediately
if (stage === "Won" || stage === "Lost") {
  void updateLeadField("probability", null);
}

    // Received -> Qualified gate
    if (stage === "Qualified") {
      const initialAnswers: Record<string, string> = {
        scope_works: "",
        est_start_month: "",
        qualified_tender_return_date: lead.tender_return_date || "",
        scheme_size: "",
        multi_basis: "",
        multi_plot_numbers: "",
        multi_extra_over_offered: "",
        multi_extra_over_client_agreed: "",
      };
      setPendingStage(stage);
      setGateAnswers(initialAnswers);
      setGateModalOpen(true);
      return;
    }

    // Qualified -> In Review gate
    if (stage === "In Review") {
      const initialAnswers: Record<string, string> = {
        arch_housetype: "",
        arch_siteplans: "",
        civils_levels: "",
        civils_drainage: "",
        si_depth: "",
        drawings_in_sharepoint: "",
        sharepoint_link: "",
      };
      setPendingStage(stage);
      setGateAnswers(initialAnswers);
      setGateModalOpen(true);
      return;
    }

    // In Review -> Quote Submitted gate
    if (stage === "Quote Submitted") {
      const initialAnswers: Record<string, string> = {
        quote_reference: "",
        quote_date: "",
        quote_submission_link: "",
        quote_drawings_link: "",
        tender_value:
          lead.tender_value != null ? formatNumber(lead.tender_value) : tenderDraft.tender_value,
        tender_cost:
          lead.tender_cost != null ? formatNumber(lead.tender_cost) : tenderDraft.tender_cost,
        tender_margin:
          lead.tender_margin != null ? formatNumber(lead.tender_margin) : tenderDraft.tender_margin,
        tender_margin_percent:
          lead.tender_margin_percent != null
            ? formatNumber(lead.tender_margin_percent, 1)
            : tenderDraft.tender_margin_percent,
        key_material_rates: "",
        overall_duration: "",
        phases_priced: "",
      };

      setPendingStage(stage);
      setGateAnswers(initialAnswers);
      setGateModalOpen(true);
      return;
    }

    // Other stages – no gate
    void updateLeadField("stage", stage);
  };

  // -----------------------
  // CONFIRM: Received -> Qualified
  // -----------------------
  const handleConfirmStageChangeToQualified = async () => {
    if (!pendingStage || pendingStage !== "Qualified") return;
    if (!areAllQualifiedGateQuestionsComplete()) return;
    if (!lead) return;

    const newTenderReturn = ans("qualified_tender_return_date") || null;
    if (newTenderReturn) {
      await updateLeadField("tender_return_date", newTenderReturn);
    }

    const estimatedStart = ans("est_start_month") || null;
    if (estimatedStart) {
      // Save the month/year selected in the gate to the deal (as YYYY-MM-01)
      await updateLeadField("estimated_start_date", `${estimatedStart}-01`);
    }

    const summaryLines: string[] = [
      "Stage gate: Received → Qualified",
      "",
      `General scope of works: ${ans("scope_works")}`,
      `Estimated start (month/year): ${ans("est_start_month")}`,
      `Tender return date (at qualification): ${ans("qualified_tender_return_date")}`,
      `Scheme size: ${ans("scheme_size")}`,
    ];

    if (ans("scheme_size") === "Multiple Plots") {
      summaryLines.push(`Pricing basis: ${ans("multi_basis")}`);
      if (ans("multi_basis") === "Individual Plots") {
        summaryLines.push(`Plots requiring pricing: ${ans("multi_plot_numbers")}`);
      }
      summaryLines.push(
        `Extra-over for whole site allowed: ${ans("multi_extra_over_offered")}`,
        `Client agreed to extra-over: ${ans("multi_extra_over_client_agreed")}`
      );
    }

    const detailsText = summaryLines.join("\n");

    const { data: logData, error: logError } = await supabase
      .from("deal_actions")
      .insert({
        deal_id: lead.id,
        action_type: "Stage gate: Qualified",
        notes: detailsText,
      })
      .select()
      .single();

    if (logError) {
      console.error(logError);
    } else if (logData) {
      setActions((prev) => [logData as DealAction, ...prev]);
    }

    await updateLeadField("stage", "Qualified");

    setGateModalOpen(false);
    setPendingStage(null);
    setGateAnswers({});
  };

  // -----------------------
  // CONFIRM: Qualified -> In Review
  // -----------------------
  const handleConfirmStageChangeToInReview = async () => {
    if (!pendingStage || pendingStage !== "In Review") return;
    if (!areAllInReviewGateQuestionsComplete()) return;
    if (!lead) return;

    const sharepointLink = ans("sharepoint_link");

    const summaryLines: string[] = [
      "Stage gate: Qualified → In Review",
      "",
      "Drawings received:",
      `Architect – Housetypes: ${
        ans("arch_housetype") === "Yes" ? "Received" : "Not received"
      }`,
      `Architect – Site plans: ${ans("arch_siteplans") === "Yes" ? "Received" : "Not received"}`,
      `Civils – External level layouts: ${
        ans("civils_levels") === "Yes" ? "Received" : "Not received"
      }`,
      `Civils – Drainage layouts: ${
        ans("civils_drainage") === "Yes" ? "Received" : "Not received"
      }`,
      "",
      `Site investigation depth contained in tender info (m): ${ans("si_depth")}`,
      "",
      `All drawings placed in SharePoint & labelled as date received: ${ans(
        "drawings_in_sharepoint"
      )}`,
    ];

    if (sharepointLink) {
      summaryLines.push(`SharePoint location: ${sharepointLink}`);
    }

    const detailsText = summaryLines.join("\n");

    const { data: logData, error: logError } = await supabase
      .from("deal_actions")
      .insert({
        deal_id: lead.id,
        action_type: "Stage gate: In Review",
        notes: detailsText,
      })
      .select()
      .single();

    if (logError) {
      console.error("Failed to insert In Review gate action", logError);
    } else if (logData) {
      setActions((prev) => [logData as DealAction, ...prev]);
    }

    await updateLeadField("stage", "In Review");

    setGateModalOpen(false);
    setPendingStage(null);
    setGateAnswers({});
  };

  // -----------------------
  // CONFIRM: In Review -> Quote Submitted (with versions)
  // -----------------------
  const handleConfirmStageChangeToQuoteSubmitted = async () => {
    if (!pendingStage || pendingStage !== "Quote Submitted") return;
    if (!areAllQuoteSubmittedGateQuestionsComplete()) return;
    if (!lead) return;

    // Parse tender numbers from answers
    const tenderValue = parseFloat(ans("tender_value"));
    const tenderCost = parseFloat(ans("tender_cost"));

    if (Number.isNaN(tenderValue) || Number.isNaN(tenderCost) || tenderValue === 0) {
      setError("Please enter valid numeric values for tender value and cost.");
      return;
    }

    const tenderMargin = tenderValue - tenderCost;
    const tenderMarginPercent = (tenderMargin / tenderValue) * 100;

    // Determine quote version (v1, v2, v3...)
    const previousSubmissions = getQuoteSubmissionCount();
    const quoteVersion = previousSubmissions + 1;

    const summaryLines: string[] = [
      `Stage Gate: In Review → Quote Submitted (v${quoteVersion})`,
      "",
      `Quote Reference: ${ans("quote_reference")}`,
      `Date of Quote: ${ans("quote_date")}`,
      `Quotation Submission Link: ${ans("quote_submission_link")}`,
      `Quotation Drawings Link: ${ans("quote_drawings_link")}`,
      "",
      `Tender Value £: ${tenderValue.toFixed(2)}`,
      `Tender Cost £: ${tenderCost.toFixed(2)}`,
      `Tender Margin £: ${tenderMargin.toFixed(2)}`,
      `Tender Margin %: ${tenderMarginPercent.toFixed(1)}%`,
      "",
      `Procurement key material rates received: ${ans("key_material_rates")}`,
      "",
      `Overall Duration of Works: ${ans("overall_duration")}`,
      `Phases Priced: ${ans("phases_priced")}`,
    ];

    const detailsText = summaryLines.join("\n");

    // Insert timeline entry with version in the action_type
    const { data: logData, error: logError } = await supabase
      .from("deal_actions")
      .insert({
        deal_id: lead.id,
        action_type: `Stage gate: Quote Submitted (v${quoteVersion})`,
        notes: detailsText,
      })
      .select()
      .single();

    if (logError) {
      console.error("Failed to insert Quote Submitted gate action", logError);
    } else if (logData) {
      setActions((prev) => [logData as DealAction, ...prev]);
    }

    // Update tender fields on deal
    const { error: tenderUpdateError } = await supabase
      .from("deals")
      .update({
        tender_value: tenderValue,
        tender_cost: tenderCost,
        tender_margin: tenderMargin,
        tender_margin_percent: tenderMarginPercent,
      })
      .eq("id", lead.id);

    if (tenderUpdateError) {
      console.error("Failed to update tender fields", tenderUpdateError);
      setError("Could not update tender summary on deal.");
    } else {
      // Update local state for lead + tenderDraft
      setLead((prev) =>
        prev
          ? {
              ...prev,
              tender_value: tenderValue,
              tender_cost: tenderCost,
              tender_margin: tenderMargin,
              tender_margin_percent: tenderMarginPercent,
            }
          : prev
      );

      setTenderDraft({
        tender_value: tenderValue.toFixed(2),
        tender_cost: tenderCost.toFixed(2),
        tender_margin: tenderMargin.toFixed(2),
        tender_margin_percent: tenderMarginPercent.toFixed(1),
      });
    }

    // Finally, move stage
    await updateLeadField("stage", "Quote Submitted");

    setGateModalOpen(false);
    setPendingStage(null);
    setGateAnswers({});
  };

  // -----------------------
  // Re-quote handler: move back to In Review + log action
  // -----------------------
  const handleRequote = async () => {
    if (!lead) return;

    setError(null);

    const ok = window.confirm("Move this deal back to 'In Review' to prepare a re-quote?");
    if (!ok) return;

    const { data, error } = await supabase
      .from("deal_actions")
      .insert({
        deal_id: lead.id,
        action_type: "Re-quote started",
        notes: "Deal moved from Quote Submitted back to In Review to prepare a revised quotation.",
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setError("Could not start re-quote.");
    } else if (data) {
      setActions((prev) => [data as DealAction, ...prev]);
    }

    await updateLeadField("stage", "In Review");
  };

  // -----------------------
  // Actions form handlers
  // -----------------------
  const handleActionFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setActionForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;

    const trimmedType = actionForm.action_type.trim();
    const trimmedNotes = actionForm.notes.trim();
    const trimmedFileUrl = actionForm.file_url.trim();

    const combinedNotes =
      trimmedNotes && trimmedFileUrl
        ? `${trimmedNotes}\n${trimmedFileUrl}`
        : trimmedNotes || trimmedFileUrl;

    if (!trimmedType && !combinedNotes) {
      setActionError("Please enter an action type or some notes / link.");
      return;
    }

    setActionSaving(true);
    setActionError(null);

    const { data, error } = await supabase
      .from("deal_actions")
      .insert({
        deal_id: lead.id,
        action_type: trimmedType || null,
        notes: combinedNotes || null,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setActionError("Could not add action.");
    } else if (data) {
      setActions((prev) => [data as DealAction, ...prev]);
      setActionForm({ action_type: "", notes: "", file_url: "" });
    }

    setActionSaving(false);
  };

  // -----------------------
  // Tender Summary handlers
  // -----------------------
  const recomputeTenderDraft = (valueStr: string, costStr: string) => {
    const val = parseFloat(valueStr || "0");
    const cost = parseFloat(costStr || "0");

    if (!Number.isNaN(val) && !Number.isNaN(cost) && val !== 0) {
      const margin = val - cost;
      const marginPercent = (margin / val) * 100;
      return {
        tender_margin: margin.toFixed(2),
        tender_margin_percent: marginPercent.toFixed(1),
      };
    }

    return {
      tender_margin: "",
      tender_margin_percent: "",
    };
  };

  const handleTenderDraftChange = (field: "tender_value" | "tender_cost", value: string) => {
    setTenderSuccess(null);
    setTenderError(null);

    setTenderDraft((prev) => {
      const next = { ...prev, [field]: value };
      const { tender_margin, tender_margin_percent } = recomputeTenderDraft(
        field === "tender_value" ? value : prev.tender_value,
        field === "tender_cost" ? value : prev.tender_cost
      );
      next.tender_margin = tender_margin;
      next.tender_margin_percent = tender_margin_percent;
      return next;
    });
  };

  const handleSaveTenderSummary = async () => {
    if (!lead) return;

    setTenderSuccess(null);
    setTenderError(null);

    const val = parseFloat(tenderDraft.tender_value || "0");
    const cost = parseFloat(tenderDraft.tender_cost || "0");

    if (Number.isNaN(val) || Number.isNaN(cost) || val === 0) {
      setTenderError("Please enter valid numeric values for tender value and cost.");
      return;
    }

    const margin = val - cost;
    const marginPercent = (margin / val) * 100;

    setTenderSaving(true);

    const { error } = await supabase
      .from("deals")
      .update({
        tender_value: val,
        tender_cost: cost,
        tender_margin: margin,
        tender_margin_percent: marginPercent,
      })
      .eq("id", lead.id);

    if (error) {
      console.error(error);
      setTenderError("Could not save tender summary.");
    } else {
      setLead((prev) =>
        prev
          ? {
              ...prev,
              tender_value: val,
              tender_cost: cost,
              tender_margin: margin,
              tender_margin_percent: marginPercent,
            }
          : prev
      );

      setTenderDraft({
        tender_value: val.toFixed(2),
        tender_cost: cost.toFixed(2),
        tender_margin: margin.toFixed(2),
        tender_margin_percent: marginPercent.toFixed(1),
      });

      setTenderSuccess("Tender summary saved.");
    }

    setTenderSaving(false);
  };

  // -----------------------
  // Expand / collapse all sections
  // -----------------------
  const collapseAllSections = () => {
    setShowSiteDetails(false);
    setShowNotesTimeline(false);
  };

  const expandAllSections = () => {
    setShowSiteDetails(true);
    setShowNotesTimeline(true);
  };

  // -----------------------
  // Early returns (no ID / loading / not found)
  // -----------------------
  if (!id) {
    return (
      <div className="p-6">
        <p>No lead id provided.</p>
        <button
          onClick={() => router.push("/deals")}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          ← Back to Deals
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading lead...</p>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-6">
        <p>Lead not found.</p>
        <button
          onClick={() => router.push("/deals")}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          ← Back to Deals
        </button>
      </div>
    );
  }

  // -----------------------
  // MAIN RENDER
  // -----------------------
  return (
    <div className="p-6 flex justify-center">
      <div className="w-full bg-white p-6 space-y-6">
        {/* Header */}
        <div className="mb-6">
          {/* Breadcrumb + company / list actions */}
          <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
            <div className="space-x-1 truncate">
              <span>Companies</span>
              <span>/</span>
              <span className="truncate">
                {company?.company_name || lead.client_name || "Unknown Company"}
              </span>
              <span>/</span>
              <span className="font-semibold">
                {lead.ap_number ? `AP${lead.ap_number}` : "Lead"}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/companies")}
                className={`px-2 py-1 rounded border text-[11px] ${
                  company
                    ? "border-blue-500 text-blue-600 hover:bg-blue-50"
                    : "border-gray-300 text-gray-400 cursor-not-allowed"
                }`}
                disabled={!company}
              >
                View company
              </button>

              <button
                onClick={() => router.push("/deals")}
                className="px-2 py-1 rounded bg-gray-200 text-[11px] hover:bg-gray-300"
              >
                ← Back to list
              </button>
            </div>
          </div>

          {/* Main header row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-black-1000">
                  {lead.ap_number ? `AP${lead.ap_number}` : "Lead Details"}
                </h1>

                {/* Stage badge */}
                <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 text-[11px] px-2 py-0.5">
                  {currentStage}
                </span>

                {/* Probability badge */}
                {lead.probability && (
                  <span
                    className={`inline-flex items-center rounded-full text-[11px] px-2 py-0.5 text-white ${
                      PROB_COLORS[lead.probability] || "bg-gray-500"
                    }`}
                  >
                    Prob {lead.probability}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">Created: {formatDate(lead.created_at)}</p>
            </div>

            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-800 truncate">
                {lead.site_name || lead.site_address || "No site name"}
              </h2>
            </div>

            <div className="text-right">
              <h2 className="text-lg font-semibold text-gray-800 truncate">
                {company?.company_name || lead.client_name || "Unknown Company"}
              </h2>
            </div>
          </div>
        </div>

        {/* Error + saving indicator */}
        {error && <p className="text-red-600 text-sm mb-1">{error}</p>}
        {savingField && (
          <p className="text-xs text-gray-400 mb-1">
            Saving <span className="font-mono">{savingField}</span>…
          </p>
        )}

        {/* Stage bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-500">Stage</h2>
          </div>

          <div className="flex items-center justify-between">
            {STAGES.map((stage, index) => {
              const isDone = index < currentStageIndex;
              const isCurrent = index === currentStageIndex;

              // When a lead is No Tender, all other stages are disabled
              const isDisabled = currentStage === "No Tender" && stage !== "No Tender";

              return (
                <div key={stage} className="flex-1 flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isDisabled) handleStageClick(stage);
                    }}
                    disabled={isDisabled}
                    className={[
                      "flex flex-col items-center focus:outline-none",
                      isDisabled ? "opacity-40 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "h-3 w-3 rounded-full mb-1",
                        isCurrent
                          ? "bg-blue-600"
                          : isDone
                          ? "bg-green-500"
                          : "bg-gray-300",
                      ].join(" ")}
                    />
                    <span
                      className={[
                        "text-[11px] uppercase tracking-tight text-center",
                        isCurrent
                          ? "text-blue-700 font-semibold"
                          : isDone
                          ? "text-gray-700"
                          : "text-gray-400",
                      ].join(" ")}
                    >
                      {stage}
                    </span>
                  </button>

                  {index < STAGES.length - 1 && (
                    <div className="flex-1 h-[2px] mx-1">
                      <div
                        className={[
                          "h-[2px] w-full",
                          index < currentStageIndex ? "bg-blue-500" : "bg-gray-200",
                        ].join(" ")}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

{/* Probability selector */}
<div className="mt-3 flex items-center gap-3">
  <span className="font-semibold text-gray-700 text-sm">Probability</span>
  <div className="flex flex-wrap gap-2">
    {PROB_OPTIONS.map((p) => {
      const isActive = lead.probability === p;
      const probDisabled = isTerminalStage; // <- new

      return (
        <button
          key={p}
          type="button"
          onClick={() => {
            if (!probDisabled) handleProbabilityClick(p);
          }}
          disabled={probDisabled}
          className={[
            "px-3 py-1 rounded text-sm font-semibold text-white",
            PROB_COLORS[p],
            !isActive ? "opacity-50 hover:opacity-80" : "",
            probDisabled ? "cursor-not-allowed opacity-30 hover:opacity-30" : "",
          ].join(" ")}
        >
          {p}
        </button>
      );
    })}
  </div>
</div>


        {/* Re-quote button – only visible when Quote Submitted */}
        {currentStage === "Quote Submitted" && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleRequote}
              className="px-3 py-1 rounded text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600"
            >
              Move back to In Review (re-quote)
            </button>
          </div>
        )}

        {/* Global collapse / expand controls */}
        <div className="flex justify-end gap-2 text-xs text-gray-600 mt-2">
          <button
            type="button"
            onClick={collapseAllSections}
            className="px-2 py-1 border rounded hover:bg-gray-50"
          >
            Collapse all
          </button>
          <button
            type="button"
            onClick={expandAllSections}
            className="px-2 py-1 border rounded hover:bg-gray-50"
          >
            Expand all
          </button>
        </div>

        {/* ======================= GROUP 1: SITE DETAILS ======================= */}
               {/* ======================= GROUP 1: SITE DETAILS ======================= */}
        <div className="border rounded p-3">
          <button
            type="button"
            onClick={() => setShowSiteDetails((prev) => !prev)}
            className="w-full flex items-center justify-between mb-2"
          >
            <span className="font-semibold text-gray-700">Site details</span>
            <span className="text-xs text-gray-500">
              {showSiteDetails ? "− Hide" : "+ Show"}
            </span>
          </button>

          {showSiteDetails && (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left column: Company + Contact + Lead + Works */}
              <div className="space-y-4">
                {/* Company */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-1 text-sm">Client / Company</h3>
                  <p className="font-medium text-sm">
                    {company?.company_name || lead.client_name || "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{formatAddress(company)}</p>
                </div>

                {/* Contact */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">
                    Client contact details
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-600">Name</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={lead.contact_name || ""}
                        onChange={(e) => handleTextChange("contact_name", e)}
                        onBlur={() => handleTextBlur("contact_name")}
                        placeholder="Contact name"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Email</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={lead.contact_email || ""}
                        onChange={(e) => handleTextChange("contact_email", e)}
                        onBlur={() => handleTextBlur("contact_email")}
                        placeholder="Contact email"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Phone</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={lead.contact_phone || ""}
                        onChange={(e) => handleTextChange("contact_phone", e)}
                        onBlur={() => handleTextBlur("contact_phone")}
                        placeholder="Contact phone"
                      />
                    </div>
                  </div>
                </div>

                {/* Lead Source */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">Lead source</h3>
                  <input
                    className="w-full border rounded p-2 text-sm"
                    value={lead.lead_source || ""}
                    onChange={(e) => handleTextChange("lead_source", e)}
                    onBlur={() => handleTextBlur("lead_source")}
                    placeholder="e.g. Internet, Phone, Email"
                  />
                </div>

                {/* Works category */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">Works category</h3>
                  <select
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={lead.works_category || ""}
                    onChange={(e) => void handleWorksCategoryChange(e.target.value)}
                  >
                    <option value="">Select works category</option>
                    {WORKS_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Works subcategory – only for Housedeck */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">Works subcategory</h3>
                  <select
                    className={[
                      "w-full border rounded p-2 text-sm",
                      lead.works_category === "Housedeck"
                        ? "bg-white"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed",
                    ].join(" ")}
                    value={lead.works_subcategory || ""}
                    onChange={(e) => {
                      if (lead.works_category !== "Housedeck") return;
                      void handleWorksSubcategoryChange(e.target.value);
                    }}
                    disabled={lead.works_category !== "Housedeck"}
                  >
                    <option value="">
                      {lead.works_category === "Housedeck"
                        ? "Select works subcategory"
                        : "Select Housedeck first"}
                    </option>
                    {lead.works_category === "Housedeck" &&
                      HOUSEDECK_SUBCATEGORY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Right column: Site + dates + tender summary (unchanged) */}
              <div className="space-y-4">
                {/* Site */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">Site</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-600">Site name</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={lead.site_name || ""}
                        onChange={(e) => handleTextChange("site_name", e)}
                        onBlur={() => handleTextBlur("site_name")}
                        placeholder="e.g. Oak Farm, Phase 2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Site address</label>
                      <input
                        className="w-full border rounded p-2 text-sm"
                        value={lead.site_address || ""}
                        onChange={(e) => handleTextChange("site_address", e)}
                        onBlur={() => handleTextBlur("site_address")}
                        placeholder="Full site address"
                      />
                    </div>
                  </div>
                </div>

                {/* Key dates */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">Key dates</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-600">Enquiry date</label>
                      <input
                        type="date"
                        className="w-full border rounded p-2 text-sm"
                        value={lead.enquiry_date || ""}
                        onChange={(e) => handleDateChange("enquiry_date", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Tender return date</label>
                      <input
                        type="date"
                        className="w-full border rounded p-2 text-sm"
                        value={lead.tender_return_date || ""}
                        onChange={(e) => handleDateChange("tender_return_date", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Estimated start date</label>
                      <input
                        type="month"
                        className="w-full border rounded p-2 text-sm"
                        value={toMonthInputValue(lead.estimated_start_date)}
                        onChange={(e) => {
                          const monthVal = e.target.value;
                          setLead((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  estimated_start_date: monthVal ? `${monthVal}-01` : null,
                                }
                              : prev
                          );
                          void saveEstimatedStartMonth(monthVal, updateLeadField);
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Tender Summary (your existing block) */}
                {/* ... keep your existing tender summary JSX here unchanged ... */}
              </div>
            </div>
          )}
        </div>


        {/* ======================= GROUP 2: NOTES / TIMELINE ======================= */}
        <div className="border rounded p-3">
          <button
            type="button"
            onClick={() => setShowNotesTimeline((prev) => !prev)}
            className="w-full flex items-center justify-between mb-2"
          >
            <span className="font-semibold text-gray-700">Notes &amp; timeline</span>
            <span className="text-xs text-gray-500">
              {showNotesTimeline ? "− Hide" : "+ Show"}
            </span>
          </button>

          {showNotesTimeline && (
            <div className="mt-2 space-y-6">
              {/* Open tasks summary */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">
                    Open tasks for this lead
                  </h3>
                  <button
                    type="button"
                    onClick={() => router.push("/tasks")}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Go to tasks
                  </button>
                </div>

                {tasksError && (
                  <p className="mb-2 text-xs text-red-600">
                    {tasksError}
                  </p>
                )}

                {staffError && (
                  <p className="mb-2 text-xs text-orange-600">
                    {staffError}
                  </p>
                )}

                {tasksLoading ? (
                  <p className="text-xs text-gray-500">Loading tasks…</p>
                ) : openTasks.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    No open tasks linked to this lead.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-2 font-semibold text-gray-500">Task</th>
                          <th className="text-left p-2 font-semibold text-gray-500">Assignee</th>
                          <th className="text-left p-2 font-semibold text-gray-500">Status</th>
                          <th className="text-left p-2 font-semibold text-gray-500">Priority</th>
                          <th className="text-left p-2 font-semibold text-gray-500">Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openTasks.map((t) => {
                          const ds = getDueStatus(t.due_date);
                          return (
                            <tr key={t.id} className="border-b align-top">
                              <td className="p-2">
                                <div className="font-medium text-[12px]">
                                  {t.description ? t.description.slice(0, 80) : t.title}
                                  {t.description && t.description.length > 80 ? "…" : ""}
                                </div>
                              </td>
                              <td className="p-2">{getStaffName(t.assigned_to)}</td>
                              <td className="p-2">
                                {STATUS_LABEL[t.status || "open"] || t.status}
                              </td>
                              <td className="p-2">
                                {t.priority ? PRIORITY_LABEL[t.priority] || t.priority : "—"}
                              </td>
                              <td className="p-2">
                                <div className="flex items-center gap-2">
                                  <span>{formatDate(t.due_date)}</span>
                                  <span className={`h-2 w-2 rounded-full ${dueDotClass(ds)}`} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Internal Notes */}
              <div>
                <h3 className="mb-1 text-sm font-semibold text-gray-800">
                  Internal notes
                </h3>
                <textarea
                  className="w-full border rounded p-2 text-sm min-h-[120px]"
                  value={lead.notes || ""}
                  onChange={(e) => handleTextChange("notes", e)}
                  onBlur={() => handleTextBlur("notes")}
                  placeholder="Add any notes, context, or updates about this lead..."
                />
              </div>

              {/* Actions / Timeline */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-700 text-sm">
                    Actions / timeline
                  </h3>
                  <span className="text-xs text-gray-500">
                    {loadingActions ? "Loading..." : `${actions.length} action(s)`}
                  </span>
                </div>

                <div className="bg-gray-50 border rounded p-3 mb-3">
                  {actionError && (
                    <p className="text-xs text-red-600 mb-2">{actionError}</p>
                  )}

                  <form
                    onSubmit={handleAddAction}
                    className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start"
                  >
                    <div className="flex flex-col">
                      <label className="text-xs text-gray-600 mb-1">Action type</label>
                      <select
                        name="action_type"
                        value={actionForm.action_type}
                        onChange={handleActionFormChange}
                        className="border rounded px-2 py-1 text-sm bg-white text-gray-900"
                      >
                        <option value="">Select type</option>
                        {ACTION_TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs text-gray-600 mb-1">Notes / details</label>
                      <textarea
                        name="notes"
                        value={actionForm.notes}
                        onChange={handleActionFormChange}
                        rows={2}
                        placeholder="e.g. Drawing issue raised, sent email to client..."
                        className="border rounded px-2 py-1 text-sm bg-white text-gray-900"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs text-gray-600 mb-1">
                        File link (SharePoint / URL)
                      </label>
                      <input
                        name="file_url"
                        value={actionForm.file_url}
                        onChange={handleActionFormChange}
                        placeholder="Paste SharePoint or file link here"
                        className="border rounded px-2 py-1 text-sm bg-white text-gray-900"
                      />
                    </div>

                    <div className="md:col-span-3 flex justify-end">
                      <button
                        type="submit"
                        disabled={actionSaving}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-60"
                      >
                        {actionSaving ? "Saving..." : "Add action"}
                      </button>
                    </div>
                  </form>
                </div>

                {loadingActions ? (
                  <p className="text-sm text-gray-500">Loading timeline...</p>
                ) : actions.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No actions recorded yet. Use the form above to log events such as drawing
                    issues, calls, emails, or meetings.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {actions.map((a) => (
                      <li key={a.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="mt-1 w-2 h-2 rounded-full bg-blue-500" />
                          <span className="flex-1 w-px bg-gray-200" />
                        </div>
                        <div className="flex-1 pb-2 border-b border-gray-100">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold text-gray-700">
                              {a.action_type || "Note"}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {formatDateTime(a.created_at)}
                            </span>
                          </div>

                          {a.notes && (
                            <p
                              className="text-sm text-gray-800 whitespace-pre-wrap mb-1"
                              dangerouslySetInnerHTML={{ __html: linkify(a.notes) }}
                            />
                          )}

                          {a.file_url && (
                            <a
                              href={a.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 underline"
                            >
                              Open linked file
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stage gate modal: Received -> Qualified */}
      {gateModalOpen && pendingStage === "Qualified" && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-5 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-2">Move to &quot;Qualified&quot;?</h3>
            <p className="text-xs text-gray-600 mb-4">
              Please fill in the details below before moving this lead to{" "}
              <span className="font-semibold">Qualified</span>.
            </p>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* General scope of works */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">General scope of works</p>
                <div className="space-y-1">
                  {["Piling", "Slab", "Both"].map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="scope_works"
                        value={opt}
                        checked={ans("scope_works") === opt}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            scope_works: e.target.value,
                          }))
                        }
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Estimated start date (month / year)
                </label>
                <input
                  type="month"
                  className="border rounded px-2 py-1 text-sm w-full"
                  value={gateAnswers["est_start_month"] || ""}
                  onChange={(e) =>
                    setGateAnswers((prev) => ({
                      ...prev,
                      est_start_month: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Tender return date
                  <span className="text-xs text-gray-500 ml-1">
                    (will overwrite current tender date)
                  </span>
                </label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 text-sm w-full"
                  value={gateAnswers["qualified_tender_return_date"] || ""}
                  onChange={(e) =>
                    setGateAnswers((prev) => ({
                      ...prev,
                      qualified_tender_return_date: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Scheme size</p>
                <div className="space-y-1">
                  {["Single Plot", "Multiple Plots"].map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="scheme_size"
                        value={opt}
                        checked={ans("scheme_size") === opt}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            scheme_size: e.target.value,
                            ...(e.target.value === "Single Plot" && {
                              multi_basis: "",
                              multi_plot_numbers: "",
                              multi_extra_over_offered: "",
                              multi_extra_over_client_agreed: "",
                            }),
                          }))
                        }
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {ans("scheme_size") === "Multiple Plots" && (
                <div className="space-y-4 border-t pt-3 mt-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Pricing basis</p>
                    <div className="space-y-1">
                      {["Whole site", "Individual Plots"].map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="multi_basis"
                            value={opt}
                            checked={ans("multi_basis") === opt}
                            onChange={(e) =>
                              setGateAnswers((prev) => ({
                                ...prev,
                                multi_basis: e.target.value,
                                ...(e.target.value !== "Individual Plots" && {
                                  multi_plot_numbers: "",
                                }),
                              }))
                            }
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {ans("multi_basis") === "Individual Plots" && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Which plots require pricing?
                      </label>
                      <input
                        type="text"
                        className="border rounded px-2 py-1 text-sm w-full"
                        placeholder="e.g. Plots 3, 5–8"
                        value={gateAnswers["multi_plot_numbers"] || ""}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            multi_plot_numbers: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Extra-over pricing</p>

                    <div className="mb-2">
                      <p className="text-xs text-gray-600 mb-1">
                        Can we price an extra-over for the whole site?
                      </p>
                      <div className="space-y-1">
                        {["Yes", "No"].map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="multi_extra_over_offered"
                              value={opt}
                              checked={ans("multi_extra_over_offered") === opt}
                              onChange={(e) =>
                                setGateAnswers((prev) => ({
                                  ...prev,
                                  multi_extra_over_offered: e.target.value,
                                }))
                              }
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 mb-1">
                        Has the client agreed to this extra-over option?
                      </p>
                      <div className="space-y-1">
                        {["Yes", "No"].map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="multi_extra_over_client_agreed"
                              value={opt}
                              checked={ans("multi_extra_over_client_agreed") === opt}
                              onChange={(e) =>
                                setGateAnswers((prev) => ({
                                  ...prev,
                                  multi_extra_over_client_agreed: e.target.value,
                                }))
                              }
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setGateModalOpen(false);
                  setPendingStage(null);
                  setGateAnswers({});
                }}
                className="px-3 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStageChangeToQualified}
                disabled={!areAllQualifiedGateQuestionsComplete()}
                className={`px-3 py-1 rounded text-sm text-white ${
                  areAllQualifiedGateQuestionsComplete()
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-blue-400 cursor-not-allowed"
                }`}
              >
                Confirm &amp; move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage gate modal: Qualified -> In Review */}
      {gateModalOpen && pendingStage === "In Review" && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-5 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-2">Move to &quot;In Review&quot;?</h3>
            <p className="text-xs text-gray-600 mb-4">
              Please confirm the drawing pack and SharePoint status before moving this lead to{" "}
              <span className="font-semibold">In Review</span>.
            </p>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">
                  1. Have we received the following drawings?
                </p>

                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">A) Architect</p>
                  <div className="space-y-1 pl-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ans("arch_housetype") === "Yes"}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            arch_housetype: e.target.checked ? "Yes" : "",
                          }))
                        }
                      />
                      <span>Housetypes</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ans("arch_siteplans") === "Yes"}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            arch_siteplans: e.target.checked ? "Yes" : "",
                          }))
                        }
                      />
                      <span>Site plans</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">B) Civils</p>
                  <div className="space-y-1 pl-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ans("civils_levels") === "Yes"}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            civils_levels: e.target.checked ? "Yes" : "",
                          }))
                        }
                      />
                      <span>External level layouts</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ans("civils_drainage") === "Yes"}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            civils_drainage: e.target.checked ? "Yes" : "",
                          }))
                        }
                      />
                      <span>Drainage layouts</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">C) Site Investigation</p>
                  <label className="text-xs text-gray-600 mb-1 block">
                    What depth of site investigation is contained within the tender information? (m)
                  </label>
                  <input
                    type="text"
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="e.g. 3.0"
                    value={gateAnswers["si_depth"] || ""}
                    onChange={(e) =>
                      setGateAnswers((prev) => ({
                        ...prev,
                        si_depth: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 border-t pt-3">
                <p className="text-sm font-medium text-gray-700">
                  2. Have all drawings been placed in SharePoint labelled by date received?
                </p>

                <div className="space-y-1">
                  {["Yes", "No"].map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="drawings_in_sharepoint"
                        value={opt}
                        checked={ans("drawings_in_sharepoint") === opt}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            drawings_in_sharepoint: e.target.value,
                          }))
                        }
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="text-xs text-gray-600 mb-1 block">
                    SharePoint location (paste link)
                  </label>
                  <input
                    type="text"
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="https://..."
                    value={gateAnswers["sharepoint_link"] || ""}
                    onChange={(e) =>
                      setGateAnswers((prev) => ({
                        ...prev,
                        sharepoint_link: e.target.value,
                      }))
                    }
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    This link will be stored on the stage gate timeline entry and will be clickable
                    from this card.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setGateModalOpen(false);
                  setPendingStage(null);
                  setGateAnswers({});
                }}
                className="px-3 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStageChangeToInReview}
                disabled={!areAllInReviewGateQuestionsComplete()}
                className={`px-3 py-1 rounded text-sm text-white ${
                  areAllInReviewGateQuestionsComplete()
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-blue-400 cursor-not-allowed"
                }`}
              >
                Confirm &amp; move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage gate modal: In Review -> Quote Submitted */}
      {gateModalOpen && pendingStage === "Quote Submitted" && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-5 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-2">
              Move to &quot;Quote Submitted&quot;?
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Please enter quote and tender details before moving this lead to{" "}
              <span className="font-semibold">Quote Submitted</span>.
            </p>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Quote details */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Quote Reference
                  </label>
                  <input
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={gateAnswers["quote_reference"] || ""}
                    onChange={(e) =>
                      setGateAnswers((prev) => ({
                        ...prev,
                        quote_reference: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Date of Quote
                  </label>
                  <input
                    type="date"
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={gateAnswers["quote_date"] || ""}
                    onChange={(e) =>
                      setGateAnswers((prev) => ({
                        ...prev,
                        quote_date: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Link to Quotation Submission
                  </label>
                  <input
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="https://..."
                    value={gateAnswers["quote_submission_link"] || ""}
                    onChange={(e) =>
                      setGateAnswers((prev) => ({
                        ...prev,
                        quote_submission_link: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Link to Quotation Drawings
                  </label>
                  <input
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="https://..."
                    value={gateAnswers["quote_drawings_link"] || ""}
                    onChange={(e) =>
                      setGateAnswers((prev) => ({
                        ...prev,
                        quote_drawings_link: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Financial summary */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">Financial Summary</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Tender value £</label>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="border rounded px-2 py-1 text-sm w-full"
                      value={gateAnswers["tender_value"] || ""}
                      onChange={(e) => updateGateFinance("tender_value", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Tender cost £</label>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="border rounded px-2 py-1 text-sm w-full"
                      value={gateAnswers["tender_cost"] || ""}
                      onChange={(e) => updateGateFinance("tender_cost", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Tender margin £</label>
                    <input
                      className="border rounded px-2 py-1 text-sm w-full bg-gray-100"
                      value={gateAnswers["tender_margin"] || ""}
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Tender margin %</label>
                    <input
                      className="border rounded px-2 py-1 text-sm w-full bg-gray-100"
                      value={gateAnswers["tender_margin_percent"] || ""}
                      disabled
                    />
                  </div>
                </div>
              </div>

              {/* Procurement */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Have key material rates been received from Procurement?
                </p>
                <div className="flex gap-3">
                  {["Yes", "No"].map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="key_material_rates"
                        value={opt}
                        checked={ans("key_material_rates") === opt}
                        onChange={(e) =>
                          setGateAnswers((prev) => ({
                            ...prev,
                            key_material_rates: e.target.value,
                          }))
                        }
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Programme */}
              <div className="border-t pt-3 space-y-2">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Overall duration of works
                  </label>
                  <input
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="e.g. 16 weeks"
                    value={gateAnswers["overall_duration"] || ""}
                    onChange={(e) =>
                      setGateAnswers((prev) => ({
                        ...prev,
                        overall_duration: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Phases priced
                  </label>
                  <input
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="e.g. Phase 1 & 2"
                    value={gateAnswers["phases_priced"] || ""}
                    onChange={(e) =>
                      setGateAnswers((prev) => ({
                        ...prev,
                        phases_priced: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setGateModalOpen(false);
                  setPendingStage(null);
                  setGateAnswers({});
                }}
                className="px-3 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStageChangeToQuoteSubmitted}
                disabled={!areAllQuoteSubmittedGateQuestionsComplete()}
                className={`px-3 py-1 rounded text-sm text-white ${
                  areAllQuoteSubmittedGateQuestionsComplete()
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-blue-400 cursor-not-allowed"
                }`}
              >
                Confirm &amp; move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Default export: wrap the detail component in Suspense
 * so useSearchParams/useRouter can work with Next 13+ app router.
 */
export default function DealDetailPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading lead...</div>}>
      <DealDetailInner />
    </Suspense>
  );
}