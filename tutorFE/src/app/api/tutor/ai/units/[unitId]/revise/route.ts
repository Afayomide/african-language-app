import { NextResponse } from "next/server";
import { beTutorAiRoutes } from "@/lib/apiRoutes";
import { proxyJsonRequest } from "@/lib/server/proxyJsonRequest";

export const maxDuration = 1800;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await params;
  const body = await req.json();
  const response = await proxyJsonRequest({
    url: beTutorAiRoutes.reviseUnitContent(unitId),
    method: "POST",
    headers: {
      authorization: req.headers.get("authorization") || ""
    },
    body
  });

  return NextResponse.json(response.data, { status: response.status });
}
