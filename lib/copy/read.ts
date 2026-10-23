import { cache } from "react";
import { unstable_cache, updateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import type { Locale } from "@/lib/locale";
import type { Messages } from "@/lib/messages";
import {
  indexPublished,
  mergePage,
  NO_OVERRIDES,
  uiOverrides,
  type PublishedCopy,
  type PublishedRow,
} from "@/lib/copy/catalog";
import type { UiOverrides } from "@/lib/ui-messages";
import { emailSourcesFrom, JSON_EMAILS, type EmailSources } from "@/lib/copy/sources";
import { isConnectionError, queryWithRetry, rateLimitedWarn, shortReason, withTimeout, type RetryOptions } from "@/lib/copy/resilience";

export const COPY_TAG = "copy";
const REVALIDATE_SECONDS = 600;
// How long a page render waits for the copy before using the fallback (unchanged).
const DEADLINE_MS = 1500;
// The refresh itself: one retry on connection errors, 5s per attempt (a Neon
// compute waking from scale-to-zero plus the TLS handshake fits well inside
// that), 8s in total. It runs as a background revalidation, so this budget
// does not add to page render time.
const RETRY: RetryOptions = { attemptTimeoutMs: 5_000, budgetMs: 8_000, retryDelayMs: 250 };
const WARN_INTERVAL_MS = 5 * 60_000;

type SiteCopy = {
  messages: Messages;
  ui: UiOverrides;
  published: PublishedCopy;
};

export async function queryPublishedRows(db: Db): Promise<PublishedRow[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', '1500', true)`);
    const result = await tx.execute(sql`
      select catalog, locale, key, value
      from (
        select distinct on (catalog, locale, key) catalog, locale, key, value
        from copy_revisions
        order by catalog, locale, key, revision desc
      ) head
      where value is not null
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    return rows.flatMap((row) => {
      const record = row as { catalog?: unknown; locale?: unknown; key?: unknown; value?: unknown };
      if (typeof record.catalog !== "string" || typeof record.locale !== "string" || typeof record.key !== "string" || typeof record.value !== "string") return [];
      return [{ catalog: record.catalog, locale: record.locale, key: record.key, value: record.value }];
    });
  });
}

type Logger = { warn: (key: string, line: string) => void; error: (line: string) => void };

const defaultLogger: Logger = {
  warn: rateLimitedWarn(WARN_INTERVAL_MS),
  error: (line) => console.error(line),
};

// Reads the published rows, or falls back to the last good rows this instance
// has seen, or to the bundled defaults. A connection-class failure is an
// expected outage (Neon waking up, a dropped socket) and gets one rate-limited
// warn line; anything else is unexpected and stays an error.
export async function publishedOrFallback(
  load: () => Promise<readonly PublishedRow[]>,
  fallback: () => readonly PublishedRow[] | undefined = () => undefined,
  log: Logger = defaultLogger,
): Promise<PublishedCopy> {
  try {
    return indexPublished(await load());
  } catch (err) {
    const stale = fallback();
    if (isConnectionError(err)) {
      log.warn("read", `[copy] published copy unavailable (${shortReason(err)}); serving ${stale ? "last good" : "default"} copy`);
    } else {
      log.error(`[copy] published rows unavailable: ${shortReason(err)}`);
    }
    return stale ? indexPublished(stale) : NO_OVERRIDES;
  }
}

export type CopySourceOptions = {
  query: () => Promise<PublishedRow[]>;
  // Wraps the refresh in the shared data cache (unstable_cache in production).
  cache?: (refresh: () => Promise<PublishedRow[]>) => () => Promise<PublishedRow[]>;
  deadlineMs: number;
  retry: RetryOptions;
  log?: Logger;
};

export function createCopySource(options: CopySourceOptions) {
  const log = options.log ?? defaultLogger;
  // Newest rows this server instance has seen, from the DB or the data cache.
  let lastGood: readonly PublishedRow[] | undefined;
  const remember = <T extends readonly PublishedRow[]>(rows: T): T => {
    lastGood = rows;
    return rows;
  };

  // Runs inside unstable_cache. When it throws during a background
  // revalidation Next logs a full error with a stack, so an expected outage
  // returns the last good rows instead (the same rows the stale entry holds),
  // which keeps the page on that copy until the next revalidation.
  async function refresh(): Promise<PublishedRow[]> {
    try {
      return remember(await queryWithRetry(options.query, options.retry));
    } catch (err) {
      if (lastGood && isConnectionError(err)) {
        log.warn("refresh", `[copy] refresh failed (${shortReason(err)}); keeping last good copy`);
        return [...lastGood];
      }
      throw err;
    }
  }

  const cached = options.cache ? options.cache(refresh) : refresh;

  // Page render never waits longer than deadlineMs; a slow refresh keeps going
  // in the background and lands in the cache when it finishes.
  function read(): Promise<PublishedCopy> {
    return publishedOrFallback(
      async () => remember(await withTimeout(cached(), options.deadlineMs, "copy read")),
      () => lastGood,
      log,
    );
  }

  return { refresh, read, lastGood: () => lastGood };
}

const source = createCopySource({
  query: () => queryPublishedRows(getDb()),
  cache: (refresh) => unstable_cache(refresh, ["copy-head"], { tags: [COPY_TAG], revalidate: REVALIDATE_SECONDS }),
  deadlineMs: DEADLINE_MS,
  retry: RETRY,
});

export const siteCopy = cache(async (locale: Locale): Promise<SiteCopy> => {
  const published = await source.read();
  return { messages: mergePage(published, locale), ui: uiOverrides(published), published };
});

export async function loadEmailSources(): Promise<EmailSources> {
  try {
    return emailSourcesFrom(await source.read());
  } catch (err) {
    console.error("[copy] email sources unavailable", err instanceof Error ? err.message : err);
    return JSON_EMAILS;
  }
}

export function expireCopy(): void {
  try {
    updateTag(COPY_TAG);
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
  }
}
