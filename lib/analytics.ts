/**
 * Consent-gated PostHog analytics. The SDK (posthog-js) is imported lazily and
 * only once the visitor has allowed the "analytics" cookie category; without
 * NEXT_PUBLIC_POSTHOG_KEY nothing is ever loaded.
 *
 * - Grant: init (once), then opt_in_capturing().
 * - Withdrawal: opt_out_capturing(), reset(), then every ph_* cookie and
 *   local/session storage key is deleted (clearAnalyticsStorage).
 * The SDK is initialised opted out with persistence off, so it stores nothing
 * and sends nothing until opt_in_capturing(), and returns to that state after
 * reset(). Never call identify() or set person properties with emails, names
 * or any other personal data.
 *
 * Every event carries the super property `environment` (NEXT_PUBLIC_VERCEL_ENV,
 * else "development") so preview traffic can be filtered out. It is registered
 * after each opt-in (reset() clears it, so it is registered again on the next
 * opt-in) and never while opted out. The opt-in pageview is sent inside
 * opt_in_capturing(), before register() can run, so before_send also adds it
 * to any event that lacks it (before_send only runs for events being sent).
 */
import type { PostHog, PostHogConfig } from "posthog-js";
import { clearAnalyticsStorage } from "@/lib/consent";

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** The `environment` super property: Vercel's environment, or "development" when unset. */
export function analyticsEnvironment(vercelEnv: string | undefined = process.env.NEXT_PUBLIC_VERCEL_ENV): string {
  return vercelEnv || "development";
}

/** URL properties PostHog records; their query strings can carry tokens, so they are scrubbed. */
const URL_PROPERTIES = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$prev_pageview_url"];

/** Drops the hash and every query parameter except utm_* campaign tags. */
export function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string" || !/^https?:\/\//.test(value)) return value;
  try {
    const url = new URL(value);
    for (const name of [...url.searchParams.keys()]) if (!name.startsWith("utm_")) url.searchParams.delete(name);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

type Event = Parameters<Extract<PostHogConfig["before_send"], (...args: never[]) => unknown>>[0];

export function scrubEvent(event: Event | null): Event | null {
  if (!event) return event;
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag) continue;
    for (const key of URL_PROPERTIES) if (key in bag) bag[key] = scrubUrl(bag[key]);
  }
  return event;
}

/** before_send step: adds `environment` to an event that does not have it yet. */
export function stampEnvironment(environment: string) {
  return (event: Event | null): Event | null => {
    if (event?.properties && event.properties.environment === undefined) event.properties.environment = environment;
    return event;
  };
}

export function posthogOptions(apiHost: string, environment = analyticsEnvironment()): Partial<PostHogConfig> {
  return {
    api_host: apiHost,
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    capture_pageleave: true,
    disable_session_recording: true,
    // Inputs are always masked; other page text is not.
    session_recording: { maskAllInputs: true },
    mask_all_text: false,
    persistence: "localStorage+cookie",
    // Opted out (and storing nothing) until opt_in_capturing(), and again after reset().
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    // No feature flags, surveys or extra scripts from PostHog's CDN: only events are sent.
    advanced_disable_flags: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    before_send: [scrubEvent, stampEnvironment(environment)],
  };
}

type Loader = () => Promise<PostHog>;

/**
 * Keeps PostHog in step with the analytics choice. `sync(true)` loads and opts
 * in, `sync(false)` opts out and clears; calls are serialised so a fast
 * grant/withdraw cannot leave capturing on.
 */
export function createAnalytics({
  key,
  host,
  load,
  environment = analyticsEnvironment(),
}: {
  key: string;
  host: string;
  load: Loader;
  environment?: string;
}) {
  let client: Promise<PostHog> | null = null;
  let wanted = false;
  let queue: Promise<void> = Promise.resolve();

  async function apply() {
    if (wanted) {
      client ??= load().then((posthog) => {
        posthog.init(key, posthogOptions(host, environment));
        return posthog;
      });
      const posthog = await client;
      if (!wanted) return;
      if (!posthog.has_opted_in_capturing()) posthog.opt_in_capturing({ captureEventName: false });
      // Opted in now: (re-)register, as reset() on an earlier withdrawal cleared it.
      posthog.register({ environment });
    } else if (client) {
      const posthog = await client;
      if (!wanted) {
        posthog.opt_out_capturing();
        posthog.reset();
        clearAnalyticsStorage();
      }
    }
  }

  return {
    sync(granted: boolean): Promise<void> {
      wanted = granted;
      queue = queue.then(apply, apply).catch(() => {
        /* Analytics must never break the page (blocked script, network error). */
      });
      return queue;
    },
  };
}
