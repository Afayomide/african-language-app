import { NextResponse } from "next/server";
import { beVoiceRoutes } from "@/lib/apiRoutes";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ contentType: string; id: string }> }
) {
  const { contentType, id } = await params;
  const body = await req.json();
  const response = await fetch(beVoiceRoutes.createSubmission(contentType, id), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") || ""
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
