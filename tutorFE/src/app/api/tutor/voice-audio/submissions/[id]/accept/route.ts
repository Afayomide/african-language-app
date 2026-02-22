import { NextResponse } from "next/server";
import { beTutorRoutes } from "@/lib/apiRoutes";

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await fetch(beTutorRoutes.acceptVoiceAudioSubmission(id), {
    method: "PUT",
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
