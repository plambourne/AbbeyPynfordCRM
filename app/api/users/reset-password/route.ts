// app/api/users/reset-password/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  return NextResponse.json(
    {
      ok: true,
      message: "Reset password endpoint is disabled in this build.",
      received: body,
    },
    { status: 200 }
  );
}
