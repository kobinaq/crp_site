"use client";

import { useSyncExternalStore } from "react";

/**
 * Which flow the Apply / Nominate buttons open.
 *
 * - Production (www.climaterefugeepavilion.org) → ExpressInterestPopup (default).
 * - Dev + Vercel previews → full ApplyFlow.
 *
 * NEXT_PUBLIC_ENABLE_APPLY_FLOW="true" | "false" overrides everything.
 * Otherwise the flow is on only when NEXT_PUBLIC_VERCEL_ENV !== "production",
 * and, as a belt-and-braces default, never on the production hostname (in case
 * the Vercel system env var isn't exposed to the client bundle).
 */
const PRODUCTION_HOSTS = ["climaterefugeepavilion.org", "www.climaterefugeepavilion.org"];

function computeEnabled(): boolean {
  const override = process.env.NEXT_PUBLIC_ENABLE_APPLY_FLOW;
  if (override === "true") return true;
  if (override === "false") return false;
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") return false;
  return !PRODUCTION_HOSTS.includes(window.location.hostname);
}

const subscribe = () => () => {};

/** False on the server and first hydration pass (popup), then the real decision. */
export function useApplyFlowEnabled(): boolean {
  return useSyncExternalStore(subscribe, computeEnabled, () => false);
}
