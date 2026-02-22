import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(beAdminRoutes.acceptVoiceAudioSubmission(id), {
    method: "PUT",
    headers: { authorization: req.headers.get("authorization") || "" }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
