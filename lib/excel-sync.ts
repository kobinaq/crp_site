import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { applyDecision, decisionHash } from "@/lib/decisions";
import { decisionReceipts, excelCursors, excelSyncState, getDb, type Db } from "@/lib/db";
import {
  APPLICANT_SYSTEM,
  EXCEL_TABLES,
  blankTeamColumns,
  mergeRow,
  padRow,
  readApplicantDecision,
  reviewCycleChanged,
  type Cell,
} from "@/lib/excel-rows";
import { decisionRow } from "@/lib/sync";
import { pageChanges, type SyncTable } from "@/lib/sync-log";

const DECISION_LIMIT = 200;
const PAGE_SIZE = 100;
const LOCK_MS = 4 * 60 * 1000;
const TABLES: SyncTable[] = ["applicants", "waitlist", "interest", "nominations", "partners"];

// Test records (QA uses addresses like crp-qa+crptest1@...) never reach the
// review workbook. SYNC_EXCLUDE_EMAIL_PATTERN is a comma-separated list of
// case-insensitive substrings matched against every email on the row; it
// defaults to "+crptest", and an explicit empty value turns exclusion off.
// Skipped changes still advance the cursor, so they are never retried.
const EMAIL_FIELDS = ["email", "nominatorEmail", "nomineeEmail"];

export function syncExcludePatterns(): string[] {
  const raw = process.env.SYNC_EXCLUDE_EMAIL_PATTERN ?? "+crptest";
  return raw.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
}

export function excludedFromSync(payload: Record<string, unknown>, patterns = syncExcludePatterns()): boolean {
  if (!patterns.length) return false;
  return EMAIL_FIELDS.some((field) => {
    const value = payload[field];
    return typeof value === "string" && patterns.some((pattern) => value.toLowerCase().includes(pattern));
  });
}

export type TableSnapshot = {
  headers: string[];
  rows: { index: number; values: Cell[] }[];
};

export type ReviewWorkbook = {
  readTable(name: string): Promise<TableSnapshot>;
  writeRow(name: string, index: number, values: Cell[]): Promise<void>;
  addRow(name: string, values: Cell[]): Promise<void>;
};

export type ExcelTickResult =
  | { ok: true; skipped: true; reason: "locked" }
  | {
      ok: true;
      skipped: false;
      pushed: { attempted: number; invalid: number; outcomes: { applicantId: string; result: string }[] };
      pulled: { table: SyncTable; count: number; cursor: string; hasMore: boolean }[];
    };

async function tryLock(db: Db): Promise<boolean> {
  await db.insert(excelSyncState).values({ singleton: true }).onConflictDoNothing();
  const [row] = await db
    .update(excelSyncState)
    .set({ lockedUntil: new Date(Date.now() + LOCK_MS) })
    .where(and(
      eq(excelSyncState.singleton, true),
      or(isNull(excelSyncState.lockedUntil), lte(excelSyncState.lockedUntil, new Date())),
    ))
    .returning({ singleton: excelSyncState.singleton });
  return Boolean(row);
}

async function finish(db: Db, error: string | null): Promise<void> {
  await db
    .update(excelSyncState)
    .set({ lockedUntil: null, lastError: error, lastRunAt: new Date() })
    .where(eq(excelSyncState.singleton, true));
}

async function cursorFor(db: Db, table: SyncTable): Promise<bigint> {
  const [row] = await db.select().from(excelCursors).where(eq(excelCursors.tableName, table));
  return row?.cursor ?? BigInt(0);
}

async function saveCursor(db: Db, table: SyncTable, cursor: bigint): Promise<void> {
  await db
    .insert(excelCursors)
    .values({ tableName: table, cursor })
    .onConflictDoUpdate({ target: excelCursors.tableName, set: { cursor } });
}

