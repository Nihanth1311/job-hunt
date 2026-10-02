import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sign out: delete this browser's session and go to the login page. */
export async function POST(req: NextRequest) {
  await endSession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
