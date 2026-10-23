import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, identityDocuments } from "@/lib/db";
import { authenticateOperator } from "@/lib/operations-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!authenticateOperator(req.headers)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const [document] = await getDb()
    .select()
    .from(identityDocuments)
    .where(eq(identityDocuments.id, id));
  if (!document) return NextResponse.json({ error: "not found" }, { status: 404 });
  const blob = await get(document.pathname, { access: "private" });
  if (!blob?.stream) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new Response(blob.stream, {
    headers: {
      "Content-Type": document.contentType,
      "Content-Length": String(document.size),
      "Content-Disposition": `inline; filename="${document.kind.replace(/[^a-z0-9_-]+/gi, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
