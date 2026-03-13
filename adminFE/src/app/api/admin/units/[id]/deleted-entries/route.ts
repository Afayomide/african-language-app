import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await fetch(beAdminRoutes.unitDeletedEntries(id), {
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
