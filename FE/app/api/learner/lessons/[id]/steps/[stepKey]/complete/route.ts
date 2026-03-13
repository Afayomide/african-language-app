import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";
import { createLearnerAuthHeaders } from "@/lib/learnerAuthCookies";
import { readJsonResponse } from "@/lib/learnerProxy";

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string; stepKey: string }> }
) {
  const { id, stepKey } = await context.params;
  const body = await req.json();
  const response = await fetch(beLearnerRoutes.completeStep(id, stepKey), {
    method: "PUT",
    headers: await createLearnerAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
  const data = await readJsonResponse(response);
  return NextResponse.json(data, { status: response.status });
}
