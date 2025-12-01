"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";

import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";

type Deal = {
  id: string;
  ap_number: number | null;
  company_id: string | null;
  contact_name: string | null;
  site_address: string | null;
  enquiry_date: string | null;
  tender_return_date: string | null;
  stage: string;
  probability: string;
};

const STAGES = [
  "Received",
  "Qualified",
  "In Review",
  "Quote Submitted",
  "Won",
  "Lost",
];

const PROB_COLORS: Record<string, string> = {
  A: "bg-green-500",
  B: "bg-blue-500",
  C: "bg-orange-500",
  D: "bg-red-500",
};

// =============================
// Sortable Lead Card Component
// =============================

function LeadCard({ lead }: { lead: Deal }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const leftStage =
    STAGES[STAGES.indexOf(lead.stage) - 1] || STAGES[0];

  const rightStage =
    STAGES[STAGES.indexOf(lead.stage) + 1] ||
    STAGES[STAGES.length - 1];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="p-3 bg-white rounded shadow mb-3 cursor-grab"
    >
      <div className="font-semibold text-gray-800 flex justify-between">
        <span>{lead.contact_name || "No contact"}</span>

        {/* Probability Button */}
        <span
          className={`text-white px-2 py-1 rounded text-xs ${PROB_COLORS[lead.probability]}`}
        >
          {lead.probability}
        </span>
      </div>

      <p className="text-sm text-gray-500">
        {lead.site_address || "No site"}
      </p>

      <p className="text-xs text-gray-400 mt-1">
        AP: {lead.ap_number || "—"}
      </p>

      {/* Stage Movement Arrows */}
      <div className="flex justify-between items-center mt-3">
        <button
          {...listeners}
          className="text-sm px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          Drag
        </button>

        <div className="flex gap-2">
          <button
            className="text-sm px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
            onClick={async () =>
              await supabase
                .from("deals")
                .update({ stage: leftStage })
                .eq("id", lead.id)
            }
          >
            ◀
          </button>

          <button
            className="text-sm px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
            onClick={async () =>
              await supabase
                .from("deals")
                .update({ stage: rightStage })
                .eq("id", lead.id)
            }
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================
// Main Pipeline Page
// =============================

export default function PipelinePage() {
  const [leads, setLeads] = useState<Deal[]>([]);
  const sensors = useSensors(useSensor(PointerSensor));
  const router = useRouter();

  const loadLeads = async () => {
    const { data } = await supabase.from("deals").select("*");
    setLeads(data || []);
  };

  useEffect(() => {
    loadLeads();
  }, []);

  // Handle DnD movement
  const onDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over) return;

    const activeLead = leads.find((l) => l.id === active.id);
    const newStage = over.id;

    if (activeLead && activeLead.stage !== newStage) {
      await supabase
        .from("deals")
        .update({ stage: newStage })
        .eq("id", activeLead.id);

      loadLeads();
    }
  };

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Lead Pipeline</h1>

        <button
          onClick={() => router.push("/companies")}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          ← Back to Companies
        </button>
      </div>

      {/* RESPONSIVE GRID */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd} collisionDetection={closestCenter}>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {STAGES.map((stage) => (
            <div key={stage} className="bg-gray-100 p-3 rounded shadow">
              <h2 className="font-semibold text-lg mb-3">{stage}</h2>

              <SortableContext
                id={stage}
                items={leads.filter((l) => l.stage === stage).map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {leads
                  .filter((l) => l.stage === stage)
                  .map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
              </SortableContext>
            </div>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
