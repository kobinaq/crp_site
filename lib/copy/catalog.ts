import { applicationLocales, locales, type Locale } from "@/lib/locale";
import { messages, placeholdersIn, type Messages } from "@/lib/messages";
import { lookupUi, uiMessages, type UiOverrides } from "@/lib/ui-messages";
import ackCopy from "@/lib/translations/acknowledgement-emails.json";
import appCopy from "@/lib/translations/application-emails.json";

export const CATALOGS = {
  page: { label: "Pages", locales },
  ui: { label: "Forms and buttons", locales },
  ackEmail: { label: "Thank-you emails", locales },
  appEmail: { label: "Applicant emails", locales: applicationLocales },
} as const;

export type CatalogId = keyof typeof CATALOGS;
export type CatalogLocale<C extends CatalogId> = (typeof CATALOGS)[C]["locales"][number];

declare const keyBrand: unique symbol;
export type CopyKey<C extends CatalogId> = string & { readonly [keyBrand]: C };

export type CopyRef = {
  [C in CatalogId]: { readonly catalog: C; readonly locale: CatalogLocale<C>; readonly key: CopyKey<C> };
}[CatalogId];

export type CopyFormat = "text" | "subject" | "email";

export type Leaf = {
  readonly catalog: CatalogId;
  readonly key: string;
  readonly path: readonly (string | number)[];
  readonly section: string;
  readonly english: string;
  readonly placeholders: readonly string[];
  readonly format: CopyFormat;
};

export const MAX_VALUE_LENGTH = 2000;

const BR = /<br\s*\/?>/gi;

const englishRoot: Record<CatalogId, unknown> = {
  page: messages.en,
  ui: uiMessages.en,
  ackEmail: ackCopy.en,
  appEmail: appCopy.en,
};

const localeRoot: Record<CatalogId, Record<string, unknown>> = {
  page: messages,
  ui: uiMessages,
  ackEmail: ackCopy,
  appEmail: appCopy,
};

let cachedLeaves: { [C in CatalogId]: readonly Leaf[] } | undefined;

function isCatalog(value: string): value is CatalogId {
  return Object.hasOwn(CATALOGS, value);
}

function formatOf(catalog: CatalogId, key: string): CopyFormat {
  if (catalog === "page" || catalog === "ui") return "text";
  return key.endsWith("Subject") ? "subject" : "email";
}

function expectedPlaceholders(catalog: CatalogId, raw: string): readonly string[] {
  const names = placeholdersIn(raw);
  if (catalog === "page" || catalog === "ui") return [...new Set(names)];
  return names;
}

function walk(catalog: CatalogId, value: unknown, path: (string | number)[], out: Leaf[]): void {
  if (typeof value === "string") {
    const key = path.map(String).join(".");
    out.push({
      catalog,
      key,
      path: [...path],
      section: catalog === "page" ? String(path[0] ?? "page") : catalog === "ui" ? "Interface" : "Email",
      english: value,
      placeholders: expectedPlaceholders(catalog, value),
      format: formatOf(catalog, key),
    });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(catalog, item, [...path, index], out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (catalog === "page" && key.includes(".")) {
        throw new Error(`page copy key contains a dot: ${[...path, key].join(".")}`);
      }
      walk(catalog, child, [...path, key], out);
    }
  }
}

function allLeaves(): { [C in CatalogId]: readonly Leaf[] } {
  if (cachedLeaves) return cachedLeaves;
  const built = {} as { [C in CatalogId]: Leaf[] };
  for (const catalog of Object.keys(CATALOGS) as CatalogId[]) {
    const leavesForCatalog: Leaf[] = [];
    walk(catalog, englishRoot[catalog], [], leavesForCatalog);
    built[catalog] = leavesForCatalog;
  }
  cachedLeaves = built;
  return built;
}

export function leaves(catalog: CatalogId): readonly Leaf[] {
  return allLeaves()[catalog];
}

function leafMap(catalog: CatalogId): ReadonlyMap<string, Leaf> {
  return new Map(leaves(catalog).map((leaf) => [leaf.key, leaf]));
}

function isLeafKey<C extends CatalogId>(catalog: C, key: string): key is CopyKey<C> {
  return leafMap(catalog).has(key);
}

export function leafOf(ref: CopyRef): Leaf {
  const leaf = leafMap(ref.catalog).get(ref.key);
  if (!leaf) throw new Error(`unknown copy leaf ${ref.catalog}:${ref.key}`);
  return leaf;
}

function readPath(root: unknown, path: readonly (string | number)[]): string | null {
  let cursor: unknown = root;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[String(segment)];
  }
  return typeof cursor === "string" ? cursor : null;
}

export function editableValue(format: CopyFormat, raw: string): string {
  if (format !== "email") return raw;
  return raw.replace(BR, "\n");
}

export function bundledValue(ref: CopyRef): string {
  const leaf = leafOf(ref);
  const root = localeRoot[ref.catalog][ref.locale];
  const raw = readPath(root, leaf.path);
  return editableValue(leaf.format, raw ?? "");
}

