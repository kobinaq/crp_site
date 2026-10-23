import { createHash } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { copyDrafts, copyRevisions, users, type Db, type Store } from "@/lib/db";
import {
  bundledValue,
  CATALOGS,
  checkValue,
  leafOf,
  leaves,
  normalizeValue,
  parseCopyRef,
  translationState,
  type CatalogId,
  type CopyProblem,
  type CopyRef,
  type TranslationState,
} from "@/lib/copy/catalog";
import { expireCopy } from "@/lib/copy/read";
import { copyLabel, sectionLabel } from "@/lib/copy/labels";

export type PublishFrom =
  | { kind: "draft" }
  | { kind: "revision"; revision: number }
  | { kind: "reset" }
  | { kind: "mark-current"; digest: string };

export type EditorFailure = { ok: false; reason: "invalid" | "missing" | "conflict"; problems?: readonly CopyProblem[] };
export type EditorSuccess = { ok: true; unchanged?: boolean };
export type EditorResult = EditorSuccess | EditorFailure;

export type Head = {
  revision: number;
  value: string | null;
  translatedFrom: string | null;
  createdAt: Date;
  authorId: string | null;
  authorEmail: string | null;
  revertedFrom: number | null;
};

export type LocaleCell = {
  locale: string;
  revision: number;
  value: string;
  draft: string | null;
  override: boolean;
  state: TranslationState;
};

export type CopyRow = {
  catalog: CatalogId;
  key: string;
  label: string;
  section: string;
  sectionLabel: string;
  english: string;
  digest: string;
  cells: readonly LocaleCell[];
};

export const REVIEW_CAP = 100;

export function englishDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && (current as { code?: unknown }).code === "23505") return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

async function headOf(db: Store, ref: CopyRef): Promise<Head | null> {
  const [row] = await db
    .select({
      revision: copyRevisions.revision,
      value: copyRevisions.value,
      translatedFrom: copyRevisions.translatedFrom,
      createdAt: copyRevisions.createdAt,
      authorId: copyRevisions.authorId,
      authorEmail: users.email,
      revertedFrom: copyRevisions.revertedFrom,
    })
    .from(copyRevisions)
    .leftJoin(users, eq(users.id, copyRevisions.authorId))
    .where(and(eq(copyRevisions.catalog, ref.catalog), eq(copyRevisions.locale, ref.locale), eq(copyRevisions.key, ref.key)))
    .orderBy(desc(copyRevisions.revision))
    .limit(1);
  return row ?? null;
}

async function englishNow(db: Store, ref: CopyRef): Promise<string> {
  const english = parseCopyRef({ catalog: ref.catalog, locale: "en", key: ref.key });
  if (!english) return "";
  const head = await headOf(db, english);
  return head?.value ?? bundledValue(english);
}

export async function saveDraft(db: Db, ref: CopyRef, authorId: string, raw: string): Promise<EditorResult> {
  const value = normalizeValue(raw);
  const problems = checkValue(ref, value);
  if (problems.length > 0) return { ok: false, reason: "invalid", problems };
  const translatedFrom = ref.locale === "en" ? null : await englishNow(db, ref);
  await db
    .insert(copyDrafts)
    .values({ catalog: ref.catalog, locale: ref.locale, key: ref.key, authorId, value, translatedFrom })
    .onConflictDoUpdate({
      target: [copyDrafts.catalog, copyDrafts.locale, copyDrafts.key, copyDrafts.authorId],
      set: { value, translatedFrom, updatedAt: new Date() },
    });
  return { ok: true };
}

export async function discardDraft(db: Store, ref: CopyRef, authorId: string): Promise<void> {
  await db
    .delete(copyDrafts)
    .where(and(eq(copyDrafts.catalog, ref.catalog), eq(copyDrafts.locale, ref.locale), eq(copyDrafts.key, ref.key), eq(copyDrafts.authorId, authorId)));
}

