import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { ApplicantReviewView } from "@/components/admin/ApplicantReviewView";
import { loadApplicant, loadReviewers } from "@/lib/admin/records";
import { getDb } from "@/lib/db";
import { parseQueue } from "@/lib/review/queue";
import { requireStaff } from "@/lib/staff/gate";
import { can } from "@/lib/staff/roles";
import { parseUserId } from "@/lib/staff/users";

export default async function ApplicantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff("dashboard.read");
  const { id } = await params;
  const query = await searchParams;
  const rawQueue = Array.isArray(query.queue) ? query.queue[0] : query.queue;
  const queue = parseQueue(rawQueue ?? "");
  const parsed = parseUserId(id);
  if (!parsed) notFound();
  const db = getDb();
  const review = await loadApplicant(db, parsed, staff, queue);
  if (!review) notFound();
  const reviewers = can(staff.role, "reviews.assign") ? await loadReviewers(db) : [];
  return (
    <ApplicantReviewView
      review={review}
      queue={queue}
      canWrite={can(staff.role, "reviews.write")}
      canAssign={can(staff.role, "reviews.assign")}
      canConfirm={can(staff.role, "decisions.confirm")}
      reviewers={reviewers}
      viewerId={staff.id}
      noteId={randomUUID()}
      decisionId={randomUUID()}
    />
  );
}
