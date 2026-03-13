import { NextResponse } from "next/server";

export async function PUT() {
  return NextResponse.json(
    { error: "Publishing questions is not available for tutors." },
    { status: 405 }
  );
}
