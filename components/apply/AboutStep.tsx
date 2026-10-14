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
import { FIELD, FIELD_LG, MINI_LABEL, PLACEHOLDER, VALUE_LG } from "./fieldStyles";

// Text pill with a floating label once filled (Figma 2308:2967): placeholder
// label when empty, small label above the value when filled. Presentation only.
function FloatInput({
  label,
  className = "",
  ...input
}: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const filled = String(input.value ?? "").length > 0;
  return (
    <label className={`${FIELD} ${FIELD_LG} min-w-0 flex-col items-start justify-center pl-5 pr-6 desk:pl-6 desk:pr-8 ${className}`}>
      {filled ? <span className={MINI_LABEL}>{label}</span> : null}
      <input
        {...input}
        placeholder={label}
        className={`w-full min-w-0 bg-transparent outline-none ${VALUE_LG} ${PLACEHOLDER} ${filled ? "mt-0.5" : ""}`}
      />
    </label>
  );
}

type ToastKind = "interest" | "success" | "already-recorded" | "existing" | "link-sent" | "link-failed";

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
  skills,
  existing = false,
}: {
  onBack: () => void;
  onSubmit: (data: AboutData) => void;
  submitting: boolean;
  error: string | null;
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
  const shown = resumeToast ?? toast;

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
    setInterestBusy(true);
    try {
      const age = ageFromDob(dob);
      const res = await submitInterest({
        email: email.trim(),
        name: fullName.trim() || undefined,
        ageGroup: age < minApplicantAge() ? "under_19" : "19_plus",
        track: track ?? undefined,
        source: "apply_form",
        turnstileToken,
      });
      if (!res.ok) {
        setInterestBusy(false);
        return;
      }
      setToast(res.status === "already_recorded" ? "already-recorded" : "success");
      window.setTimeout(() => router.push(localePath("/", locale)), 3000);
    } catch (err) {
      console.error("[apply] interest failed", err);
      setInterestBusy(false);
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
      <header className="flex shrink-0 items-center justify-between px-4 py-2.5 desk:h-[88px] desk:px-16 desk:py-6">
        <button
          type="button"
          onClick={onBack}
          aria-label={tr("Back")}
          className="grid size-9 place-items-center rounded-full bg-white shadow-sm desk:size-10"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/apply/arrow-left.svg" alt="" width={20} height={20} className="size-5 desk:size-6" />
        </button>

        <div className="flex items-center rounded-full bg-white p-1">
          {applicationLocales.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`h-7 rounded-full px-3.5 text-[12px] font-semibold uppercase tracking-[0.04em] transition-colors desk:h-8 desk:min-w-[52px] desk:px-3 desk:text-[14px] desk:tracking-[0.56px] ${
                locale === code ? "bg-black text-white" : "bg-transparent text-black/50"
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </header>

      {/* Card */}
      <main className="flex min-h-0 flex-1 items-center justify-center px-3 pb-2 desk:items-stretch desk:px-16 desk:pb-0">
        <div className="flex max-h-full w-full min-w-0 max-w-[1072px] flex-col rounded-[36px] bg-white px-5 py-5 desk:h-full desk:rounded-[154px] desk:px-10 desk:py-16">
          <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-[632px] flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <h1 className="text-center text-[26px] leading-[0.9] tracking-[-1.04px] text-black desk:text-[48px] desk:tracking-[-1.92px]">
              {tr("More about you")}</h1>

            <div className="mt-5 flex flex-col gap-1.5 desk:my-auto desk:gap-2 desk:pt-14">
              {/* Name + DOB */}
              <div className="flex min-w-0 flex-col gap-1.5 desk:flex-row desk:gap-2">
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
              <div className="flex min-w-0 flex-col gap-1.5 desk:flex-row desk:gap-2">
                <FloatInput
                  label={tr("*EMAIL")}
                  className="shrink-0 desk:shrink desk:flex-1"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label={tr("Email")}
                  spellCheck={false}
                />
                <div className={`${FIELD} ${FIELD_LG} min-w-0 gap-3 pl-3 pr-5 desk:w-[312px] desk:shrink-0 desk:gap-4 desk:pl-4 desk:pr-10`}>
                  <CountryDropdown variant="inline" size="lg" value={dialCountry} onChange={setDialCountry} />
                  <label className="flex min-w-0 flex-1 flex-col items-start justify-center">
                    {mobile ? <span className={MINI_LABEL}>{tr("MOBILE")}</span> : null}
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder={tr("MOBILE")}
                      aria-label={tr("Mobile number")}
                      className={`w-full min-w-0 bg-transparent outline-none ${VALUE_LG} ${PLACEHOLDER} ${mobile ? "mt-0.5" : ""}`}
                    />
                  </label>
                </div>
              </div>

              {/* Nationality + based in */}
              <div className="flex min-w-0 flex-col gap-1.5 desk:flex-row desk:gap-2">
                <CountryDropdown variant="field" size="lg" label={tr("Nationality")} value={nationality} onChange={setNationality} />
                <CountryDropdown variant="field" size="lg" label={tr("Currently based in")} value={basedIn} onChange={setBasedIn} />
              </div>

              {/* Program radios */}
              <div className="mt-0.5 flex min-w-0">
                <FormRadioCard label={tr("Only program")} selected={track === "online"} onSelect={() => setTrack("online")} />
                <FormRadioCard label={tr("Travel to Antalya")} selected={track === "in_person"} onSelect={() => setTrack("in_person")} />
              </div>

              {track === "in_person" ? (
                <div className="mt-6 flex flex-col gap-1.5 desk:mt-[60px] desk:gap-0.5">
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

              {error ? (
                <p role="alert" className="text-center text-[13px] text-magenta">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {/* Continue / toasts */}
      <footer className="relative flex shrink-0 flex-col items-center gap-1.5 px-2.5 pb-2.5 pt-1 desk:p-[10px]">
        {shown ? (
          // White fade over the panel bottom behind the toast (Figma 2308:3296).
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[260px] bg-gradient-to-t from-white/80 via-white/50 to-transparent max-desk:hidden" />
        ) : null}
        <div className="relative z-10 flex w-full justify-center desk:absolute desk:inset-x-0 desk:bottom-[40px] desk:px-[163px]">
        {shown === "interest" ? (
          <Toast
            variant="error"
            action={{ label: tr("I'm interested"), onClick: handleInterested }}
            onClose={() => setToast(null)}
          >
            {tr("This program is only for 19-26 year old individuals. To stay updated on upcoming programs you'll be eligible for, click on the I'm interested button.")}</Toast>
        ) : shown === "success" ? (
          <Toast variant="success" onClose={() => setToast(null)}>
            {tr("Your interest has been recorded, stay tuned for future programs. We hope to see you very soon!")}</Toast>
        ) : shown === "already-recorded" ? (
          <Toast variant="success" onClose={() => setToast(null)}>
            {tr("You're already on our interest list. We've emailed you a link in case you want to update your details.")}</Toast>
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
