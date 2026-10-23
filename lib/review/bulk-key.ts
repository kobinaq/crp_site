import type { ConfirmMove } from "@/lib/sync";

// The bulk queue mints one decision id per row, version, and move. Confirming
// the same choice twice replays the first result instead of mailing twice, and
// a different choice on the same page (a correction) gets a fresh id instead of
// colliding with the earlier receipt.
export function bulkDecisionKey(applicantId: string, version: number, reviewCycle: number, move: ConfirmMove): string {
  return `${applicantId}:${version}:${reviewCycle}:${move.field}:${move.value}:${move.to}`;
}
