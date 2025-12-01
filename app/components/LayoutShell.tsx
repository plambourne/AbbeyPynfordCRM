// components/LayoutShell.tsx
"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar column */}
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
      />

      {/* Main content automatically takes the rest of the width */}
      <main className="flex-1 min-h-screen overflow-x-auto">
        {children}
      </main>
    </div>
  );
}
