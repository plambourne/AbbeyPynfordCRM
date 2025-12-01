"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export type StaffRole = "sales" | "estimator" | "manager" | "admin" | "staff";

export type CurrentStaff = {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  is_active: boolean;
} | null;

type UseCurrentStaffResult = {
  staff: CurrentStaff;
  loading: boolean;
  error: string | null;
};

export function useCurrentStaff(): UseCurrentStaffResult {
  const [staff, setStaff] = useState<CurrentStaff>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      // 1) Get the authenticated Supabase user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("Error getting auth user:", userError);
        setError(userError.message);
        setStaff(null);
        setLoading(false);
        return;
      }

      if (!user) {
        // Not logged in (or running without auth)
        setStaff(null);
        setLoading(false);
        return;
      }

      // 2) Look up matching staff_profiles row
      const { data, error: profileError } = await supabase
        .from("staff_profiles")
        .select("id, full_name, email, role, is_active")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Error loading staff profile:", profileError);
        setError(profileError.message);
        setStaff(null);
      } else {
        setStaff(data as CurrentStaff);
      }

      setLoading(false);
    };

    void load();
  }, []);

  return { staff, loading, error };
}
