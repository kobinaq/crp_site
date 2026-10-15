import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "svix";
import { getDb } from "@/lib/db";
import { ingestWebhook } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resend delivery events (sent, delivered, bounced, complained...). They are
// signed with Svix; the svix-id is the delivery's identity, so a redelivery is
// recognised before it touches anything.
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // svix 2.x's Webhook.verify() only checks the signature and returns nothing,
  // so the payload is parsed here, from the exact bytes that were verified.
  try {
    new Webhook(secret).verify(raw, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const ingest = await ingestWebhook(getDb(), "resend", svixId, payload as Record<string, unknown>);
  if (ingest.queued) return NextResponse.json({ ok: true, queued: true }, { status: 202 });
  return NextResponse.json({ ok: true, duplicate: ingest.duplicate, outcome: ingest.result?.outcome ?? null });
}
