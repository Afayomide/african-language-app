import { NextResponse } from "next/server";
import { beLearnerRoutes } from "@/lib/apiRoutes";
import { readJsonResponse } from "@/lib/learnerProxy";
import { setLearnerAuthCookie } from "@/lib/learnerAuthCookies";

export async function POST(req: Request) {
  const body = await req.json();
  const response = await fetch(beLearnerRoutes.signup(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await readJsonResponse(response);
  const payload =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const nextResponse = NextResponse.json(
    {
      ...payload,
      token: undefined
    },
    { status: response.status }
  );

  if (response.ok && typeof payload.token === "string" && payload.token) {
    setLearnerAuthCookie(nextResponse, payload.token);
  }

  return nextResponse;
}
