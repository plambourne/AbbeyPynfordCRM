"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TestPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("contacts").select("*");
      if (error) {
        console.error(error);
        setErrorMsg(error.message);
      } else {
        setContacts(data || []);
      }
    };

    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Supabase Connection Test</h1>
      {errorMsg && <p style={{ color: "red" }}>Error: {errorMsg}</p>}
      <pre>{JSON.stringify(contacts, null, 2)}</pre>
    </div>
  );
}
