import type { Status } from "@/lib/lifecycle";

export const NEEDS_DECISION_STATUSES = ["under_review", "accepted"] as const;
export type QueueName = "mine" | "unassigned" | "needs";

export function needsDecision(status: Status): boolean {
  for (const item of NEEDS_DECISION_STATUSES) if (item === status) return true;
  return false;
}

export function parseQueue(value: string): "" | QueueName {
  if (value === "mine" || value === "unassigned" || value === "needs") return value;
  return "";
}
