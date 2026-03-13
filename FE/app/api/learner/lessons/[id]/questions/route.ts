import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";
import { createLearnerAuthHeaders } from "@/lib/learnerAuthCookies";
import { readJsonResponse } from "@/lib/learnerProxy";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "";

  const response = await fetch(beLearnerRoutes.lessonQuestions(id, type), {
    headers: await createLearnerAuthHeaders()
  });
  const data = await readJsonResponse(response);
  return NextResponse.json(data, { status: response.status });
}
