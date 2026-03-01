import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await fetch(beAdminRoutes.proverb(id), {
    headers: {
      authorization: req.headers.get("authorization") || "",
    },
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json();
  const response = await fetch(beAdminRoutes.proverb(id), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") || "",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await fetch(beAdminRoutes.proverb(id), {
    method: "DELETE",
    headers: {
      authorization: req.headers.get("authorization") || "",
    },
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
