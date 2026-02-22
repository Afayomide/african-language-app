import { NextResponse } from "next/server";
import { beTutorRoutes } from "@/lib/apiRoutes";

export async function PUT(req: Request) {
  const body = await req.json();
  const response = await fetch(beTutorRoutes.reorderLessons(), {
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
