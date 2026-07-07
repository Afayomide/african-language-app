import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = await fetch(`${beAdminRoutes.languages()}?${url.searchParams.toString()}`, {
    headers: {
      authorization: req.headers.get("authorization") || ""
    },
    cache: "no-store"
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
