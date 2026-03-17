import { NextResponse } from "next/server";
import { beTutorAiRoutes } from "@/lib/apiRoutes";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const body = await req.json();

  const response = await fetch(beTutorAiRoutes.refactorLessonContent(lessonId), {
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
