import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const response = await fetch(beAdminRoutes.rejectVoiceAudioSubmission(id), {
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
