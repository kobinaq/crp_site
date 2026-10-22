"use server";

import { revalidatePath } from "next/cache";
import { addNote, isNominationStatus, moveStatus, assignStaff } from "@/lib/desk/case";
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

export async function addNominationNote(_previous: DeskFormState, formData: FormData): Promise<DeskFormState> {
  const actor = await assertStaffAction("nominations.note");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const noteId = parseUserId(String(formData.get("noteId") ?? ""));
  const body = String(formData.get("body") ?? "");
  if (!recordId || !noteId) return { result: "invalid" };
  const saved = await addNote(getDb(), actor, {
    desk: "nomination",
    recordId,
    noteId,
    body,
  });
  if (!saved.ok) return { result: saved.reason };
  revalidatePath(`/admin/records/nominations/${recordId}`);
  return { result: "saved" };
}

export async function moveNomination(_previous: DeskFormState, formData: FormData): Promise<DeskFormState> {
  const actor = await assertStaffAction("nominations.manage");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const expected = String(formData.get("expected") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!recordId || !isNominationStatus(expected) || !isNominationStatus(to)) return { result: "invalid" };
  const moved = await moveStatus(getDb(), actor, {
    desk: "nomination",
    recordId,
    expected,
    to,
  });
  if (!moved.ok) return { result: moved.reason };
  revalidatePath(`/admin/records/nominations/${recordId}`);
  revalidatePath("/admin/records");
  revalidatePath("/admin");
  return { result: "saved" };
}

export async function assignNomination(_previous: DeskFormState, formData: FormData): Promise<DeskFormState> {
  const actor = await assertStaffAction("nominations.manage");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const assigneeId = idOrEmpty(formData.get("assigneeId"));
  const expectedAssigneeId = idOrEmpty(formData.get("expectedAssigneeId"));
  if (!recordId || assigneeId === "invalid" || expectedAssigneeId === "invalid") return { result: "invalid" };
  const assigned = await assignStaff(getDb(), actor, {
    desk: "nomination",
    recordId,
    assigneeId,
    expectedAssigneeId,
  });
  if (!assigned.ok) return { result: assigned.reason };
  revalidatePath(`/admin/records/nominations/${recordId}`);
  revalidatePath("/admin/records");
  revalidatePath("/admin");
  return { result: "saved" };
}

function idOrEmpty(value: FormDataEntryValue | null): string | null | "invalid" {
  const raw = String(value ?? "");
  if (!raw) return null;
  return isUserId(raw) ? raw : "invalid";
}
