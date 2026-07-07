import { NextResponse } from "next/server";
import { bePublicRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = await fetch(`${bePublicRoutes.languages()}?${url.searchParams.toString()}`, {
    cache: "no-store"
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
