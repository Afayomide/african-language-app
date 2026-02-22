import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";

export async function POST(req: Request) {
  const body = await req.json();
  const response = await fetch(beLearnerRoutes.markSession(), {
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
