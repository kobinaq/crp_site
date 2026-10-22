import { notFound } from "next/navigation";
import { ApplicantReviewView } from "@/components/admin/ApplicantReviewView";
import { loadApplicant } from "@/lib/admin/records";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { parseUserId } from "@/lib/staff/users";

export default async function ApplicantPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("dashboard.read");
  const { id } = await params;
  const parsed = parseUserId(id);
  if (!parsed) notFound();
  const review = await loadApplicant(getDb(), parsed);
  if (!review) notFound();
  return <ApplicantReviewView review={review} />;
}
