import { NextResponse } from "next/server";
import { beTutorRoutes } from "@/lib/apiRoutes";

export async function POST(req: Request) {
  const body = await req.json();
  const response = await fetch(beTutorRoutes.signup(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  let data: unknown = { error: "invalid_backend_response", raw };
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: "invalid_backend_response", raw };
  }

  return NextResponse.json(data, { status: response.status });
}
