import { NextResponse } from "next/server";
import { beTutorRoutes } from "@/lib/apiRoutes";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = await fetch(`${beTutorRoutes.voiceAudioSubmissions()}${url.search}`, {
    headers: {
      authorization: req.headers.get("authorization") || ""
    }
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
