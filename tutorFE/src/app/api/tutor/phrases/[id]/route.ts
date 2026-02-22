import { NextResponse } from "next/server";
import { beTutorRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(beTutorRoutes.phrase(id), {
    headers: { authorization: req.headers.get("authorization") || "" }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const response = await fetch(beTutorRoutes.phrase(id), {
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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(beTutorRoutes.phrase(id), {
    method: "DELETE",
    headers: { authorization: req.headers.get("authorization") || "" }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
