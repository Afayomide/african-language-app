import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string; stepKey: string }> }
) {
  const { id, stepKey } = await context.params;
  const body = await req.json();
  const response = await fetch(beLearnerRoutes.completeStep(id, stepKey), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") || ""
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
