import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { appSecret } from "@/lib/config";
import { getDb } from "@/lib/db";
import { parseApplicantId, readMediaEnv } from "@/lib/holdings";
import { openHolding } from "@/lib/media";
import { STAFF_COOKIE, readStaff } from "@/lib/staff/auth";
import { staffSameOrigin } from "@/lib/staff/origin";
import { can } from "@/lib/staff/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!staffSameOrigin(req.headers)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const staff = await readStaff(getDb(), (await cookies()).get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const { id } = await context.params;
  const applicantId = parseApplicantId(id);
  const body = await req.json().catch(() => null);
  const record = body && typeof body === "object" ? body as { slot?: unknown; holdingId?: unknown } : null;
  const slot = record?.slot === "answer" || record?.slot === "document" ? record.slot : null;
  const holdingId = typeof record?.holdingId === "string" ? record.holdingId : null;
  if (!applicantId || !slot || !holdingId) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  if (slot === "document" ? !can(staff.role, "identity.view") : !can(staff.role, "dashboard.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  const opened = await openHolding(getDb(), {
    actorId: staff.id,
    role: staff.role,
    applicantId,
    slot,
    holdingId,
  }, new Date(), readMediaEnv(process.env), appSecret());
  if (!opened.ok) {
    const status = opened.error === "forbidden" ? 403 : opened.error === "not_ready" ? 409 : 404;
    return NextResponse.json({ error: opened.error }, { status, headers: noStore });
  }
  return NextResponse.json({ url: opened.url }, { status: 201, headers: { "content-type": "application/json", ...noStore } });
}
