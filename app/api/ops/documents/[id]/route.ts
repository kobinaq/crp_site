import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/admin/events";
import { getDb, identityDocuments } from "@/lib/db";
import { servedDocumentType } from "@/lib/media";
import { authenticateOperator } from "@/lib/operations-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const operator = authenticateOperator(req.headers);
  if (!operator) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const db = getDb();
  const [document] = await db
    .select()
    .from(identityDocuments)
    .where(eq(identityDocuments.id, id));
  if (!document) return NextResponse.json({ error: "not found" }, { status: 404 });
  const blob = await get(document.pathname, { access: "private" });
  if (!blob?.stream) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Every operations download of an identity document lands in the staff
  // activity log, attributed to the configured key that made it.
  await db.transaction(async (tx) => {
    await recordEvent(tx, null, { kind: "identity.document_downloaded", applicantId: document.applicantId, documentId: document.id, operator });
  });
  const safeType = servedDocumentType(document.contentType);
  const filename = document.kind.replace(/[^a-z0-9_-]+/gi, "_");
  return new Response(blob.stream, {
    headers: {
      "Content-Type": safeType ?? "application/octet-stream",
      "Content-Length": String(document.size),
      "Content-Disposition": safeType ? `inline; filename="${filename}"` : `attachment; filename="${filename}.bin"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
