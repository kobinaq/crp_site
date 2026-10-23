import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { parseApplicantId } from "@/lib/holdings";
import { streamHolding } from "@/lib/media";
import { STAFF_COOKIE, readStaff } from "@/lib/staff/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string; slot: string; holdingId: string }> };

// Applied to every response, including errors, so nothing here is cached or
// leaks this address to another site.
const PRIVATE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin",
  "x-content-type-options": "nosniff",
};

function refuse(text: string, status: number): Response {
  return new Response(text, { status, headers: PRIVATE_HEADERS });
}

// The staff cookie is SameSite=Lax, so this mostly guards against a stray
// cross-site embed. Same-origin <video>, <audio>, <img> and <iframe> pass.
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

async function respond(req: NextRequest, context: Params, method: "GET" | "HEAD"): Promise<Response> {
  if (foreignRequest(req.headers)) return refuse("forbidden", 403);
  const staff = await readStaff(getDb(), (await cookies()).get(STAFF_COOKIE)?.value);
  if (!staff) return refuse("unauthorized", 401);
  const { id, slot, holdingId } = await context.params;
  const applicantId = parseApplicantId(id);
  if (!applicantId || (slot !== "answer" && slot !== "document") || !holdingId) return refuse("not found", 404);
  const result = await streamHolding(getDb(), {
    actorId: staff.id,
    role: staff.role,
    applicantId,
    slot,
    holdingId,
    rangeHeader: req.headers.get("range"),
    method,
    signal: req.signal,
  });
  if (!result.ok) {
    const text = result.status === 502 ? "media unavailable" : result.status === 403 ? "forbidden" : "not found";
    return refuse(text, result.status);
  }
  const headers = new Headers(result.bytes.headers);
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) headers.set(name, value);
  return new Response(method === "HEAD" ? null : result.bytes.body, { status: result.bytes.status, headers });
}

export function GET(req: NextRequest, context: Params) {
  return respond(req, context, "GET");
}

export function HEAD(req: NextRequest, context: Params) {
  return respond(req, context, "HEAD");
}
