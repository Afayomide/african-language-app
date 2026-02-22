import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(beAdminRoutes.deleteVoiceArtist(id), {
    method: "DELETE",
    headers: { authorization: req.headers.get("authorization") || "" }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
