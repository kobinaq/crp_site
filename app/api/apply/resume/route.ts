import { LOCALE_COOKIE } from "@/lib/locale";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { accessTokens, applicants, getDb, type Applicant } from "@/lib/db";
import { hashToken, redeemAccessToken } from "@/lib/access";
import { nextStepUrl } from "@/lib/application";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { checkOrigin, INVALID_ORIGIN } from "@/lib/request-origin";
import { allows, CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The application email's button. Opening it confirms the address and signs
// the applicant in within this one request, then redirects straight to their
// next step (VideoAsk for a new application: VIDEOASK_FORM_URL with the signed
// #application_ref). No interstitial page.
//
// Mail scanners may open the link first, so a genuine link keeps redirecting
// until it expires (see redeemAccessToken); each open rotates the session so
// only the latest opener stays signed in. Expired or unknown links go to
// /apply?resume=expired to request a new one, unless this browser already
// holds the session of the link's own applicant, who is sent on to their step.
type Redeemed = { applicant: Applicant; signIn: boolean } | null;

async function redeem(req: NextRequest, token: string): Promise<Redeemed> {
  const db = getDb();
  const applicant = await db.transaction(async (tx) => {
    const applicantId = await redeemAccessToken(tx, token, "resume");
    if (!applicantId) return null;
    const [row] = await tx.update(applicants).set({ emailVerifiedAt: sql`coalesce(${applicants.emailVerifiedAt}, now())`, sessionVersion: sql`${applicants.sessionVersion} + 1` })
      .where(eq(applicants.id, applicantId)).returning();
    return row ?? null;
  });
  if (applicant) return { applicant, signIn: true };

  const session = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session || !token || token.length > 200) return null;
  const [owned] = await db.select({ id: accessTokens.applicantId }).from(accessTokens)
    .where(and(eq(accessTokens.hash, hashToken(token)), eq(accessTokens.purpose, "resume"), eq(accessTokens.applicantId, session.applicantId)));
  if (!owned) return null;
  const [current] = await db.select().from(applicants).where(eq(applicants.id, session.applicantId));
  if (!current?.emailVerifiedAt || current.sessionVersion !== session.version) return null;
  return { applicant: current, signIn: false };
}

function landing(req: NextRequest, redeemed: NonNullable<Redeemed>, status: 302 | 303) {
  const { applicant, signIn } = redeemed;
  const res = NextResponse.redirect(new URL(nextStepUrl(applicant), req.nextUrl.origin), status);
  if (signIn) {
    res.cookies.set(SESSION_COOKIE, signSession(applicant.id, applicant.sessionVersion), sessionCookieOptions());
    // crp-locale is a functional cookie: only with the visitor's crp-consent.
    // The redirect already carries the locale, so nothing depends on it here.
    if (allows(parseConsent(req.cookies.get(CONSENT_COOKIE)?.value), "functional")) {
      res.cookies.set(LOCALE_COOKIE, applicant.language, { path: "/", sameSite: "lax", maxAge: 31536000, secure: process.env.NODE_ENV === "production" });
    }
  }
  return res;
}

export async function GET(req: NextRequest) {
  const expired = new URL("/apply?resume=expired", req.nextUrl.origin);
  if (!(await rateLimit("resume:ip", clientIp(req.headers), 30, 3600))) return NextResponse.redirect(expired, 302);
  const redeemed = await redeem(req, req.nextUrl.searchParams.get("token") ?? "");
  return redeemed ? landing(req, redeemed, 302) : NextResponse.redirect(expired, 302);
}

// Kept for confirmation pages that were already open in a browser when the
// interstitial was removed. Same CSRF gate as before.
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
  const redeemed = await redeem(req, token);
  if (!redeemed) return verdict === "needs-token" ? NextResponse.json(INVALID_ORIGIN, { status: 403 }) : NextResponse.redirect(home, 303);
  return landing(req, redeemed, 303);
}
