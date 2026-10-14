"use client";

import { useSyncExternalStore } from "react";

/** Below the 900px `desk` breakpoint. */
const MOBILE_QUERY = "(max-width: 899.98px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** False on the server and first hydration pass, then tracks the media query. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Mobile Figma frames the globes on Asia; desktop keeps the default start (yaw 0). */
export const MOBILE_GLOBE_YAW = Math.PI - 0.9;
