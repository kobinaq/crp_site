import { randomUUID } from "crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicantReviewView } from "@/components/admin/ApplicantReviewView";
import { loadApplicant, loadReviewers, parseRecordQuery } from "@/lib/admin/records";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { can } from "@/lib/staff/roles";
import { parseUserId } from "@/lib/staff/users";

export const metadata: Metadata = { title: "Applicant" };

export default async function ApplicantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff("applicants.read");
  const { id } = await params;
  const listQuery = { ...parseRecordQuery(flat(await searchParams)), list: "applicants" as const };
  const parsed = parseUserId(id);
  if (!parsed) notFound();
  const db = getDb();
  const review = await loadApplicant(db, parsed, staff, listQuery);
  if (!review) notFound();
  const reviewers = can(staff.role, "reviews.assign") ? await loadReviewers(db) : [];
  return (
    <ApplicantReviewView
      review={review}
      listQuery={listQuery}
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

function flat(query: Record<string, string | string[] | undefined>): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) raw[key] = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return raw;
}
