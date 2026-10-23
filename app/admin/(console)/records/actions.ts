"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { STATUSES } from "@/lib/lifecycle";
import { confirmBulk, previewBulk, type BulkPreview } from "@/lib/review/decide";
import { assertStaffAction } from "@/lib/staff/gate";

const moveSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("reviewDecision"), value: z.enum(["accept", "reject"]), to: z.enum(STATUSES) }),
  z.object({ field: z.literal("interviewOutcome"), value: z.enum(["yes", "no"]), to: z.enum(STATUSES) }),
]);

const seenRow = z.object({
  applicantId: z.uuid(),
  version: z.number().int().nonnegative(),
  reviewCycle: z.number().int().nonnegative(),
});

export async function previewBulkAction(input: unknown): Promise<
  | { readonly result: "forbidden" | "invalid" }
  | { readonly result: "ready"; readonly preview: BulkPreview }
> {
  const decider = await assertStaffAction("decisions.confirm");
  if (!decider) return { result: "forbidden" };
  const parsed = z.object({ move: moveSchema, rows: z.array(seenRow) }).safeParse(input);
  if (!parsed.success) return { result: "invalid" };
  const preview = await previewBulk(getDb(), decider, parsed.data);
  if ("ok" in preview) return { result: "invalid" };
  return { result: "ready", preview };
}

export async function confirmBulkAction(input: unknown): Promise<
  | { readonly result: "forbidden" | "invalid" }
  | { readonly result: "done"; readonly rows: { readonly applicantId: string; readonly result: string }[] }
> {
  const decider = await assertStaffAction("decisions.confirm");
  if (!decider) return { result: "forbidden" };
  const parsed = z.object({
    move: moveSchema,
    rows: z.array(seenRow.extend({ decisionId: z.uuid() })),
  }).safeParse(input);
  if (!parsed.success) return { result: "invalid" };
  const confirmed = await confirmBulk(getDb(), decider, parsed.data);
  if ("ok" in confirmed) return { result: "invalid" };
  revalidatePath("/admin/records");
  return { result: "done", rows: confirmed.rows.map((row) => ({ applicantId: row.applicantId, result: row.result })) };
}
