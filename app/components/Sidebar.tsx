"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useCurrentStaff } from "./useCurrentStaff";

type NavItem = {
  label: string;
  href: string;
  adminOnly?: boolean; // only show for admin/manager
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Deals / Leads", href: "/deals" },
  { label: "Companies", href: "/companies" },
  { label: "Contacts", href: "/contacts" },
  { label: "Tasks", href: "/tasks" },
  { label: "Staff admin", href: "/staff", adminOnly: true },
];

// Props are OPTIONAL so <Sidebar /> and <Sidebar collapsed onToggle /> both work
type SidebarProps = {
  collapsed?: boolean;
  onToggle?: () => void;
};

export default function Sidebar({
  collapsed = false,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { staff } = useCurrentStaff();

  const isAdminOrManager =
    staff && (staff.role === "admin" || staff.role === "manager");

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
    }
  };

  return (
    <aside
      className={[
        "sidebar-root flex h-screen flex-col bg-slate-900 text-slate-100 transition-all duration-200",
        collapsed ? "w-16" : "w-64",
      ].join(" ")}
    >
      {/* Brand header */}
      <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-sm font-bold">
            AP
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">
                Abbey Pynford
              </span>
              <span className="text-[11px] text-slate-400">
                Workspace CRM
              </span>
            </div>
          )}
        </div>

        {/* Collapse toggle button (no-op if onToggle not provided) */}
        <button
          type="button"
          onClick={() => onToggle?.()}
          className="text-slate-400 hover:text-slate-100 text-xs"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1 text-sm">
        {navItems.map((item) => {
          // Hide admin routes if user is not admin/manager
          if (item.adminOnly && !isAdminOrManager) return null;

          const isActive =
            item.href === "/"
              ? pathname === item.href
              : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center rounded px-3 py-2 transition-colors",
                isActive
                  ? "bg-slate-800 text-white"
                  : "text-slate-200 hover:bg-slate-800 hover:text-white",
              ].join(" ")}
            >
              <span
                className={collapsed ? "text-[11px] truncate" : undefined}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer with user + logout */}
      <div className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-400 space-y-2">
        {!collapsed && staff && (
          <div className="flex flex-col">
            <span className="font-semibold text-slate-200">
              {staff.full_name}
            </span>
            <span className="text-[10px] text-slate-400">
              {staff.email}
              {" · "}
              {staff.role}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-800"
        >
          Log out
        </button>

        {!collapsed && (
          <div className="pt-1 text-[10px] text-slate-500">
            <div>CRM v1.0</div>
            <div>© Abbey Pynford Workspace</div>
          </div>
        )}
      </div>
    </aside>
  );
}
