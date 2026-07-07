import { NextResponse } from "next/server";
import { beTutorRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request) {
  const response = await fetch(beTutorRoutes.languages(), {
    headers: {
      authorization: req.headers.get("authorization") || ""
    },
    cache: "no-store"
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
