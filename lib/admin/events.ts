import { adminEvents, type Tx } from "@/lib/db";
import type { UserRole } from "@/lib/staff/roles";

export type AdminEvent =
  | { readonly kind: "staff.bootstrap"; readonly subject: string; readonly email: string }
  | { readonly kind: "staff.invited"; readonly subject: string; readonly email: string; readonly role: UserRole }
  | { readonly kind: "staff.role"; readonly subject: string; readonly email: string; readonly from: string; readonly to: UserRole }
  | { readonly kind: "staff.disabled"; readonly subject: string; readonly email: string }
  | { readonly kind: "staff.enabled"; readonly subject: string; readonly email: string }
  | { readonly kind: "records.exported"; readonly list: string; readonly rows: number; readonly filters: Readonly<Record<string, string>> };

export async function recordEvent(tx: Tx, actorId: string | null, event: AdminEvent): Promise<void> {
  const subjectId = "subject" in event ? event.subject : null;
  const { kind } = event;
  const detail: Record<string, unknown> = {};
  if ("email" in event) detail.email = event.email;
  if ("role" in event) detail.role = event.role;
  if ("from" in event) detail.from = event.from;
  if ("to" in event) detail.to = event.to;
  if (event.kind === "records.exported") {
    detail.list = event.list;
    detail.rows = event.rows;
    detail.filters = event.filters;
  }
  await tx.insert(adminEvents).values({ actorId, subjectId, kind, detail });
}
