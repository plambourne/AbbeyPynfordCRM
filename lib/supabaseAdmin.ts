// lib/supabaseAdmin.ts  (or src/lib/supabaseAdmin.ts if you're using /src)
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,   // same as client
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service role key (server-only!)
  {
    auth: {
      persistSession: false,
    },
  }
);
export default supabaseAdmin;
