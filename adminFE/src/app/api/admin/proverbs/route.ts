import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = await fetch(`${beAdminRoutes.proverbs()}?${url.searchParams.toString()}`, {
    headers: {
      authorization: req.headers.get("authorization") || "",
    },
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(req: Request) {
  const body = await req.json();
  const response = await fetch(beAdminRoutes.proverbs(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") || "",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
