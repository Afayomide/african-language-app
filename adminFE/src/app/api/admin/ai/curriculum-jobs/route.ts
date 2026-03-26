import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";
import { proxyJsonRequest } from "@/lib/server/proxyJsonRequest";

export const maxDuration = 1800;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = await fetch(`${beAdminRoutes.curriculumJobs()}?${url.searchParams.toString()}`, {
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(req: Request) {
  const body = await req.json();
  const response = await proxyJsonRequest({
    url: beAdminRoutes.curriculumJobs(),
    method: "POST",
    headers: {
      authorization: req.headers.get("authorization") || ""
    },
    body
  });
  return NextResponse.json(response.data, { status: response.status });
}
