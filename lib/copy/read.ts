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

export const COPY_TAG = "copy";
const REVALIDATE_SECONDS = 600;
const DEADLINE_MS = 1500;

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

async function loadPublishedRows(): Promise<PublishedRow[]> {
  return queryPublishedRows(getDb());
}

const cachedPublishedRows = unstable_cache(loadPublishedRows, ["copy-head"], {
  tags: [COPY_TAG],
  revalidate: REVALIDATE_SECONDS,
});

export async function publishedOrFallback(load: () => Promise<readonly PublishedRow[]>): Promise<PublishedCopy> {
  try {
    return indexPublished(await load());
  } catch (err) {
    console.error("[copy] published rows unavailable", err instanceof Error ? err.message : err);
    return NO_OVERRIDES;
  }
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("copy read timed out")), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export const siteCopy = cache(async (locale: Locale): Promise<SiteCopy> => {
  const published = await publishedOrFallback(() => withDeadline(cachedPublishedRows(), DEADLINE_MS));
  return { messages: mergePage(published, locale), ui: uiOverrides(published), published };
});

export async function loadEmailSources(): Promise<EmailSources> {
  try {
    const published = await publishedOrFallback(() => withDeadline(cachedPublishedRows(), DEADLINE_MS));
    return emailSourcesFrom(published);
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
