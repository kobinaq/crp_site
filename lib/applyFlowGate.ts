"use client";

import { useSyncExternalStore } from "react";

/**
 * Which flow the Apply / Nominate buttons open: the full apply / nomination flow,
 * or the ExpressInterestPopup.
 *
 * - Not production (local dev, Vercel previews): always the full flow.
 *   NEXT_PUBLIC_ENABLE_APPLY_FLOW is ignored here.
 * - Production: the full flow only when NEXT_PUBLIC_ENABLE_APPLY_FLOW === "true".
 *   Unset or any other value means Express interest.
 *
 * "Production" means NEXT_PUBLIC_VERCEL_ENV === "production" OR the page is on a
 * production hostname. The hostname check is belt-and-braces in case the Vercel
 * system env var isn't exposed to the client bundle.
 */
export const PRODUCTION_HOSTS = ["climaterefugeepavilion.org", "www.climaterefugeepavilion.org"];

export function applyFlowEnabledFor({
  vercelEnv,
  override,
  hostname,
}: {
  vercelEnv: string | undefined;
  override: string | undefined;
  hostname: string;
}): boolean {
  const production = vercelEnv === "production" || PRODUCTION_HOSTS.includes(hostname);
  if (!production) return true;
  return override === "true";
}

function computeEnabled(): boolean {
  // Literal process.env reads so Next inlines the values into the client bundle.
  return applyFlowEnabledFor({
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    override: process.env.NEXT_PUBLIC_ENABLE_APPLY_FLOW,
    hostname: window.location.hostname,
  });
}

const subscribe = () => () => {};

/** False on the server and first hydration pass (popup), then the real decision. */
export function useApplyFlowEnabled(): boolean {
  return useSyncExternalStore(subscribe, computeEnabled, () => false);
}
