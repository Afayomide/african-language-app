import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";
import { proxyJsonRequest } from "@/lib/server/proxyJsonRequest";

export const maxDuration = 1800;

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await proxyJsonRequest({
    url: beAdminRoutes.resumeCurriculumJob(id),
    method: "POST",
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });
  return NextResponse.json(response.data, { status: response.status });
}
