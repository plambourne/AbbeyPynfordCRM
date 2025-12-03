"use client";

import { useState } from "react";
import { useMonthlyTargets } from "@/hooks/useMonthlyTargets";

const MONTHS = [
  "Dec","Jan","Feb","Mar","Apr","May",
  "Jun","Jul","Aug","Sep","Oct","Nov"
];

export default function AdminMonthlyTargets({ fyStart, isAdmin }: {
  fyStart: string;
  isAdmin: boolean;
}) {
  const { targets, loading, setTargets } = useMonthlyTargets(fyStart);
  const [saving, setSaving] = useState(false);

  if (!isAdmin) return null; // Hide completely for non-admins

  if (loading) return <p>Loading targets...</p>;

  const handleChange = async (month: string, value: number) => {
    setSaving(true);

    await fetch("/api/targets/update", {
      method: "POST",
      body: JSON.stringify({
        fy_year_start: fyStart,
        month,
        target_value: value,
      }),
    });

    setTargets(
      targets.map((t) => (t.month === month ? { ...t, target_value: value } : t))
    );

    setSaving(false);
  };

  return (
    <section className="border rounded p-4 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-3">🎯 Monthly Targets (Admin Only)</h2>

      <div className="grid md:grid-cols-3 gap-4">
        {MONTHS.map((m) => {
          const row = targets.find((t) => t.month === m);

          return (
            <div key={m} className="p-3 border rounded bg-gray-50">
              <label className="text-sm font-medium">{m}</label>
              <input
                type="number"
                className="mt-1 w-full border rounded p-2"
                value={row?.target_value || 0}
                onChange={(e) => handleChange(m, Number(e.target.value))}
              />
            </div>
          );
        })}
      </div>

      {saving && <p className="text-xs text-blue-600 mt-2">Saving…</p>}
    </section>
  );
}
