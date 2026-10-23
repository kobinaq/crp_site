"use server";

import { revalidatePath } from "next/cache";
import { addNote, assignStaff, isPartnerStatus, moveStatus } from "@/lib/desk/case";
import { getDb } from "@/lib/db";
import { assertStaffAction } from "@/lib/staff/gate";
import { isUserId, parseUserId } from "@/lib/staff/users";

export type DeskFormState =
  | {
      readonly result:
        | "forbidden"
        | "invalid"
        | "not_found"
        | "conflict"
        | "illegal"
        | "invalid_assignee"
        | "saved";
    }
  | null;

export async function addPartnerNote(_previous: DeskFormState, formData: FormData): Promise<DeskFormState> {
  const actor = await assertStaffAction("partners.manage");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const noteId = parseUserId(String(formData.get("noteId") ?? ""));
  const body = String(formData.get("body") ?? "");
  if (!recordId || !noteId) return { result: "invalid" };
  const saved = await addNote(getDb(), actor, {
    desk: "partner",
    recordId,
    noteId,
    body,
  });
  if (!saved.ok) return { result: saved.reason };
  revalidatePath(`/admin/records/partners/${recordId}`);
  return { result: "saved" };
}

export async function movePartner(_previous: DeskFormState, formData: FormData): Promise<DeskFormState> {
  const actor = await assertStaffAction("partners.manage");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const expected = String(formData.get("expected") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!recordId || !isPartnerStatus(expected) || !isPartnerStatus(to)) return { result: "invalid" };
  const moved = await moveStatus(getDb(), actor, {
    desk: "partner",
    recordId,
    expected,
    to,
  });
  if (!moved.ok) return { result: moved.reason };
  revalidatePath(`/admin/records/partners/${recordId}`);
  revalidatePath("/admin/records");
  revalidatePath("/admin");
  return { result: "saved" };
}

export async function assignPartner(_previous: DeskFormState, formData: FormData): Promise<DeskFormState> {
  const actor = await assertStaffAction("partners.manage");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const assigneeId = idOrEmpty(formData.get("assigneeId"));
  const expectedAssigneeId = idOrEmpty(formData.get("expectedAssigneeId"));
  if (!recordId || assigneeId === "invalid" || expectedAssigneeId === "invalid") return { result: "invalid" };
  const assigned = await assignStaff(getDb(), actor, {
    desk: "partner",
    recordId,
    assigneeId,
    expectedAssigneeId,
  });
  if (!assigned.ok) return { result: assigned.reason };
  revalidatePath(`/admin/records/partners/${recordId}`);
  revalidatePath("/admin/records");
  revalidatePath("/admin");
  return { result: "saved" };
}

function idOrEmpty(value: FormDataEntryValue | null): string | null | "invalid" {
  const raw = String(value ?? "");
  if (!raw) return null;
  return isUserId(raw) ? raw : "invalid";
}
