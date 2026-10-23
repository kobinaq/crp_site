import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { secretOk } from "@/lib/api-auth";
import { applyDecisions } from "@/lib/decisions";
import { decisionsInput, normalizeDecisions } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-sync-secret"), process.env.SYNC_API_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = decisionsInput.safeParse(normalizeDecisions(raw));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { outcomes, transitions } = await applyDecisions(getDb(), parsed.data, { via: "sheet" });
  return NextResponse.json({ ok: true, processed: parsed.data.length, transitions, outcomes });
}
