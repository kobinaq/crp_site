"use server";

import { redirect } from "next/navigation";
import { entryRef, markReviewed, problemsFor, publishCopy, saveDraft, type PublishFrom, type ReviewCell } from "@/lib/copy/editor";
import { getDb } from "@/lib/db";
import { assertStaffAction } from "@/lib/staff/gate";
import { can } from "@/lib/staff/roles";

function back(formData: FormData, error?: string): never {
  const params = new URLSearchParams();
  const catalog = String(formData.get("catalog") ?? "page");
  const key = String(formData.get("key") ?? "");
  if (catalog) params.set("catalog", catalog);
  if (String(formData.get("all") ?? "") === "1") params.set("all", "1");
  if (key) params.set("key", key);
  const query = String(formData.get("q") ?? "");
  if (query) params.set("q", query);
  if (String(formData.get("review") ?? "") === "1") params.set("review", "1");
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
  if (!ref) back(formData, "invalid");
  const intent = String(formData.get("intent") ?? "");
  const base = Number(formData.get("base") ?? "0");
  const db = getDb();
  const publishIntent = intent === "publish" || intent === "reset" || intent === "mark" || intent === "restore";
  if (publishIntent && !can(staff.role, "copy.publish")) back(formData, "forbidden");
  if (intent === "draft" || intent === "publish") {
    const value = String(formData.get("value") ?? "");
    const problems = problemsFor(ref, value);
    if (problems.length > 0) back(formData, problems[0]?.kind ?? "invalid");
    const saved = await saveDraft(db, ref, staff.id, value);
    if (!saved.ok) back(formData, saved.reason);
    if (intent === "draft") back(formData);
  }
  const from: PublishFrom | null =
    intent === "publish" ? { kind: "draft" }
    : intent === "reset" ? { kind: "reset" }
    : intent === "mark" ? { kind: "mark-current", digest: String(formData.get("digest") ?? "") }
    : intent === "restore" ? { kind: "revision", revision: Number(formData.get("revision") ?? "0") }
    : null;
  if (!from || (from.kind === "revision" && !Number.isInteger(from.revision))) back(formData, "invalid");
  const published = await publishCopy(db, ref, staff.id, from, Number.isInteger(base) ? base : 0);
  back(formData, published.ok ? undefined : published.reason);
}

export async function markReviewedCopy(formData: FormData) {
  const staff = await assertStaffAction("copy.publish");
  if (!staff) redirect("/admin/sign-in");
  const catalogs = formData.getAll("cellCatalog").map(String);
  const locales = formData.getAll("cellLocale").map(String);
  const keys = formData.getAll("cellKey").map(String);
  const bases = formData.getAll("cellBase").map(String);
  const digests = formData.getAll("cellDigest").map(String);
  const sameLength = catalogs.length === locales.length && locales.length === keys.length && keys.length === bases.length && bases.length === digests.length;
  if (!sameLength) back(formData, "invalid");
  const cells: ReviewCell[] = catalogs.map((catalog, index) => ({
    catalog,
    locale: locales[index] ?? "",
    key: keys[index] ?? "",
    revision: Number(bases[index] ?? "0"),
    digest: digests[index] ?? "",
  }));
  const result = await markReviewed(getDb(), staff.id, cells);
  back(formData, result.ok ? undefined : result.reason === "invalid" && cells.length > 100 ? "too-many" : result.reason);
}
