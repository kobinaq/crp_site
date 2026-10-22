import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { appSecret } from "@/lib/config";
import { getDb } from "@/lib/db";
import { parseApplicantId, readMediaEnv } from "@/lib/holdings";
import { streamHolding } from "@/lib/media";
import { STAFF_COOKIE, readStaff } from "@/lib/staff/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const noStore = { "cache-control": "private, no-store" };

function foreignRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return true;
  const origin = headers.get("origin");
  if (!origin) return false;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]?.trim();
  try {
    return !host || new URL(origin).host !== host;
  } catch {
    return true;
  }
}

async function respond(req: NextRequest, context: { params: Promise<{ id: string; token: string }> }, method: "GET" | "HEAD") {
  if (foreignRequest(req.headers)) return new Response("forbidden", { status: 403, headers: noStore });
  const staff = await readStaff(getDb(), (await cookies()).get(STAFF_COOKIE)?.value);
  if (!staff) return new Response("unauthorized", { status: 401, headers: noStore });
  const { id, token: rawToken } = await context.params;
  const applicantId = parseApplicantId(id);
  let token = "";
  try {
    token = decodeURIComponent(rawToken);
  } catch {
    token = "";
  }
  if (!applicantId || !token) return new Response("not found", { status: 404, headers: noStore });
  const result = await streamHolding(getDb(), {
    actorId: staff.id,
    role: staff.role,
    applicantId,
    token,
    rangeHeader: req.headers.get("range"),
    method,
    signal: req.signal,
  }, new Date(), readMediaEnv(process.env), appSecret());
  if (!result.ok) {
    const text = result.status === 502 ? "media unavailable" : result.status === 403 ? "forbidden" : "not found";
    return new Response(text, { status: result.status, headers: noStore });
  }
  const headers = new Headers(result.bytes.headers);
  headers.set("cache-control", "private, no-store");
  return new Response(method === "HEAD" ? null : result.bytes.body, { status: result.bytes.status, headers });
}

export function GET(req: NextRequest, context: { params: Promise<{ id: string; token: string }> }) {
  return respond(req, context, "GET");
}

export function HEAD(req: NextRequest, context: { params: Promise<{ id: string; token: string }> }) {
  return respond(req, context, "HEAD");
}
