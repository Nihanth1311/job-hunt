import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/server/auth";
import { siteUrl } from "@/server/auth/google";

export const dynamic = "force-dynamic";

/** Sign out: delete this browser's session and go to the login page. */
export async function POST(req: NextRequest) {
  await endSession();
  return NextResponse.redirect(siteUrl(req, "/login"), 303);
}
