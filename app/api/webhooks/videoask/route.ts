import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { secretOk } from "@/lib/api-auth";
import { ingestWebhook } from "@/lib/webhooks";
import { readVideoaskCompletion } from "@/lib/videoask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-webhook-secret"), process.env.VIDEOASK_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const completion = readVideoaskCompletion(body);
  if (!completion) return NextResponse.json({ error: "invalid completion event" }, { status: 400 });
  if ("ignored" in completion) return NextResponse.json({ ok: true, ignored: completion.ignored });
  const ingest = await ingestWebhook(getDb(), "videoask", `${completion.formId}:${completion.eventId}`, completion);
  return NextResponse.json({ ok: true, duplicate: ingest.duplicate, queued: ingest.queued,
    status: ingest.result?.status ?? null, advanced: ingest.result?.advanced ?? false }, { status: ingest.queued ? 202 : 200 });
}
