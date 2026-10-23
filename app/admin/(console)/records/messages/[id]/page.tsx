import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { MessageView } from "@/components/admin/MessageView";
import { parseMessageId, loadMessage } from "@/lib/contact/messages";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { updateMessage } from "./actions";

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("messages.read");
  const { id } = await params;
  const messageId = parseMessageId(id);
  if (!messageId) notFound();
  const detail = await loadMessage(getDb(), staff, messageId);
  if (!detail) notFound();
  return <MessageView key={detail.id} detail={detail} noteId={randomUUID()} action={updateMessage} />;
}
