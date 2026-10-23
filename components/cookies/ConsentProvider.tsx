"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  ALL_OPTIONAL,
  CONSENT_COOKIE,
  CONSENT_EVENT,
  NO_OPTIONAL,
  allows,
  parseConsent,
  writeConsent,
  type Consent,
  type ConsentCategory,
  type ConsentChoices,
} from "@/lib/consent";
import { persistLocale } from "@/lib/locale";
import { useLanguage } from "@/components/LanguageProvider";
import { CookieBanner } from "./CookieBanner";
import { CookiePreferences } from "./CookiePreferences";

type ConsentContextValue = {
  /** undefined until hydrated (the cookie is read on the client only), null when not chosen yet. */
  consent: Consent | null | undefined;
  /** The first-visit banner is on screen (no choice stored yet). */
  bannerVisible: boolean;
  allows: (category: ConsentCategory) => boolean;
  save: (choices: ConsentChoices) => void;
  openPreferences: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}
function consentCookie() {
  const prefix = `${CONSENT_COOKIE}=`;
  return document.cookie.split("; ").find((row) => row.startsWith(prefix))?.slice(prefix.length) ?? "";
}

/**
 * Owns the visitor's cookie choice, shows the banner until one is made and the
 * preferences panel on request. Read on the client only, so public pages stay
 * cookie-independent on the server (see lib/request-locale.ts).
 */
export function ConsentProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  const pathname = usePathname();
  const onAdmin = pathname.startsWith("/admin");
  const raw = useSyncExternalStore<string | null>(subscribe, consentCookie, () => null);
  const consent = useMemo(() => (raw === null ? undefined : parseConsent(raw)), [raw]);
  const [panelOpen, setPanelOpen] = useState(false);

  const save = useCallback(
    (choices: ConsentChoices) => {
      writeConsent(choices);
      // Remember the language the visitor is already using once it's allowed.
      if (choices.functional) persistLocale(locale);
      setPanelOpen(false);
    },
    [locale],
  );
  const openPreferences = useCallback(() => setPanelOpen(true), []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      bannerVisible: consent === null,
      allows: (category) => allows(consent ?? null, category),
      save,
      openPreferences,
    }),
    [consent, save, openPreferences],
  );

  return (
    <ConsentContext.Provider value={value}>
      {/* First in the DOM so keyboard and screen-reader users reach it early; it is
          fixed to the bottom visually. Stays mounted (inert) under the panel so focus
          can return to MANAGE PREFERENCES when the panel closes. */}
      {consent === null && !onAdmin ? (
        <CookieBanner
          hidden={panelOpen}
          onAcceptAll={() => save(ALL_OPTIONAL)}
          onRejectAll={() => save(NO_OPTIONAL)}
          onManage={openPreferences}
        />
      ) : null}
      {children}
      {panelOpen ? (
        <CookiePreferences
          initial={consent?.choices ?? NO_OPTIONAL}
          onSave={save}
          onRejectAll={() => save(NO_OPTIONAL)}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
}

/**
 * Renders children (an embed, a third-party script) only once the visitor has
 * allowed `category`. Use this for anything non-essential added later.
 */
export function ConsentGate({
  category,
  fallback = null,
  children,
}: {
  category: ConsentCategory;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { allows: allowed } = useConsent();
  return <>{allowed(category) ? children : fallback}</>;
}
