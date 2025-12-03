// app/api/targets/update/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // Temporary stub – no real targets update logic for now
  return NextResponse.json(
    {
      ok: true,
      message: "Targets UPDATE endpoint is disabled in this build.",
      received: body,
    },
    { status: 200 }
  );
}
