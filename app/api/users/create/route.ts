// app/api/users/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 🔍 Log env so we can see which project we're hitting
console.log("SUPABASE URL in route:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(
  "SERVICE ROLE key present?",
  !!process.env.SUPABASE_SERVICE_ROLE_KEY
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,   // project URL
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service role key
  {
    auth: {
      persistSession: false,
    },
  }
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, ...userMeta } = body;

    console.log("Creating user with email:", email);

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: userMeta,
    });

    console.log("Supabase admin createUser result:", { data, error });

    if (error) {
      console.error("Supabase admin error:", error);
      return NextResponse.json(
        { error: error.message ?? "Supabase error" },
        { status: 400 }
      );
    }

    console.log("User created:", data.user?.id);

    return NextResponse.json({ user: data.user }, { status: 200 });
  } catch (err: any) {
    console.error("Route error:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
