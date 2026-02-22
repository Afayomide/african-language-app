import { NextResponse } from "next/server";
import { beTutorAiRoutes } from "@/lib/apiRoutes";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const response = await fetch(beTutorAiRoutes.enhancePhrase(id), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") || ""
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
