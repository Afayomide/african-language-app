import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";
import { createLearnerAuthHeaders } from "@/lib/learnerAuthCookies";
import { readJsonResponse } from "@/lib/learnerProxy";

export async function POST(req: Request, context: { params: Promise<{ contentType: string; id: string }> }) {
  const { contentType, id } = await context.params;
  if (!["word", "expression", "sentence"].includes(contentType)) {
    return NextResponse.json({ error: "invalid content type" }, { status: 400 });
  }
  const body = await req.text();

  const response = await fetch(beLearnerRoutes.comparePronunciation(contentType as "word" | "expression" | "sentence", id), {
    method: "POST",
    headers: await createLearnerAuthHeaders({ "content-type": "application/json" }),
    body
  });

  const data = await readJsonResponse(response);
  return NextResponse.json(data, { status: response.status });
}
