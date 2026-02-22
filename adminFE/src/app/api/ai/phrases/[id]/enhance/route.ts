import { NextResponse } from "next/server";
import { beAiRoutes } from "@/lib/apiRoutes";

const AI_API_KEY = process.env.AI_API_KEY || "";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json();

  if (!AI_API_KEY) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const response = await fetch(beAiRoutes.enhancePhrase(id), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-key": AI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
