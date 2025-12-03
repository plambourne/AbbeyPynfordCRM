// app/api/users/delete/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  return NextResponse.json(
    {
      ok: true,
      message: "Delete user endpoint is disabled in this build.",
      received: body,
    },
    { status: 200 }
  );
}
