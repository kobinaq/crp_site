"use server";

import { revalidatePath } from "next/cache";
import { changeMessage, parseMessageId, parseNoteId } from "@/lib/contact/messages";
import {
  MESSAGE_FIELDS,
  isContactStatus,
  isContactVerb,
  messageHref,
} from "@/lib/contact/model";
import { getDb } from "@/lib/db";
import { assertStaffAction } from "@/lib/staff/gate";
import { isUserId, type UserId } from "@/lib/staff/users";

export type MessageFormState =
  | { readonly result: "forbidden" | "invalid" | "not_found" | "conflict" | "illegal" | "invalid_assignee" | "saved" }
  | null;

function idOrEmpty(value: FormDataEntryValue | null): UserId | null | "invalid" {
  const raw = String(value ?? "");
  if (!raw) return null;
  return isUserId(raw) ? raw : "invalid";
}

function commandFrom(kind: string, messageId: NonNullable<ReturnType<typeof parseMessageId>>, formData: FormData) {
  if (kind === "note") {
    const noteId = parseNoteId(String(formData.get(MESSAGE_FIELDS.noteId) ?? ""));
    if (!noteId) return null;
    return { kind: "note" as const, messageId, noteId, body: String(formData.get(MESSAGE_FIELDS.body) ?? "") };
  }
  if (kind === "assign") {
    const assigneeId = idOrEmpty(formData.get(MESSAGE_FIELDS.assigneeId));
    const expectedAssigneeId = idOrEmpty(formData.get(MESSAGE_FIELDS.expectedAssigneeId));
    if (assigneeId === "invalid" || expectedAssigneeId === "invalid") return null;
    return { kind: "assign" as const, messageId, assigneeId, expectedAssigneeId };
  }
  if (!isContactVerb(kind)) return null;
  const expected = String(formData.get(MESSAGE_FIELDS.expected) ?? "");
  if (!isContactStatus(expected)) return null;
  return { kind, messageId, expected };
}

export async function updateMessage(_previous: MessageFormState, formData: FormData): Promise<MessageFormState> {
  const actor = await assertStaffAction("messages.manage");
  if (!actor) return { result: "forbidden" };
  const messageId = parseMessageId(String(formData.get(MESSAGE_FIELDS.messageId) ?? ""));
  if (!messageId) return { result: "invalid" };
  const command = commandFrom(String(formData.get(MESSAGE_FIELDS.kind) ?? ""), messageId, formData);
  if (!command) return { result: "invalid" };
  const saved = await changeMessage(getDb(), actor, command);
  if (!saved.ok) return { result: saved.reason };
  revalidatePath(messageHref(messageId));
  revalidatePath("/admin/records");
  revalidatePath("/admin");
  return { result: "saved" };
}
