"use server";

import { redirect } from "next/navigation";
import { changeStaff, inviteStaff, type ChangeOutcome, type InviteOutcome } from "@/lib/staff/manage";
import { getDb } from "@/lib/db";
import { assertStaffAction } from "@/lib/staff/gate";
import { isUserRole } from "@/lib/staff/roles";
import { parseEmail, parseUserId } from "@/lib/staff/users";

export type InviteState = { readonly notice: string; readonly devLink?: string } | null;

function noticeFor(result: InviteOutcome): InviteState {
  if (result.kind === "refused") return { notice: result.reason };
  if (result.mail.kind === "failed") return { notice: "mail-failed" };
  const devLink = result.mail.kind === "skipped" ? result.mail.devLink ?? undefined : undefined;
  return { notice: result.kind, devLink };
}

export async function inviteAction(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const staff = await assertStaffAction("users.manage");
  if (!staff) return { notice: "forbidden" };
  const email = parseEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "");
  if (!email || !isUserRole(role)) return { notice: "invalid" };
  return noticeFor(await inviteStaff(getDb(), staff, { email, role }));
}

export async function changeStaffAction(formData: FormData) {
  const staff = await assertStaffAction("users.manage");
  if (!staff) redirect("/admin/staff?notice=forbidden");
  const target = parseUserId(String(formData.get("id") ?? ""));
  const intent = String(formData.get("intent") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!target) redirect("/admin/staff?notice=missing");
  const change = intent === "disable"
    ? { kind: "disable" as const }
    : intent === "enable"
      ? { kind: "enable" as const }
      : intent === "role" && isUserRole(role)
        ? { kind: "role" as const, role }
        : null;
  if (!change) redirect("/admin/staff?notice=invalid");
  const result: ChangeOutcome = await changeStaff(getDb(), staff, target, change);
  if (!result.ok) redirect(`/admin/staff?notice=${result.reason}`);
  redirect("/admin/staff?notice=saved");
}
