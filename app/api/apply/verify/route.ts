import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { applicants, getDb } from "@/lib/db";
import { applyVideoaskCompletion, provisionIdentitySession } from "@/lib/application";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { parseVideoaskReference } from "@/lib/videoask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// VideoAsk thank-you redirect (and resume hand-off) → Didit for in-person.
// Configure VideoAsk Logic → Redirect to URL:
//   https://www.climaterefugeepavilion.org/api/apply/verify?ref=@application_ref
// The signed ref lets us advance before the webhook lands; without it we still
// wait for the webhook so a premature open cannot skip the form.
export async function GET(req: NextRequest) {
  const home = new URL("/apply", req.nextUrl.origin);
  const complete = new URL("/apply/complete", req.nextUrl.origin);
  const ref = parseVideoaskReference(
    req.nextUrl.searchParams.get("ref") ?? req.nextUrl.searchParams.get("application_ref"),
  );
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

  if (ref) {
    await db.transaction((tx) => applyVideoaskCompletion(tx, applicant.id));
  }

  const [current] = await db.select().from(applicants).where(eq(applicants.id, applicant.id));
  if (!current) return NextResponse.redirect(home);

  if (current.track === "online" || !["round1_complete", "id_failed"].includes(current.status)) {
    return NextResponse.redirect(complete);
  }

  const { url } = await provisionIdentitySession(db, current.id);
  return NextResponse.redirect(url ?? complete);
}
