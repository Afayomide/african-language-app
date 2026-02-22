import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request) {
  const response = await fetch(beLearnerRoutes.dashboardOverview(), {
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
