import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { applicants, getDb } from "@/lib/db";
import { provisionIdentitySession } from "@/lib/application";
import { LOCALE_COOKIE } from "@/lib/locale";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { parseVideoaskReference } from "@/lib/videoask";
import { finishingUpPage, verifyWait, waitWhileSubmitted } from "@/lib/verify-wait";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The in-request wait is ~6s; leave headroom for Didit session creation.
export const maxDuration = 30;

// VideoAsk thank-you redirect (and resume hand-off) → Didit for in-person.
// Configure VideoAsk Logic → Redirect to URL:
//   https://www.climaterefugeepavilion.org/api/apply/verify?ref=@application_ref
//
// This route NEVER changes an applicant's status. The ref only identifies who
// is returning; Round 1 is completed solely by the authenticated VideoAsk
// webhook (x-webhook-secret + isAllowedVideoaskForm). If that webhook has not
// landed yet, we wait briefly, then show a self-refreshing "finishing up" page.
export async function GET(req: NextRequest) {
  const home = new URL("/apply", req.nextUrl.origin);
  const complete = new URL("/apply/complete", req.nextUrl.origin);
  const rawRef = req.nextUrl.searchParams.get("ref") ?? req.nextUrl.searchParams.get("application_ref");
  const ref = parseVideoaskReference(rawRef);
  const session = verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (session && ref && session.applicantId !== ref.applicantId) {
    return NextResponse.redirect(home);
  }
  const applicantId = session?.applicantId ?? ref?.applicantId;
  if (!applicantId) return NextResponse.redirect(home);

  const db = getDb();
  const [applicant] = await db.select().from(applicants).where(eq(applicants.id, applicantId));
  if (!applicant?.emailVerifiedAt) return NextResponse.redirect(home);
  if (session && applicant.sessionVersion !== session.version) return NextResponse.redirect(home);
  if (
    !(await rateLimit("verify:applicant", applicant.id, 30, 3600)) ||
    !(await rateLimit("verify:ip", clientIp(req.headers), 30, 3600))
  ) {
    return NextResponse.redirect(home);
  }

  if (applicant.track === "online") return NextResponse.redirect(complete);
  // Without the thank-you ref this is not a return from VideoAsk (e.g. a
  // session-only hand-off), so there is no in-flight webhook worth waiting for.
  if (applicant.status === "submitted" && !ref) return NextResponse.redirect(complete);

  const current = await waitWhileSubmitted(db, applicant);
  if (current.status === "submitted") {
    const attempt = Number(req.nextUrl.searchParams.get("attempt") ?? "0") || 0;
    if (attempt >= verifyWait.maxAttempts) return NextResponse.redirect(complete);
    const next = new URL("/api/apply/verify", req.nextUrl.origin);
    if (rawRef) next.searchParams.set("ref", rawRef);
    next.searchParams.set("attempt", String(attempt + 1));
    return finishingUpPage(next.toString(), req.cookies.get(LOCALE_COOKIE)?.value ?? applicant.language);
  }
  if (current.track === "online" || !["round1_complete", "id_failed"].includes(current.status)) {
    return NextResponse.redirect(complete);
  }

  const { url } = await provisionIdentitySession(db, current.id);
  return NextResponse.redirect(url ?? complete);
}
