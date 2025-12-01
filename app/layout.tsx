// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/app/components/Sidebar";

export const metadata: Metadata = {
  title: "CRM",
  description: "Abbey Pynford Workspace CRM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Full height + light background */}
      <body className="min-h-screen bg-gray-100 text-gray-800">
        {/* Main app shell: sidebar + content side by side */}
        <div className="flex min-h-screen">
          {/* Fixed‑width sidebar on the left */}
          <Sidebar />

          {/* Page content fills the rest of the window */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