export async function publishCopy(
  db: Db,
  ref: CopyRef,
  authorId: string,
  from: PublishFrom,
  expectedRevision: number,
): Promise<EditorResult> {
  try {
    const result = await db.transaction(async (tx) => {
      const head = await headOf(tx, ref);
      const current = head?.revision ?? 0;
      if (current !== expectedRevision) return { ok: false, reason: "conflict" } as const;
      const next = await nextValue(tx, ref, authorId, from, head);
      if (!next.ok) return next;
      const revision = current + 1;
      await tx.insert(copyRevisions).values({
        catalog: ref.catalog,
        locale: ref.locale,
        key: ref.key,
        revision,
        value: next.value,
        translatedFrom: next.translatedFrom,
        revertedFrom: from.kind === "revision" ? from.revision : null,
        authorId,
      });
      if (from.kind === "draft") await discardDraft(tx, ref, authorId);
      return { ok: true } as const;
    });
    if (result.ok) expireCopy();
    return result;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return { ok: false, reason: "conflict" };
  }
}

async function nextValue(
  db: Store,
  ref: CopyRef,
  authorId: string,
  from: PublishFrom,
  head: Head | null,
): Promise<{ ok: true; value: string | null; translatedFrom: string | null } | EditorFailure> {
  if (from.kind === "reset") return { ok: true, value: null, translatedFrom: null };
  if (from.kind === "mark-current") {
    const english = await englishNow(db, ref);
    if (from.digest !== englishDigest(english)) return { ok: false, reason: "conflict" };
    return { ok: true, value: head?.value ?? null, translatedFrom: ref.locale === "en" ? null : english };
  }
  if (from.kind === "revision") {
    const [row] = await db
      .select({ value: copyRevisions.value, translatedFrom: copyRevisions.translatedFrom })
      .from(copyRevisions)
      .where(and(
        eq(copyRevisions.catalog, ref.catalog),
        eq(copyRevisions.locale, ref.locale),
        eq(copyRevisions.key, ref.key),
        eq(copyRevisions.revision, from.revision),
      ));
    if (!row) return { ok: false, reason: "missing" };
    if (row.value !== null && checkValue(ref, row.value).length > 0) return { ok: false, reason: "invalid" };
    return { ok: true, value: row.value, translatedFrom: row.translatedFrom };
  }
  const [draft] = await db
    .select({ value: copyDrafts.value })
    .from(copyDrafts)
    .where(and(eq(copyDrafts.catalog, ref.catalog), eq(copyDrafts.locale, ref.locale), eq(copyDrafts.key, ref.key), eq(copyDrafts.authorId, authorId)));
  if (!draft) return { ok: false, reason: "missing" };
  const problems = checkValue(ref, draft.value);
  if (problems.length > 0) return { ok: false, reason: "invalid", problems };
  return { ok: true, value: draft.value, translatedFrom: ref.locale === "en" ? null : await englishNow(db, ref) };
}

function catalogIds(): readonly CatalogId[] {
  return Object.keys(CATALOGS).filter((key): key is CatalogId => Object.hasOwn(CATALOGS, key));
}

export type DeskFilter = {
  readonly catalog: CatalogId | null;
  readonly query: string;
  readonly needsReview: boolean;
  readonly authorId: string;
};

// Search reads like the screen: plain label and section first, the key still works for anyone who has it.
export function matchesCopyQuery(row: CopyRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [row.label, row.sectionLabel, row.key, row.english, ...row.cells.flatMap((cell) => [cell.value, cell.draft ?? ""])].join("\n").toLowerCase();
  return haystack.includes(needle);
}

export async function loadDesk(db: Db, filter: DeskFilter): Promise<{ readonly rows: readonly CopyRow[]; readonly reviewCount: number }> {
  const catalogs = filter.catalog ? [filter.catalog] : catalogIds();
  const built: CopyRow[] = [];
  for (const catalog of catalogs) built.push(...await catalogRows(db, catalog, filter.authorId));
  const reviewCount = built.filter((row) => row.cells.some((cell) => cell.state.kind === "stale")).length;
  const needle = filter.query.trim().toLowerCase();
  const rows = built.filter((row) => {
    if (filter.needsReview && !row.cells.some((cell) => cell.state.kind === "stale")) return false;
    return matchesCopyQuery(row, needle);
  });
  return { rows, reviewCount };
}

