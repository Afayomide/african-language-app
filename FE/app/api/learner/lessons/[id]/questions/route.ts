import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "";

  const response = await fetch(beLearnerRoutes.lessonQuestions(id, type), {
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
