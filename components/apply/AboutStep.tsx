"use client";

import { useText } from "@/lib/ui-text";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { applicationLocales, localePath, type ApplicationLocale } from "@/lib/locale";
import { COUNTRIES, type Country } from "@/lib/countries";
import { ageFromDob, minApplicantAge, maxApplicantAge } from "@/lib/capture";
import { submitInterest, requestApplicationLink } from "@/lib/actions";
import { useLanguage } from "../LanguageProvider";
import { Turnstile, TURNSTILE_SITE_KEY } from "../Turnstile";
import { CountryDropdown } from "./CountryDropdown";
import { DateField } from "./DateField";
import { Toast } from "./Toast";
import { ContinueButton } from "./ContinueButton";
import { FormRadioCard } from "./FormRadioCard";
import { FormCheckRow } from "./FormCheckRow";
import { FIELD, FIELD_LG, MINI_LABEL, PLACEHOLDER_LG, VALUE_LG } from "./fieldStyles";

// Text pill with a floating label once filled (Figma 2308:2967): placeholder
// label when empty, small label above the value when filled. Presentation only.
function FloatInput({
  label,
  className = "",
  ...input
}: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const filled = String(input.value ?? "").length > 0;
  return (
    <label className={`${FIELD} ${FIELD_LG} min-w-0 flex-col items-start justify-center pl-6 pr-8 ${className}`}>
      {filled ? <span className={MINI_LABEL}>{label}</span> : null}
      <input
        {...input}
        placeholder={label}
        className={`w-full min-w-0 bg-transparent outline-none ${VALUE_LG} ${PLACEHOLDER_LG} ${filled ? "mt-0.5" : ""}`}
      />
    </label>
  );
}

