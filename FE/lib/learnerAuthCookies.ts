import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const LEARNER_AUTH_COOKIE = "learner_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function getLearnerAuthToken() {
  const cookieStore = await cookies();
  return cookieStore.get(LEARNER_AUTH_COOKIE)?.value || "";
}

export async function createLearnerAuthHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  const token = await getLearnerAuthToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

export function setLearnerAuthCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: LEARNER_AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS
  });
}

export function clearLearnerAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: LEARNER_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
