import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; expressionId: string }> }
) {
  const { id, expressionId } = await context.params;
  const response = await fetch(beAdminRoutes.restoreDeletedUnitExpression(id, expressionId), {
    method: "POST",
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