// Mobile travel question (Figma 2308:11086): 16px black box with a white tick, 15px copy.
function SheetCheck({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={checked} className="flex w-full items-center gap-2 pl-6 pr-[22px] text-left">
      <span
        aria-hidden
        className={`grid size-4 shrink-0 place-items-center rounded-[5.333px] border-[1.333px] border-black ${checked ? "bg-black" : "bg-transparent"}`}
      >
        {checked ? (
          <svg viewBox="0 0 18 13" className="size-[10.667px]" fill="none" aria-hidden>
            <path d="M2 7l4.5 4L16 2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 text-[15px] leading-[1.2] tracking-[-0.6px] text-black">{label}</span>
    </button>
  );
}

type ToastKind = "interest" | "interest-failed" | "success" | "already-recorded" | "existing" | "link-sent" | "link-failed" | "submit-failed";

export type AboutData = {
  language: ApplicationLocale;
  fullName: string;
  email: string;
  dob: string;
  track: "in_person" | "online";
  skills: string[];
  phone?: string;
  nationality?: string;
  basedIn?: string;
  canTravel?: boolean;
  hasValidPassport?: boolean;
  turnstileToken?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GHANA = COUNTRIES.find((c) => c.code === "GH") ?? COUNTRIES[0];

export function AboutStep({
  onBack,
  onSubmit,
  submitting,
  error,
  retryable = false,
  onDismissError,
  skills,
  existing = false,
}: {
  onBack: () => void;
  onSubmit: (data: AboutData) => void;
  submitting: boolean;
  error: string | null;
  // The error came from a server/network failure: show it as a toast with a retry.
  retryable?: boolean;
  onDismissError?: () => void;
  skills: string[];
  // The address has already applied: offer to email its owner a resume link.
  existing?: boolean;
}) {
  const tr = useText();
  const { locale, setLocale } = useLanguage();
  const router = useRouter();
  const applicationLanguage = locale === "fr" || locale === "es" ? locale : "en";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [dialCountry, setDialCountry] = useState<Country>(GHANA);
  const [mobile, setMobile] = useState("");
  const [nationality, setNationality] = useState<Country | null>(null);
  const [basedIn, setBasedIn] = useState<Country | null>(null);
  const [track, setTrack] = useState<"in_person" | "online" | null>(null);
  const [canTravel, setCanTravel] = useState(false);
  const [hasValidPassport, setHasValidPassport] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastKind | null>(null);
  const [interestBusy, setInterestBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  // Turnstile tokens are single-use; remounting the widget issues a fresh one
  // before the next server call (the resend action after a failed submit).
  const [challengeKey, setChallengeKey] = useState(0);
  const [followup, setFollowup] = useState<"sent" | "failed" | "closed" | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (existing && !armed) {
    setArmed(true);
    setFollowup(null);
    setTurnstileToken(null);
    setChallengeKey((k) => k + 1);
  } else if (!existing && armed) {
    setArmed(false);
  }

  const resumeToast = followup === "closed" ? null
    : followup === "sent" ? "link-sent"
    : followup === "failed" ? "link-failed"
    : existing ? "existing"
    : null;
  // Any server reply spends the single-use Turnstile token, so a new error
  // re-issues the challenge before a retry.
  const [seenError, setSeenError] = useState<string | null>(null);
  if (error !== seenError) {
    setSeenError(error);
    if (error) {
      setTurnstileToken(null);
      setChallengeKey((k) => k + 1);
    }
  }
  const shown = resumeToast ?? toast ?? (error && retryable ? "submit-failed" : null);
  const travelSheet = track === "in_person";

  const valid =
    fullName.trim().length > 0 && EMAIL_RE.test(email.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(dob);
  const travelReady =
    track === "online" || (track === "in_person" && canTravel && hasValidPassport);
  const turnstileReady = !TURNSTILE_SITE_KEY || Boolean(turnstileToken);
  const canSubmit = valid && travelReady && turnstileReady;

  const handleSubmit = () => {
    if (!canSubmit || submitting || !track) return;
    // Gate the 19-26 window here; outside it, offer to record interest instead
    // of applying. The server enforces the same bounds.
    const age = ageFromDob(dob);
    if (age < minApplicantAge() || age > maxApplicantAge()) {
      setToast("interest");
      return;
    }
    onSubmit({
      language: applicationLanguage,
      fullName: fullName.trim(),
      email: email.trim(),
      dob,
      track,
      skills,
      phone: mobile.trim() ? `${dialCountry.dial} ${mobile.trim()}` : undefined,
      nationality: nationality?.name,
      basedIn: basedIn?.name,
      canTravel: track === "in_person" ? canTravel : undefined,
      hasValidPassport: track === "in_person" ? hasValidPassport : undefined,
      turnstileToken,
    });
  };

  const handleInterested = async () => {
    if (interestBusy) return;
    if (TURNSTILE_SITE_KEY && !turnstileToken) return;
    setInterestBusy(true);
    const failed = () => {
      setInterestBusy(false);
      setToast("interest-failed");
      setTurnstileToken(null);
      setChallengeKey((k) => k + 1);
    };
    try {
      const age = ageFromDob(dob);
      const res = await submitInterest({
        email: email.trim(),
        name: fullName.trim() || undefined,
        ageGroup: age < minApplicantAge() ? "under_19" : "19_plus",
        track: track ?? undefined,
        source: "apply_form",
        locale,
        turnstileToken,
      });
      if (!res.ok) {
        failed();
        return;
      }
      setToast(res.status === "already_recorded" ? "already-recorded" : "success");
      window.setTimeout(() => router.push(localePath("/", locale)), 3000);
    } catch (err) {
      console.error("[apply] interest failed", err);
      failed();
    }
  };

  const handleResendLink = async () => {
    if (linkBusy || !turnstileReady) return;
    setLinkBusy(true);
    try {
      const res = await requestApplicationLink({ email: email.trim(), turnstileToken });
      setFollowup(res.ok ? "sent" : "failed");
    } catch (err) {
      console.error("[apply] resume link failed", err);
      setFollowup("failed");
    } finally {
      setLinkBusy(false);
      setTurnstileToken(null);
      setChallengeKey((k) => k + 1);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex h-dvh flex-col overflow-hidden bg-cream">
      {/* Header */}
      <header className="flex h-[68px] shrink-0 items-center justify-between px-8 desk:h-[88px] desk:px-16 desk:py-6">
        <button
          type="button"
          onClick={onBack}
          aria-label={tr("Back")}
          className="grid size-8 place-items-center rounded-full bg-white desk:size-10 desk:shadow-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/apply/arrow-left.svg" alt="" width={20} height={20} className="size-4 desk:size-6" />
        </button>

        <div className="flex h-[27px] items-center rounded-full bg-white p-0.5 desk:h-auto desk:p-1">
          {applicationLocales.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`h-full min-w-8 rounded-full px-2 text-[12px] font-semibold uppercase leading-[0.9] tracking-[0.48px] transition-colors desk:h-8 desk:min-w-[52px] desk:px-3 desk:text-[14px] desk:leading-normal desk:tracking-[0.56px] ${
                locale === code ? "bg-black text-white" : "bg-transparent text-black/48 desk:text-black/50"
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </header>

      {/* Card */}
      <main className="flex min-h-0 flex-1 items-stretch justify-center px-3 pb-2 desk:px-16 desk:pb-0">
        <div className="flex h-full max-h-full w-full min-w-0 max-w-[1072px] flex-col overflow-hidden rounded-[88px] bg-white py-8 desk:overflow-visible desk:rounded-[154px] desk:px-10 desk:py-16">
          <div className={`mx-auto flex min-h-0 w-full min-w-0 max-w-[632px] flex-1 flex-col overflow-x-hidden overflow-y-auto px-6 desk:px-0 ${travelSheet ? "max-desk:pb-12" : ""}`}>
            <h1 className="shrink-0 py-8 text-center text-[28px] leading-[0.9] tracking-[-1.12px] text-black desk:py-0 desk:text-[48px] desk:tracking-[-1.92px]">
              {tr("More about you")}</h1>

            <div className="my-auto flex flex-col gap-2 desk:pt-14">
              {/* Name + DOB */}
              <div className="flex min-w-0 flex-col gap-2 desk:flex-row">
                <FloatInput
                  label={tr("*NAME")}
                  className="shrink-0 desk:shrink desk:flex-1"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  aria-label={tr("Full name")}
                />
                <DateField value={dob} onChange={setDob} size="lg" invalid={shown === "interest" || shown === "success"} className="desk:w-[206px]" />
              </div>

              {/* Email + phone */}
              <div className="flex min-w-0 flex-col gap-2 desk:flex-row">
                <FloatInput
                  label={tr("*EMAIL")}
                  className="shrink-0 desk:shrink desk:flex-1"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label={tr("Email")}
                  spellCheck={false}
                />
                <div className={`${FIELD} ${FIELD_LG} min-w-0 gap-4 pl-4 pr-10 desk:w-[312px] desk:shrink-0`}>
                  <CountryDropdown variant="inline" size="lg" value={dialCountry} onChange={setDialCountry} />
                  <label className="flex min-w-0 flex-1 flex-col items-start justify-center">
                    {mobile ? <span className={MINI_LABEL}>{tr("MOBILE")}</span> : null}
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder={tr("MOBILE")}
                      aria-label={tr("Mobile number")}
                      className={`w-full min-w-0 bg-transparent outline-none ${VALUE_LG} ${PLACEHOLDER_LG} ${mobile ? "mt-0.5" : ""}`}
                    />
                  </label>
                </div>
              </div>

              {/* Nationality + based in */}
              <div className="flex min-w-0 flex-col gap-2 desk:flex-row">
                <CountryDropdown variant="field" size="lg" label={tr("Nationality")} value={nationality} onChange={setNationality} />
                <CountryDropdown variant="field" size="lg" label={tr("Currently based in")} value={basedIn} onChange={setBasedIn} />
              </div>

              {/* Program radios */}
              <div className="flex min-w-0 desk:mt-0.5">
                <FormRadioCard label={tr("Only program")} selected={track === "online"} onSelect={() => setTrack("online")} />
                <FormRadioCard label={tr("Travel to Antalya")} selected={track === "in_person"} onSelect={() => setTrack("in_person")} />
              </div>

              {track === "in_person" ? (
                <div className="flex flex-col max-desk:hidden desk:mt-[60px] desk:gap-0.5">
                  <FormCheckRow
                    label={tr("Can you travel out of the country you're located in")}
                    checked={canTravel}
                    onToggle={() => setCanTravel((v) => !v)}
                  />
                  <FormCheckRow
                    label={tr("Do you have a passport valid for six months after the dates of travel?")}
                    checked={hasValidPassport}
                    onToggle={() => setHasValidPassport((v) => !v)}
                  />
                </div>
              ) : null}

              {error && !retryable ? (
                <p role="alert" className="text-center text-[13px] text-magenta">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {/* Continue / toasts */}
      {/* Mobile: travel questions sit in a cream sheet over the panel bottom (Figma 2308:11086). */}
      <footer className={`relative flex shrink-0 flex-col items-center gap-1.5 px-2 pb-2 pt-0.5 desk:p-[10px] ${travelSheet ? "max-desk:z-10 max-desk:-mt-[44px] max-desk:gap-6 max-desk:rounded-t-[44px] max-desk:bg-cream max-desk:pt-6" : ""}`}>
        {shown ? (
          // White fade over the panel bottom behind the toast (Figma 2308:3296).
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[260px] bg-gradient-to-t from-white/80 via-white/50 to-transparent max-desk:hidden" />
        ) : null}
        <div className="absolute inset-x-3 bottom-3 z-20 flex justify-center desk:inset-x-0 desk:bottom-[40px] desk:z-10 desk:px-[163px]">
        {shown === "interest" ? (
          <Toast
            variant="error"
            action={{ label: tr("I'm interested"), onClick: handleInterested }}
            onClose={() => setToast(null)}
          >
            {tr("This program is only for 19-26 year old individuals. To stay updated on upcoming programs you'll be eligible for, click on the I'm interested button.")}</Toast>
        ) : shown === "interest-failed" ? (
          <Toast
            variant="error"
            action={{ label: interestBusy ? tr("Sending…") : tr("Try again"), onClick: handleInterested }}
            onClose={() => setToast(null)}
          >
            {tr("We couldn't save your interest just now. Nothing was lost; please try again in a moment.")}</Toast>
        ) : shown === "submit-failed" ? (
          <Toast
            variant="error"
            action={{ label: submitting ? tr("One moment…") : tr("Try again"), onClick: handleSubmit }}
            onClose={() => onDismissError?.()}
          >
            {error}</Toast>
        ) : shown === "success" ? (
          <Toast variant="success" onClose={() => setToast(null)}>
            {tr("Your interest has been recorded, stay tuned for future programs. We hope to see you very soon!")}</Toast>
        ) : shown === "already-recorded" ? (
          <Toast variant="success" onClose={() => setToast(null)}>
            {tr("You're already on our interest list. Stay tuned for future programs.")}</Toast>
        ) : shown === "existing" ? (
          <Toast
            variant="error"
            action={{ label: linkBusy ? tr("Sending…") : tr("Email me my link"), onClick: handleResendLink }}
            onClose={() => setFollowup("closed")}
          >
            {tr("An application already exists for this email. We can send a single-use link to that address so you can continue where you left off.")}</Toast>
        ) : shown === "link-sent" ? (
          <Toast variant="success" onClose={() => setFollowup("closed")}>
            {tr("If that address has an application, a link to continue is on its way. It works once and expires in 30 minutes.")}</Toast>
        ) : shown === "link-failed" ? (
          <Toast variant="error" onClose={() => setFollowup("closed")}>
            {tr("We couldn't send the link just now. Please wait a moment and try again.")}</Toast>
        ) : null}
        </div>

        {travelSheet ? (
          <div className="flex w-full flex-col gap-6 desk:hidden">
            <SheetCheck
              label={tr("Can you travel out of the country you're located in")}
              checked={canTravel}
              onToggle={() => setCanTravel((v) => !v)}
            />
            <SheetCheck
              label={tr("Do you have a passport valid for six months after the dates of travel?")}
              checked={hasValidPassport}
              onToggle={() => setHasValidPassport((v) => !v)}
            />
          </div>
        ) : null}
        <Turnstile key={challengeKey} onToken={setTurnstileToken} size="compact" />
        <ContinueButton
          label={submitting ? tr("One moment…") : tr("Continue")}
          disabled={!canSubmit || submitting || shown !== null}
          onClick={handleSubmit}
          className={shown ? "pointer-events-none opacity-60 blur-[6px]" : ""}
        />
      </footer>
    </div>,
    document.body,
  );
}
