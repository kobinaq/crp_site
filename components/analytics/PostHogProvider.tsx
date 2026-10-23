"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { hasConsent, onConsentChange } from "@/lib/consent";
import { DEFAULT_POSTHOG_HOST, analyticsEnvironment, createAnalytics } from "@/lib/analytics";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST;
/** "production" / "preview" on Vercel, "development" elsewhere; sent with every event. */
const ENVIRONMENT = analyticsEnvironment(process.env.NEXT_PUBLIC_VERCEL_ENV);

/** One controller per page load (survives React's dev double-mount). */
let analytics: ReturnType<typeof createAnalytics> | null = null;

/**
 * Starts PostHog only after analytics consent, and follows later changes made
 * in the banner or preferences panel. A no-op without NEXT_PUBLIC_POSTHOG_KEY.
 * Must sit inside ConsentProvider. See lib/analytics.ts.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!KEY) return;
    if (pathname.startsWith("/admin")) {
      if (analytics) void analytics.sync(false);
      return;
    }
    analytics ??= createAnalytics({
      key: KEY,
      host: HOST,
      environment: ENVIRONMENT,
      load: () => import("posthog-js").then((module) => module.default),
    });
    const controller = analytics;
    if (hasConsent("analytics")) void controller.sync(true);
    return onConsentChange((consent) => void controller.sync(consent.choices.analytics));
  }, [pathname]);

  return <>{children}</>;
}
