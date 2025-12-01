// app/components/Layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "CRM",
};

export default function Layout({ children }: { children: ReactNode }) {
  // Simple pass-through layout; can be used by pages/components if needed
  return <>{children}</>;
}