async function catalogRows(db: Db, catalog: CatalogId, authorId: string): Promise<readonly CopyRow[]> {
  const heads = await db
    .select({
      locale: copyRevisions.locale,
      key: copyRevisions.key,
      revision: copyRevisions.revision,
      value: copyRevisions.value,
      translatedFrom: copyRevisions.translatedFrom,
    })
    .from(copyRevisions)
    .where(eq(copyRevisions.catalog, catalog))
    .orderBy(copyRevisions.locale, copyRevisions.key, desc(copyRevisions.revision));
  const latest = new Map<string, { revision: number; value: string | null; translatedFrom: string | null }>();
  for (const row of heads) {
    const id = `${row.locale}\0${row.key}`;
    if (!latest.has(id)) latest.set(id, row);
  }
  const drafts = await db
    .select({ locale: copyDrafts.locale, key: copyDrafts.key, value: copyDrafts.value })
    .from(copyDrafts)
    .where(and(eq(copyDrafts.catalog, catalog), eq(copyDrafts.authorId, authorId)));
  const draftMap = new Map(drafts.map((row) => [`${row.locale}\0${row.key}`, row.value]));
  const catalogLocales = CATALOGS[catalog].locales;
  return leaves(catalog).map((leaf) => {
    const english = latest.get(`en\0${leaf.key}`);
    const enOverride = english?.value ?? null;
    const englishRef = parseCopyRef({ catalog, locale: "en", key: leaf.key });
    const liveEnglish = enOverride ?? (englishRef ? bundledValue(englishRef) : leaf.english);
    const cells = catalogLocales.map((locale) => {
      const ref = parseCopyRef({ catalog, locale, key: leaf.key });
      const head = latest.get(`${locale}\0${leaf.key}`);
      const source: TranslationState = { kind: "source" };
      const state: TranslationState = ref
        ? translationState({
            ref,
            enOverride,
            live: head ? { value: head.value ?? "", translatedFrom: head.translatedFrom } : null,
          })
        : source;
      return {
        locale,
        revision: head?.revision ?? 0,
        value: head?.value ?? (ref ? bundledValue(ref) : leaf.english),
        draft: draftMap.get(`${locale}\0${leaf.key}`) ?? null,
        override: head?.value != null,
        state,
      };
    });
    return {
      catalog,
      key: leaf.key,
      label: copyLabel(catalog, leaf.key) ?? leaf.key,
      section: leaf.section,
      sectionLabel: sectionLabel(leaf.section),
      english: leaf.english,
      digest: englishDigest(liveEnglish),
      cells,
    };
  });
}

export type ReviewCell = {
  readonly catalog: string;
  readonly locale: string;
  readonly key: string;
  readonly revision: number;
  readonly digest: string;
};

export async function markReviewed(db: Db, authorId: string, cells: readonly ReviewCell[]): Promise<EditorResult> {
  if (cells.length === 0 || cells.length > REVIEW_CAP) return { ok: false, reason: "invalid" };
  for (const cell of cells) {
    const ref = parseCopyRef({ catalog: cell.catalog, locale: cell.locale, key: cell.key });
    if (!ref || !Number.isInteger(cell.revision)) return { ok: false, reason: "invalid" };
    const result = await publishCopy(db, ref, authorId, { kind: "mark-current", digest: cell.digest }, cell.revision);
    if (!result.ok) return result;
  }
  return { ok: true };
}

export async function copyHistory(db: Db, ref: CopyRef): Promise<readonly Head[]> {
  return db
    .select({
      revision: copyRevisions.revision,
      value: copyRevisions.value,
      translatedFrom: copyRevisions.translatedFrom,
      createdAt: copyRevisions.createdAt,
      authorId: copyRevisions.authorId,
      authorEmail: users.email,
      revertedFrom: copyRevisions.revertedFrom,
    })
    .from(copyRevisions)
    .leftJoin(users, eq(users.id, copyRevisions.authorId))
    .where(and(eq(copyRevisions.catalog, ref.catalog), eq(copyRevisions.locale, ref.locale), eq(copyRevisions.key, ref.key)))
    .orderBy(desc(copyRevisions.revision))
    .limit(12);
}

export function entryRef(catalog: string, locale: string, key: string): CopyRef | null {
  return parseCopyRef({ catalog, locale, key });
}

export function bundledFor(ref: CopyRef): string {
  return bundledValue(ref);
}

export function problemsFor(ref: CopyRef, raw: string): readonly CopyProblem[] {
  return checkValue(ref, normalizeValue(raw));
}

export function leafEnglish(ref: CopyRef): string {
  return leafOf(ref).english;
}
