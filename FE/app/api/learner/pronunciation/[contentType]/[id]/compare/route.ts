import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";
import { createLearnerAuthHeaders } from "@/lib/learnerAuthCookies";
import { readJsonResponse } from "@/lib/learnerProxy";

export async function POST(req: Request, context: { params: Promise<{ contentType: "word" | "expression" | "sentence"; id: string }> }) {
  const { contentType, id } = await context.params;
  const body = await req.text();

  const response = await fetch(beLearnerRoutes.comparePronunciation(contentType, id), {
    method: "POST",
    headers: await createLearnerAuthHeaders({ "content-type": "application/json" }),
    body
  });

  const data = await readJsonResponse(response);
  return NextResponse.json(data, { status: response.status });
}
