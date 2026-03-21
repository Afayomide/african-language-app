import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function PUT(req: Request, context: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await context.params;
  const response = await fetch(beAdminRoutes.bulkWordAudio(lessonId), {
    method: "PUT",
    headers: { authorization: req.headers.get("authorization") || "" }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
