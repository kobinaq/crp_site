import { COUNTRIES, type Country } from "./countries";

/**
 * Session-only drafts for the multi-step apply and nominate forms.
 *
 * Switching language is a full page load to the other locale's URL, so the open
 * form and everything typed into it would otherwise be lost. The flow's owner
 * begins a draft when the form opens; each field writes itself into it; the
 * owner clears it when the form closes or is submitted. Writes to a draft that
 * was never begun (or was already cleared) are dropped, so nothing reappears
 * after a submit.
 *
 * Stored in sessionStorage (this tab only, gone when it closes) and expires
 * after DRAFT_TTL_MS. Only plain typed values are kept: never security tokens,
 * file uploads, or verification results (writeDraftField refuses those names).
 */

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const APPLY_DRAFT = "crp:draft:apply";
export const NOMINATE_DRAFT = "crp:draft:nominate";
export const DRAFT_TTL_MS = 30 * 60 * 1000;

type Envelope = { v: 1; savedAt: number; fields: Record<string, unknown> };

const NEVER_STORED = /token|turnstile|captcha|file|upload|verif|didit|videoask|password|secret/i;

export function isStorableField(field: string): boolean {
  return !NEVER_STORED.test(field);
}

function readEnvelope(storage: DraftStorage, key: string, now: number): Envelope | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Envelope> | null;
    if (
      parsed &&
      parsed.v === 1 &&
      typeof parsed.savedAt === "number" &&
      parsed.fields &&
      typeof parsed.fields === "object" &&
      !Array.isArray(parsed.fields) &&
      now - parsed.savedAt <= DRAFT_TTL_MS &&
      parsed.savedAt <= now + 60_000
    ) {
      return parsed as Envelope;
    }
  } catch {
    // Corrupt entry: fall through and drop it.
  }
  clearDraft(storage, key);
  return null;
}

function save(storage: DraftStorage, key: string, envelope: Envelope) {
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota / private mode: the form still works, it just won't survive a reload.
  }
}

/** Start a fresh, empty draft (drops any earlier one). */
export function beginDraft(storage: DraftStorage, key: string, now = Date.now()) {
  save(storage, key, { v: 1, savedAt: now, fields: {} });
}

/** True while an unexpired draft exists, i.e. the form was open when the page was left. */
export function hasDraft(storage: DraftStorage, key: string, now = Date.now()): boolean {
  return readEnvelope(storage, key, now) !== null;
}

/** The draft's fields, or null when there is no live draft. */
export function readDraft(storage: DraftStorage, key: string, now = Date.now()): Record<string, unknown> | null {
  return readEnvelope(storage, key, now)?.fields ?? null;
}

/** Record one field. No-op without a live draft or for a field that must never be stored. */
export function writeDraftField(
  storage: DraftStorage,
  key: string,
  field: string,
  value: unknown,
  now = Date.now(),
) {
  if (!isStorableField(field)) return;
  const envelope = readEnvelope(storage, key, now);
  if (!envelope) return;
  envelope.fields[field] = value;
  envelope.savedAt = now;
  save(storage, key, envelope);
}

export function clearDraft(storage: DraftStorage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** sessionStorage in the browser; null on the server or when the browser blocks it. */
export function draftStorage(): DraftStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// Validators for values read back from storage: anything unexpected falls back to the default.
const MAX_TEXT = 1000;

export type DraftParser<T> = (raw: unknown) => T | undefined;

export const asText: DraftParser<string> = (raw) =>
  typeof raw === "string" ? raw.slice(0, MAX_TEXT) : undefined;

export const asBoolean: DraftParser<boolean> = (raw) => (typeof raw === "boolean" ? raw : undefined);

export function asOneOf<T extends string>(values: readonly T[]): DraftParser<T> {
  return (raw) => (typeof raw === "string" && (values as readonly string[]).includes(raw) ? (raw as T) : undefined);
}

export function asNullable<T>(parse: DraftParser<T>): DraftParser<T | null> {
  return (raw) => (raw === null ? null : parse(raw));
}

export const asTextList: DraftParser<string[]> = (raw) =>
  Array.isArray(raw) && raw.length <= 100 && raw.every((item) => typeof item === "string")
    ? raw.map((item: string) => item.slice(0, MAX_TEXT))
    : undefined;

/** Countries are stored whole but restored from the list by code, so stale data can't inject one. */
export const asCountry: DraftParser<Country> = (raw) => {
  const code = raw && typeof raw === "object" ? (raw as { code?: unknown }).code : undefined;
  return typeof code === "string" ? COUNTRIES.find((c) => c.code === code) : undefined;
};

/** A flat record of text fields, e.g. the nominee details carried to the second step. */
export function asRecord<T extends Record<string, unknown>>(
  required: readonly (keyof T & string)[],
  optional: readonly (keyof T & string)[],
  enums: Partial<Record<keyof T & string, readonly string[]>> = {},
): DraftParser<T> {
  return (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const source = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const name of [...required, ...optional]) {
      const value = source[name];
      if (value === undefined && !required.includes(name)) continue;
      if (typeof value !== "string") return undefined;
      const allowed = enums[name];
      if (allowed && !allowed.includes(value)) return undefined;
      out[name] = value.slice(0, MAX_TEXT);
    }
    return out as T;
  };
}
