import type { ContactStatus, MessageId, NoteId } from "@/lib/contact/model";
import type { NominationStatus, PartnerStatus } from "@/lib/desk/case";
import { adminEvents, type Tx } from "@/lib/db";
import type { Recommendation } from "@/lib/review/rubric";
import type { UserRole } from "@/lib/staff/roles";

export type AdminEvent =
  | { readonly kind: "staff.bootstrap"; readonly subject: string; readonly email: string }
  | { readonly kind: "staff.invited"; readonly subject: string; readonly email: string; readonly role: UserRole }
  | { readonly kind: "staff.role"; readonly subject: string; readonly email: string; readonly from: string; readonly to: UserRole }
  | { readonly kind: "staff.disabled"; readonly subject: string; readonly email: string }
  | { readonly kind: "staff.enabled"; readonly subject: string; readonly email: string }
  | { readonly kind: "records.exported"; readonly list: string; readonly rows: number; readonly filters: Readonly<Record<string, string>> }
  | { readonly kind: "review.saved"; readonly applicantId: string; readonly reviewCycle: number; readonly recommendation: Recommendation | null; readonly criteria: readonly string[]; readonly noteId: string | null }
  | { readonly kind: "review.assigned"; readonly subject: string | null; readonly applicantId: string; readonly assigneeId: string | null; readonly previousAssigneeId: string | null }
  | { readonly kind: "decision.confirmed"; readonly applicantId: string; readonly from: string; readonly to: string; readonly decisionId: string; readonly version: number }
  | { readonly kind: "nomination.noted"; readonly nominationId: string; readonly noteId: string }
  | { readonly kind: "nomination.status"; readonly nominationId: string; readonly from: NominationStatus; readonly to: NominationStatus }
  | { readonly kind: "nomination.assigned"; readonly subject: string | null; readonly nominationId: string; readonly assigneeId: string | null; readonly previousAssigneeId: string | null }
  | { readonly kind: "partner.noted"; readonly partnerId: string; readonly noteId: string }
  | { readonly kind: "partner.status"; readonly partnerId: string; readonly from: PartnerStatus; readonly to: PartnerStatus }
  | { readonly kind: "partner.assigned"; readonly subject: string | null; readonly partnerId: string; readonly assigneeId: string | null; readonly previousAssigneeId: string | null }
  | { readonly kind: "contact.noted"; readonly messageId: MessageId; readonly noteId: NoteId }
  | { readonly kind: "contact.status"; readonly messageId: MessageId; readonly from: ContactStatus; readonly to: ContactStatus }
  | {
      readonly kind: "contact.assigned";
      readonly subject: string | null;
      readonly messageId: MessageId;
      readonly assigneeId: string | null;
      readonly previousAssigneeId: string | null;
    }
  | { readonly kind: "answer.media_opened"; readonly applicantId: string; readonly questionId: string }
  | { readonly kind: "identity.document_opened"; readonly applicantId: string; readonly documentId: string }
  | { readonly kind: "identity.document_downloaded"; readonly applicantId: string; readonly documentId: string; readonly operator: string };

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
  if ("applicantId" in event) detail.applicantId = event.applicantId;
  if ("questionId" in event) detail.questionId = event.questionId;
  if ("documentId" in event) detail.documentId = event.documentId;
  if ("operator" in event) detail.operator = event.operator;
  if ("nominationId" in event) detail.nominationId = event.nominationId;
  if ("partnerId" in event) detail.partnerId = event.partnerId;
  if ("messageId" in event) detail.messageId = event.messageId;
  if ("reviewCycle" in event) detail.reviewCycle = event.reviewCycle;
  if ("recommendation" in event) detail.recommendation = event.recommendation;
  if ("criteria" in event) detail.criteria = [...event.criteria];
  if ("noteId" in event) detail.noteId = event.noteId;
  if ("assigneeId" in event) detail.assigneeId = event.assigneeId;
  if ("previousAssigneeId" in event) detail.previousAssigneeId = event.previousAssigneeId;
  if ("decisionId" in event) detail.decisionId = event.decisionId;
  if ("version" in event) detail.version = event.version;
  await tx.insert(adminEvents).values({ actorId, subjectId, kind, detail });
}
