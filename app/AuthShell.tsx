// app/AuthShell.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import Sidebar from "./components/Sidebar";

type Props = {
  children: React.ReactNode;
};

export default function AuthShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // 1) Check Supabase auth session
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          console.warn("Error checking auth session:", error);
        }

        // No auth user at all
        if (!user) {
          if (pathname !== "/login") {
            router.replace("/login");
            return;
          }
          setChecking(false);
          return;
        }

        // 2) Enforce staff profile + is_active
        const { data: profile, error: profileError } = await supabase
          .from("staff_profiles")
          .select("id, is_active")
          .eq("id", user.id)
          .single();

        if (profileError || !profile || !profile.is_active) {
          console.warn("No active staff profile for user, signing out.");
          await supabase.auth.signOut();

          if (pathname !== "/login") {
            router.replace("/login");
            return;
          }

          setChecking(false);
          return;
        }

        // 3) Logged-in & active staff:
        //    if they hit /login, kick them to dashboard instead.
        if (pathname === "/login") {
          router.replace("/dashboard");
          return;
        }

        setChecking(false);
      } catch (err) {
        console.warn("Auth check error, treating as not logged in:", err);

        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }

        if (pathname !== "/login") {
          router.replace("/login");
          return;
        }

        setChecking(false);
      }
    };

    void checkSession();
  }, [pathname, router]);

  // While checking session, show simple loader
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        Checking session…
      </div>
    );
  }

  // On /login: no sidebar, just render the login page
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // On all other routes: sidebar + page content
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
