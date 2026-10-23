import { count, desc, sql } from "drizzle-orm";
import { countNewMessages } from "@/lib/contact/messages";
import {
  applicants,
  interest,
  nominations,
  nominationStatus,
  partnerInquiries,
  waitlist,
  waitlistStatus,
  type Db,
} from "@/lib/db";
import { deskColumns, loadDeskSummary, type DeskSummary } from "@/lib/desk/case";
import type { Status } from "@/lib/lifecycle";

// Lifecycle order, including statuses the transition map does not currently reach.
export const PIPELINE_ORDER = [
  "submitted",
  "round1_complete",
  "id_verified",
  "id_failed",
  "under_review",
  "accepted",
  "interview_yes",
  "interview_no",
  "docs_submitted",
  "onboarding",
  "online",
  "online_offered",
  "rejected",
  "ineligible",
] as const satisfies readonly Status[];

export const STATUS_LABEL: Record<Status, string> = {
  submitted: "Submitted",
  round1_complete: "VideoAsk done",
  id_verified: "Identity verified",
  id_failed: "Identity check failed",
  under_review: "Under review",
  accepted: "Accepted",
  interview_yes: "Passed interview",
  interview_no: "Did not pass interview",
  docs_submitted: "Documents submitted",
  onboarding: "Onboarding",
  online: "Online participant",
  online_offered: "Offered online place",
  rejected: "Rejected",
  ineligible: "Not eligible",
};

const RECENT = 20;

export type Dashboard = {
  pipeline: readonly { status: Status; label: string; count: number }[];
  applicantTotal: number;
  cycles: readonly { cycle: number; count: number }[];
  nominations: { counts: readonly { status: string; count: number }[]; recent: readonly { id: string; createdAt: Date; nominatorName: string; nomineeName: string; status: string }[] };
  waitlist: { counts: readonly { status: string; count: number }[]; recent: readonly { id: string; createdAt: Date; name: string | null; email: string; status: string }[] };
  interest: { total: number; recent: readonly { id: string; createdAt: Date; name: string | null; email: string; ageGroup: string; track: string | null }[] };
  partners: { total: number; recent: readonly { id: string; createdAt: Date; name: string; email: string; organization: string; support: string }[] };
  nominationDesk: DeskSummary;
  partnerWorkflow: DeskSummary;
  newMessages: number;
};

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function fill(keys: readonly string[], rows: readonly { key: string; count: unknown }[]): { status: string; count: number }[] {
  const found = new Map(rows.map((row) => [row.key, num(row.count)]));
  return keys.map((key) => ({ status: key, count: found.get(key) ?? 0 }));
}

export async function loadDashboard(db: Db): Promise<Dashboard> {
  return db.transaction(async (tx) => {
    const statusRows = await tx.select({ key: applicants.status, count: count() }).from(applicants).groupBy(applicants.status);
    const cycleRows = await tx
      .select({ cycle: applicants.reviewCycle, count: count() })
      .from(applicants)
      .groupBy(applicants.reviewCycle)
      .orderBy(applicants.reviewCycle);
    const nominationCounts = await tx.select({ key: nominations.status, count: count() }).from(nominations).groupBy(nominations.status);
    const waitlistCounts = await tx.select({ key: waitlist.status, count: count() }).from(waitlist).groupBy(waitlist.status);
    const [interestTotal] = await tx.select({ count: count() }).from(interest);
    const [partnerTotal] = await tx.select({ count: count() }).from(partnerInquiries);
    const nominationDesk = await loadDeskSummary(tx, "nomination");
    const partnerWorkflow = await loadDeskSummary(tx, "partner");
    const newMessages = await countNewMessages(tx);
    const recentNominations = await tx
      .select({
        id: nominations.id,
        createdAt: nominations.createdAt,
        nominatorName: nominations.nominatorName,
        nomineeName: nominations.nomineeName,
        status: deskColumns("nomination", sql`${nominations.id}`).label,
      })
      .from(nominations)
      .orderBy(desc(nominations.createdAt))
      .limit(RECENT);
    const recentWaitlist = await tx
      .select({ id: waitlist.id, createdAt: waitlist.createdAt, name: waitlist.name, email: waitlist.email, status: waitlist.status })
      .from(waitlist)
      .orderBy(desc(waitlist.createdAt))
      .limit(RECENT);
    const recentInterest = await tx
      .select({
        id: interest.id,
        createdAt: interest.createdAt,
        name: interest.name,
        email: interest.email,
        ageGroup: interest.ageGroup,
        track: interest.track,
      })
      .from(interest)
      .orderBy(desc(interest.createdAt))
      .limit(RECENT);
    const recentPartners = await tx
      .select({
        id: partnerInquiries.id,
        createdAt: partnerInquiries.createdAt,
        name: partnerInquiries.name,
        email: partnerInquiries.email,
        organization: partnerInquiries.organization,
        support: partnerInquiries.support,
      })
      .from(partnerInquiries)
      .orderBy(desc(partnerInquiries.createdAt))
      .limit(RECENT);
    const pipeline = PIPELINE_ORDER.map((status) => ({
      status,
      label: STATUS_LABEL[status],
      count: num(statusRows.find((row) => row.key === status)?.count),
    }));
    return {
      pipeline,
      applicantTotal: pipeline.reduce((sum, row) => sum + row.count, 0),
      cycles: cycleRows.map((row) => ({ cycle: row.cycle, count: num(row.count) })),
      nominations: { counts: fill(nominationStatus.enumValues, nominationCounts), recent: recentNominations },
      waitlist: { counts: fill(waitlistStatus.enumValues, waitlistCounts), recent: recentWaitlist },
      interest: { total: num(interestTotal?.count), recent: recentInterest },
      partners: { total: num(partnerTotal?.count), recent: recentPartners },
      nominationDesk,
      partnerWorkflow,
      newMessages,
    };
  });
}
