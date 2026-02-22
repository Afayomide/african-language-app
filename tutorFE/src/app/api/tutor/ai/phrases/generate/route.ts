import { NextResponse } from "next/server";
import { beTutorAiRoutes } from "@/lib/apiRoutes";

export async function POST(req: Request) {
  const body = await req.json();
  const response = await fetch(beTutorAiRoutes.generatePhrases(), {
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
