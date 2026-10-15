import { confirmationPage } from "@/lib/confirmation-page";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { consumeAccessToken } from "@/lib/access";
import { lockApplicant, transition } from "@/lib/lifecycle";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { enqueueEmail } from "@/lib/jobs";
import { receivedEmail } from "@/lib/emails";
import { checkOrigin, INVALID_ORIGIN } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET is deliberately read-only: mail scanners may follow every email link.
export function GET(req: NextRequest) {
  return confirmationPage(
    req.nextUrl.searchParams.get("token") ?? "",
    "/api/apply/switch-online",
    "Switch to the online programme",
    req.nextUrl.searchParams.get("lang") ?? "en",
  );
}

export async function POST(req: NextRequest) {
  const verdict = checkOrigin(req);
  if (verdict === "reject") return NextResponse.json(INVALID_ORIGIN, { status: 403 });
  const expired = new URL("/apply/complete?switch=expired", req.nextUrl.origin);
  const done = new URL("/apply/complete?switch=ok", req.nextUrl.origin);
  if (!(await rateLimit("switch-online:ip", clientIp(req.headers), 30, 3600))) {
    return NextResponse.redirect(expired, 303);
  }
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string") return verdict === "needs-token" ? NextResponse.json(INVALID_ORIGIN, { status: 403 }) : NextResponse.redirect(expired, 303);

  const moved = await getDb().transaction(async (tx) => {
    const applicantId = await consumeAccessToken(tx, token, "switch_online");
    if (!applicantId) return null;
    const current = await lockApplicant(tx, applicantId);
    if (!current) return null;
    const result = await transition(tx, {
      applicantId: current.id,
      to: "under_review",
      actor: "applicant",
      reason: "accepted online track offer",
      allowFrom: ["online_offered"],
      patch: {
        track: "online",
        reviewCycle: current.reviewCycle + 1,
        reviewDecision: null,
        reviewNotes: null,
        reviewer: null,
        reviewDate: null,
        interviewOutcome: null,
        interviewNotes: null,
        interviewDate: null,
        interviewAt: null,
      },
    });
    if (result.ok) {
      await enqueueEmail(tx, `email:received:${result.applicant.id}:${result.applicant.reviewCycle}`, {
        to: result.applicant.email,
        ...receivedEmail(result.applicant.fullName, result.applicant.language),
      }, "received", result.applicant.id);
    }
    return result;
  });

  if (!moved && verdict === "needs-token") return NextResponse.json(INVALID_ORIGIN, { status: 403 });
  return NextResponse.redirect(moved?.ok ? done : expired, 303);
}
