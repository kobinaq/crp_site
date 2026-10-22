"use server";

import { redirect } from "next/navigation";
import { entryRef, problemsFor, publishCopy, saveDraft, type PublishFrom } from "@/lib/copy/editor";
import { getDb } from "@/lib/db";
import { assertStaffAction } from "@/lib/staff/gate";
import { can } from "@/lib/staff/roles";

function back(catalog: string, key: string, error?: string): never {
  const params = new URLSearchParams({ catalog, key });
  if (error) params.set("error", error);
  redirect(`/admin/copy?${params.toString()}`);
}

export async function updateCopy(formData: FormData) {
  const staff = await assertStaffAction("copy.edit");
  const catalog = String(formData.get("catalog") ?? "");
  const key = String(formData.get("key") ?? "");
  if (!staff) redirect("/admin/sign-in");
  const locale = String(formData.get("locale") ?? "");
  const ref = entryRef(catalog, locale, key);
  if (!ref) back(catalog || "page", key, "invalid");
  const intent = String(formData.get("intent") ?? "");
  const base = Number(formData.get("base") ?? "0");
  const db = getDb();
  const publishIntent = intent === "publish" || intent === "reset" || intent === "mark" || intent === "restore";
  if (publishIntent && !can(staff.role, "copy.publish")) back(catalog, key, "forbidden");
  if (intent === "draft" || intent === "publish") {
    const value = String(formData.get("value") ?? "");
    const problems = problemsFor(ref, value);
    if (problems.length > 0) back(catalog, key, problems[0]?.kind ?? "invalid");
    const saved = await saveDraft(db, ref, staff.id, value);
    if (!saved.ok) back(catalog, key, saved.reason);
    if (intent === "draft") back(catalog, key);
  }
  const from: PublishFrom | null =
    intent === "publish" ? { kind: "draft" }
    : intent === "reset" ? { kind: "reset" }
    : intent === "mark" ? { kind: "mark-current" }
    : intent === "restore" ? { kind: "revision", revision: Number(formData.get("revision") ?? "0") }
    : null;
  if (!from || (from.kind === "revision" && !Number.isInteger(from.revision))) back(catalog, key, "invalid");
  const published = await publishCopy(db, ref, staff.id, from, Number.isInteger(base) ? base : 0);
  back(catalog, key, published.ok ? undefined : published.reason);
}
