import { LOCALE_COOKIE } from "@/lib/locale";
import { confirmationPage } from "@/lib/confirmation-page";
import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { applicants, getDb } from "@/lib/db";
import { consumeAccessToken } from "@/lib/access";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { checkOrigin, INVALID_ORIGIN } from "@/lib/request-origin";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET is deliberately read-only: mail scanners may follow every email link.
export function GET(req: NextRequest) {
  return confirmationPage(req.nextUrl.searchParams.get("token") ?? "", "/api/apply/resume", "Continue your application", req.nextUrl.searchParams.get("lang") ?? "en");
}

export async function POST(req: NextRequest) {
  const verdict = checkOrigin(req);
  if (verdict === "reject") return NextResponse.json(INVALID_ORIGIN, { status: 403 });
  const home = new URL("/apply?resume=expired", req.nextUrl.origin);
  if (!(await rateLimit("resume:ip", clientIp(req.headers), 30, 3600))) {
    return NextResponse.redirect(home, 303);
  }
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string") return verdict === "needs-token" ? NextResponse.json(INVALID_ORIGIN, { status: 403 }) : NextResponse.redirect(home, 303);
  const db = getDb();
  const applicant = await db.transaction(async (tx) => {
    const applicantId = await consumeAccessToken(tx, token, "resume");
    if (!applicantId) return null;
    const [row] = await tx.update(applicants).set({ emailVerifiedAt: sql`coalesce(${applicants.emailVerifiedAt}, now())`, sessionVersion: sql`${applicants.sessionVersion} + 1` })
      .where(eq(applicants.id, applicantId)).returning();
    return row ?? null;
  });
  if (!applicant) return verdict === "needs-token" ? NextResponse.json(INVALID_ORIGIN, { status: 403 }) : NextResponse.redirect(home, 303);

  const res = NextResponse.redirect(new URL("/apply/continue", req.nextUrl.origin), 303);
  res.cookies.set(SESSION_COOKIE, signSession(applicant.id, applicant.sessionVersion), sessionCookieOptions());
  res.cookies.set(LOCALE_COOKIE, applicant.language, { path: "/", sameSite: "lax", maxAge: 31536000, secure: process.env.NODE_ENV === "production" });
  return res;
}
