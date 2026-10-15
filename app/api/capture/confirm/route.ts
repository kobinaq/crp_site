import { NextResponse, type NextRequest } from "next/server";
import { confirmCapture } from "@/lib/capture-confirmation";
import { getDb } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Waitlist and interest sign-ups no longer send confirmation links; they are
// saved on submit. This only serves links already sitting in inboxes: opening
// one saves that sign-up directly. There is no "expired" dead end: a link that
// is unknown, expired or already used just goes to the home page.
export async function GET(req: NextRequest) {
  const home = new URL("/", req.nextUrl.origin);
  if (!(await rateLimit("capture:confirm", clientIp(req.headers), 30))) return NextResponse.redirect(home, 302);
  const ok = await confirmCapture(getDb(), req.nextUrl.searchParams.get("token") ?? "");
  return NextResponse.redirect(ok ? new URL("/confirmation?result=confirmed", req.nextUrl.origin) : home, 302);
}
