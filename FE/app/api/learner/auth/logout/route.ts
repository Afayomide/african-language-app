import { NextResponse } from "next/server";
import { clearLearnerAuthCookie } from "@/lib/learnerAuthCookies";

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearLearnerAuthCookie(response);
  return response;
}
