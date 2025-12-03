// app/api/targets/get/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  // Temporary stub – no real targets logic for now
  return NextResponse.json(
    {
      ok: true,
      message: "Targets GET endpoint is disabled in this build.",
      data: [],
    },
    { status: 200 }
  );
}