export function normalizeValue(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

export type CopyProblem =
  | { readonly kind: "placeholders"; readonly expected: readonly string[]; readonly found: readonly string[] }
  | { readonly kind: "line-break" }
  | { readonly kind: "too-long"; readonly max: number };

function sameNames(expected: readonly string[], found: readonly string[], counts: boolean): boolean {
  if (counts) return expected.join("\0") === found.join("\0");
  return [...new Set(expected)].join("\0") === [...new Set(found)].join("\0");
}

export function checkValue(ref: CopyRef, value: string): readonly CopyProblem[] {
  const leaf = leafOf(ref);
  const problems: CopyProblem[] = [];
  const found = leaf.format === "text" || leaf.catalog === "page" || leaf.catalog === "ui"
    ? [...new Set(placeholdersIn(value))]
    : placeholdersIn(value);
  const counts = leaf.catalog === "ackEmail" || leaf.catalog === "appEmail";
  if (!sameNames(leaf.placeholders, found, counts)) {
    problems.push({ kind: "placeholders", expected: leaf.placeholders, found });
  }
  if (leaf.format === "subject" && value.includes("\n")) problems.push({ kind: "line-break" });
  if (value.length > MAX_VALUE_LENGTH) problems.push({ kind: "too-long", max: MAX_VALUE_LENGTH });
  return problems;
}

export function parseCopyRef(input: Readonly<Record<string, unknown>>): CopyRef | null {
  const { catalog, locale, key } = input;
  if (typeof catalog !== "string" || typeof locale !== "string" || typeof key !== "string") return null;
  if (catalog === "page") {
    const matched = locales.find((item) => item === locale);
    if (!matched || !isLeafKey("page", key)) return null;
    return { catalog, locale: matched, key };
  }
  if (catalog === "ui") {
    const matched = locales.find((item) => item === locale);
    if (!matched || !isLeafKey("ui", key)) return null;
    return { catalog, locale: matched, key };
  }
  if (catalog === "ackEmail") {
    const matched = locales.find((item) => item === locale);
    if (!matched || !isLeafKey("ackEmail", key)) return null;
    return { catalog, locale: matched, key };
  }
  if (catalog !== "appEmail") return null;
  const matched = applicationLocales.find((item) => item === locale);
  if (!matched || !isLeafKey(catalog, key)) return null;
  return { catalog, locale: matched, key };
}

class Published {
  constructor(readonly rows: ReadonlyMap<string, readonly (readonly [Leaf, string])[]>) {}
}

export type PublishedCopy = Published;
export const NO_OVERRIDES: PublishedCopy = new Published(new Map());

export type PublishedRow = { readonly catalog: string; readonly locale: string; readonly key: string; readonly value: string };

function bucketKey(catalog: CatalogId, locale: string): string {
  return `${catalog}\0${locale}`;
}

export function indexPublished(rows: readonly PublishedRow[]): PublishedCopy {
  const grouped = new Map<string, (readonly [Leaf, string])[]>();
  for (const row of rows) {
    if (!isCatalog(row.catalog) || !isLeafKey(row.catalog, row.key)) continue;
    const ref = parseCopyRef({ catalog: row.catalog, locale: row.locale, key: row.key });
    if (!ref) continue;
    if (checkValue(ref, row.value).length > 0) continue;
    const list = grouped.get(bucketKey(ref.catalog, ref.locale)) ?? [];
    list.push([leafOf(ref), row.value]);
    grouped.set(bucketKey(ref.catalog, ref.locale), list);
  }
  return new Published(grouped);
}

export function overrides<C extends CatalogId>(
  published: PublishedCopy,
  catalog: C,
  locale: CatalogLocale<C>,
): readonly (readonly [Leaf, string])[] {
  return published.rows.get(bucketKey(catalog, locale)) ?? [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function setPath(root: unknown, path: readonly (string | number)[], value: string): void {
  let cursor: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (!isRecord(cursor)) return;
    cursor = cursor[String(path[i])];
  }
  if (!isRecord(cursor)) return;
  const last = path[path.length - 1];
  if (last === undefined || typeof cursor[String(last)] !== "string") return;
  cursor[String(last)] = value;
}

export function mergePage(published: PublishedCopy, locale: Locale): Messages {
  const pairs = overrides(published, "page", locale);
  if (pairs.length === 0) return messages[locale];
  const copy = structuredClone(messages[locale]);
  for (const [leaf, value] of pairs) setPath(copy, leaf.path, value);
  return copy;
}

export function uiOverrides(published: PublishedCopy): UiOverrides {
  const result: Partial<Record<Locale, Record<string, string>>> = {};
  for (const locale of locales) {
    const pairs = overrides(published, "ui", locale);
    if (pairs.length === 0) continue;
    result[locale] = Object.fromEntries(pairs.map(([leaf, value]) => [leaf.key, value]));
  }
  return result;
}

export function lookupUiWith(published: PublishedCopy, locale: Locale, text: string): string {
  return lookupUi(locale, text, uiOverrides(published));
}

export type TranslationState =
  | { readonly kind: "source" }
  | { readonly kind: "current" }
  | { readonly kind: "stale"; readonly translatedFrom: string; readonly englishNow: string };

export function translationState(input: {
  readonly ref: CopyRef;
  readonly enOverride: string | null;
  readonly live: { readonly value: string; readonly translatedFrom: string | null } | null;
}): TranslationState {
  if (input.ref.locale === "en") return { kind: "source" };
  const englishRef = parseCopyRef({ catalog: input.ref.catalog, locale: "en", key: input.ref.key });
  const english = englishRef ? bundledValue(englishRef) : "";
  const englishNow = input.enOverride ?? english;
  const translatedFrom = input.live?.translatedFrom ?? english;
  if (translatedFrom === englishNow) return { kind: "current" };
  return { kind: "stale", translatedFrom, englishNow };
}
