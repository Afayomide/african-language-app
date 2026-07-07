import { NextResponse } from "next/server";
import { beTutorRoutes } from "@/lib/apiRoutes";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; sentenceId: string }> }
) {
  const { id, sentenceId } = await context.params;
  const response = await fetch(beTutorRoutes.restoreDeletedUnitSentence(id, sentenceId), {
    method: "POST",
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