async function pushDecisions(db: Db, workbook: ReviewWorkbook) {
  const sheet = await workbook.readTable(EXCEL_TABLES.applicants);
  const decisionAt = sheet.headers.indexOf("decisionId");
  if (sheet.headers.indexOf("id") < 0 || decisionAt < 0) {
    throw new Error("Applicants table is missing id or decisionId");
  }

  const pending = [];
  for (const row of sheet.rows) {
    const input = readApplicantDecision(sheet.headers, row.values);
    if (input) pending.push({ index: row.index, values: row.values, input });
  }

  const outcomes: { applicantId: string; result: string }[] = [];
  let invalid = 0;
  const [state] = await db.select().from(excelSyncState).where(eq(excelSyncState.singleton, true));
  const offset = pending.length ? (state?.decisionOffset ?? 0) % pending.length : 0;
  const batch = [...pending.slice(offset), ...pending.slice(0, offset)].slice(0, DECISION_LIMIT);
  const ids = batch.map((row) => row.input.decisionId).filter((id): id is string => typeof id === "string");
  const receipts = ids.length ? await db.select().from(decisionReceipts).where(inArray(decisionReceipts.id, ids)) : [];
  const byId = new Map(receipts.map((receipt) => [receipt.id, receipt]));
  for (const row of batch) {
    let decisionId = typeof row.input.decisionId === "string" ? row.input.decisionId : "";
    let generated = !decisionId;
    if (generated) decisionId = randomUUID();
    const parsed = decisionRow.safeParse({ ...row.input, decisionId });
    if (!parsed.success) {
      invalid += 1;
      continue;
    }
    const receipt = byId.get(decisionId);
    if (receipt && (receipt.applicantId !== parsed.data.applicantId || receipt.requestHash !== decisionHash(parsed.data))) {
      decisionId = randomUUID();
      parsed.data.decisionId = decisionId;
      generated = true;
    }
    if (generated) {
      const next = padRow(row.values, sheet.headers.length);
      next[decisionAt] = decisionId;
      await workbook.writeRow(EXCEL_TABLES.applicants, row.index, next);
    }
    const outcome = await applyDecision(db, parsed.data, { via: "sheet" });
    outcomes.push({ applicantId: outcome.applicantId, result: outcome.result });
  }
  await db.update(excelSyncState).set({ decisionOffset: pending.length ? (offset + batch.length) % pending.length : 0 })
    .where(eq(excelSyncState.singleton, true));
  return { attempted: outcomes.length, invalid, outcomes };
}

async function pullTable(db: Db, workbook: ReviewWorkbook, table: SyncTable) {
  const excelName = EXCEL_TABLES[table];
  const sheet = await workbook.readTable(excelName);
  const idAt = sheet.headers.indexOf("id");
  if (idAt < 0) throw new Error(`${excelName} table is missing id`);

  const after = await cursorFor(db, table);
  const page = await pageChanges(db, table, after, PAGE_SIZE);
  const byId = new Map<string, number>();
  for (const row of sheet.rows) {
    const id = String(row.values[idAt] ?? "").trim();
    if (id) byId.set(id, row.index);
  }

  const writable = table === "applicants" ? APPLICANT_SYSTEM : null;
  const patterns = syncExcludePatterns();
  let count = 0;
  for (const change of page.rows) {
    const payload = change.payload as Record<string, unknown>;
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id || excludedFromSync(payload, patterns)) continue;
    const existingIndex = byId.get(id);
    const existing = existingIndex === undefined ? null : sheet.rows.find((row) => row.index === existingIndex)?.values ?? null;
    let values = mergeRow(sheet.headers, existing, payload, writable);
    if (table === "applicants" && reviewCycleChanged(sheet.headers, existing, payload)) {
      values = blankTeamColumns(sheet.headers, values);
    }
    if (existingIndex === undefined) {
      const index = sheet.rows.length;
      await workbook.addRow(excelName, values);
      sheet.rows.push({ index, values });
      byId.set(id, index);
    } else {
      await workbook.writeRow(excelName, existingIndex, values);
      const row = sheet.rows.find((item) => item.index === existingIndex);
      if (row) row.values = values;
    }
    count += 1;
  }
  await saveCursor(db, table, page.cursor);
  return { table, count, cursor: page.cursor.toString(), hasMore: page.hasMore };
}

// Push first so this same tick can write the new version and status back onto
// the cream columns. The lock is released on the way out, including failures.
export async function tickExcel(db: Db, workbook: ReviewWorkbook): Promise<ExcelTickResult> {
  if (!(await tryLock(db))) return { ok: true, skipped: true, reason: "locked" };
  try {
    const pushed = await pushDecisions(db, workbook);
    const pulled = [];
    for (const table of TABLES) pulled.push(await pullTable(db, workbook, table));
    await finish(db, null);
    return { ok: true, skipped: false, pushed, pulled };
  } catch (err) {
    const message = err instanceof Error ? err.message : "excel sync failed";
    await finish(db, message);
    throw err;
  }
}

export async function tickExcelFromEnv(workbook: ReviewWorkbook): Promise<ExcelTickResult> {
  return tickExcel(getDb(), workbook);
}
