"use client";

import { useEffect, useRef } from "react";
import { useHydrated } from "@/lib/useHydrated";
import { createPortal } from "react-dom";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SITE_KEY = TURNSTILE_SITE_KEY;

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.turnstile) return resolve();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Renders the managed Turnstile widget and hands its token up. Renders nothing
// when no site key is configured, so the forms still work in dev.
// Portaled out of the form so the banner never shifts fields or buttons.
// Hidden unless Cloudflare asks the visitor to complete a check.
export function Turnstile({
  onToken,
  size = "normal",
}: {
  onToken: (token: string | null) => void;
  size?: "normal" | "compact" | "flexible";
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cbRef = useRef(onToken);
  const mounted = useHydrated();
  useEffect(() => {
    cbRef.current = onToken;
  }, [onToken]);
  useEffect(() => {
    if (!SITE_KEY || !mounted || !boxRef.current) return;
    let cancelled = false;
    const box = boxRef.current;

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId.current = window.turnstile.render(box, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          size,
          callback: (token: string) => cbRef.current(token),
          "error-callback": () => cbRef.current(null),
          "expired-callback": () => cbRef.current(null),
        });
      })
      .catch(() => cbRef.current(null));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // Widget already gone; nothing to clean up.
        }
        widgetId.current = null;
      }
    };
  }, [mounted, size]);

  if (!SITE_KEY || !mounted) return null;
  return createPortal(
    <div ref={boxRef} className="fixed bottom-4 left-4 z-[100]" />,
    document.body,
  );
}
