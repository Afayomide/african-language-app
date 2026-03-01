import { NextResponse } from "next/server";
import { beAdminRoutes } from "@/lib/apiRoutes";

export async function DELETE(req: Request) {
  const body = await req.json();
  const response = await fetch(beAdminRoutes.bulkDeleteLessons(), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") || ""
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
