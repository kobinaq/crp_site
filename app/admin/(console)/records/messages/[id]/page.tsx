import { randomUUID } from "crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageView } from "@/components/admin/MessageView";
import { adjacentDetailHrefs, parseRecordQuery } from "@/lib/admin/records";
import { recordsHref } from "@/lib/admin/return";
import { parseMessageId, loadMessage } from "@/lib/contact/messages";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { updateMessage } from "./actions";

export const metadata: Metadata = { title: "Message" };

export default async function MessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff("messages.read");
  const { id } = await params;
  const messageId = parseMessageId(id);
  if (!messageId) notFound();
  const listQuery = { ...parseRecordQuery(flat(await searchParams)), list: "messages" as const };
  const db = getDb();
  const detail = await loadMessage(db, staff, messageId);
  if (!detail) notFound();
  const neighbors = await adjacentDetailHrefs(db, listQuery, { id: detail.id, createdAt: detail.createdAt }, staff);
  return (
    <MessageView
      key={detail.id}
      detail={detail}
      listHref={recordsHref(listQuery)}
      previous={neighbors.previous}
      next={neighbors.next}
      noteId={randomUUID()}
      action={updateMessage}
    />
  );
}

function flat(query: Record<string, string | string[] | undefined>): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) raw[key] = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return raw;
}
