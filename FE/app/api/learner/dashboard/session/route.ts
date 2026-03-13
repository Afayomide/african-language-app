import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";
import { createLearnerAuthHeaders } from "@/lib/learnerAuthCookies";
import { readJsonResponse } from "@/lib/learnerProxy";

export async function POST(req: Request) {
  const body = await req.json();
  const response = await fetch(beLearnerRoutes.markSession(), {
    method: "POST",
    headers: await createLearnerAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
  const data = await readJsonResponse(response);
  return NextResponse.json(data, { status: response.status });
}
