import { NextResponse } from "next/server";
import { beTutorRoutes } from "@/lib/apiRoutes";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; lessonId: string }> }
) {
  const { id, lessonId } = await context.params;
  const response = await fetch(beTutorRoutes.restoreDeletedUnitLesson(id, lessonId), {
    method: "POST",
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
