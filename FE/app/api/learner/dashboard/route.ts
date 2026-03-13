import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";
import { createLearnerAuthHeaders } from "@/lib/learnerAuthCookies";
import { readJsonResponse } from "@/lib/learnerProxy";

export async function GET() {
  const response = await fetch(beLearnerRoutes.dashboardOverview(), {
    headers: await createLearnerAuthHeaders(),
    cache: "no-store"
  });
  const data = await readJsonResponse(response);
  return NextResponse.json(data, { status: response.status });
}
