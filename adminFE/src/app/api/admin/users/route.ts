import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = await fetch(`${beAdminRoutes.users()}?${url.searchParams.toString()}`, {
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
