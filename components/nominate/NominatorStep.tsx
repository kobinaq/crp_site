"use client";

import { useText } from "@/lib/ui-text";

import { useState } from "react";
import { COUNTRIES, type Country } from "@/lib/countries";
import { CountryDropdown } from "../apply/CountryDropdown";
import { FormShell } from "../apply/FormShell";
import { Toast } from "../apply/Toast";
import { ContinueButton } from "../apply/ContinueButton";
import { Turnstile, TURNSTILE_SITE_KEY } from "../Turnstile";
import { NOMINATE_DRAFT, asCountry, asText } from "@/lib/formDraft";
import { useDraftState } from "@/lib/useFormDraft";
import { FIELD, FIELD_M, PLACEHOLDER, PLACEHOLDER_M } from "../apply/fieldStyles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GHANA = COUNTRIES.find((c) => c.code === "GH") ?? COUNTRIES[0];

export type NominatorData = {
  nominatorName: string;
  nominatorEmail: string;
  nominatorPhone?: string;
  nominatorOrganization: string;
  nominatorRelation: string;
  turnstileToken?: string | null;
};

export function NominatorStep({
  onBack,
  onSubmit,
  submitting,
  error,
  retryable = false,
  onDismissError,
}: {
  onBack: () => void;
  onSubmit: (data: NominatorData) => void;
  submitting: boolean;
  error: string | null;
  // Server/network failure: show the error as a toast with Try again (like Apply).
  retryable?: boolean;
  onDismissError?: () => void;
}) {
  const tr = useText();
  // Typed answers live in the session draft so they survive a language switch.
  const [name, setName] = useDraftState(NOMINATE_DRAFT, "nominator.name", "", asText);
  const [email, setEmail] = useDraftState(NOMINATE_DRAFT, "nominator.email", "", asText);
  const [dialCountry, setDialCountry] = useDraftState<Country>(NOMINATE_DRAFT, "nominator.dialCountry", GHANA, asCountry);
  const [mobile, setMobile] = useDraftState(NOMINATE_DRAFT, "nominator.mobile", "", asText);
  const [organization, setOrganization] = useDraftState(NOMINATE_DRAFT, "nominator.organization", "", asText);
  const [relation, setRelation] = useDraftState(NOMINATE_DRAFT, "nominator.relation", "", asText);
  const [emailTouched, setEmailTouched] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const valid =
    name.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    organization.trim().length > 0 &&
    relation.trim().length > 0;
  const emailError = emailTouched && email.trim().length > 0 && !EMAIL_RE.test(email.trim());
  const turnstileReady = !TURNSTILE_SITE_KEY || Boolean(turnstileToken);
  const canSubmit = valid && turnstileReady && !submitting;

  // Any server reply spends the single-use Turnstile token: re-issue the
  // challenge whenever a new error arrives so Try again has a fresh one.
  const [challengeKey, setChallengeKey] = useState(0);
  const [seenError, setSeenError] = useState<string | null>(null);
  if (error !== seenError) {
    setSeenError(error);
    if (error) {
      setTurnstileToken(null);
      setChallengeKey((k) => k + 1);
    }
  }

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      nominatorName: name.trim(),
      nominatorEmail: email.trim(),
      // Optional: the nominations API and table accept a missing phone.
      nominatorPhone: mobile.trim() ? `${dialCountry.dial} ${mobile.trim()}` : undefined,
      nominatorOrganization: organization.trim(),
      nominatorRelation: relation.trim(),
      turnstileToken,
    });
  };

  return (
    <FormShell
      onBack={onBack}
      mobileCard
      footer={
        <>
          {error && retryable ? (
            <Toast
              variant="error"
              action={{ label: submitting ? tr("One moment…") : tr("Try again"), onClick: submit }}
              onClose={() => onDismissError?.()}
            >
              {error}
            </Toast>
          ) : error ? (
            <p role="alert" className="text-center text-[13px] text-magenta">
              {error}
            </p>
          ) : null}
          <Turnstile key={challengeKey} onToken={setTurnstileToken} size="compact" />
          <ContinueButton
            label={submitting ? tr("One moment…") : tr("Continue")}
            progress={1}
            disabled={!canSubmit || Boolean(error && retryable)}
            onClick={submit}
            className={`max-desk:h-16 ${error && retryable ? "pointer-events-none opacity-60 blur-[6px]" : ""}`}
          />
        </>
      }
    >
      <h1 className="text-center text-[26px] leading-[0.9] tracking-[-1.04px] text-black max-desk:mt-[30px] max-desk:text-[28px] max-desk:tracking-[-1.12px] desk:text-[36px] desk:tracking-[-1.44px]">
        {tr("About you")}</h1>
      <p className="mx-auto mt-4 max-w-[280px] px-2 max-desk:pb-8 text-center text-[20px] leading-[0.9] tracking-[-0.8px] text-black desk:hidden">
        {tr("We will reach out to you for your confirmation via email or a call")}
      </p>

      <div className="mt-5 flex flex-col gap-1.5 max-desk:my-auto max-desk:gap-2 max-desk:px-6 max-desk:py-8 desk:mt-7 desk:gap-2">
        <div className={`${FIELD} ${FIELD_M} pl-5 pr-6 max-desk:pl-6`}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("*NAME")}
            aria-label={tr("Your full name")}
            className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER} ${PLACEHOLDER_M}`}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 max-desk:gap-2 desk:flex-row desk:gap-2">
          <div className={`${FIELD} ${FIELD_M} min-w-0 shrink-0 pl-5 pr-6 max-desk:pl-6 desk:shrink desk:flex-1`}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder={tr("*EMAIL")}
              aria-label={tr("Your email")}
              aria-invalid={emailError || undefined}
              aria-describedby={emailError ? "nominator-email-error" : undefined}
              spellCheck={false}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER} ${PLACEHOLDER_M}`}
            />
          </div>
          <div className={`${FIELD} ${FIELD_M} min-w-0 gap-3 pl-3 pr-5 max-desk:pl-4 desk:w-[312px]`}>
            <CountryDropdown variant="inline" value={dialCountry} onChange={setDialCountry} mobileTall />
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder={tr("MOBILE")}
              aria-label={tr("Your mobile number")}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER} ${PLACEHOLDER_M}`}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 max-desk:gap-2 desk:flex-row desk:gap-2">
          <div className={`${FIELD} ${FIELD_M} min-w-0 shrink-0 pl-5 pr-6 max-desk:pl-6 desk:shrink desk:flex-1`}>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder={tr("*ORGANIZATION")}
              aria-label={tr("Organization")}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER} ${PLACEHOLDER_M}`}
            />
          </div>
          <div className={`${FIELD} ${FIELD_M} min-w-0 shrink-0 pl-5 pr-6 max-desk:pl-6 desk:shrink desk:flex-1`}>
            <input
              type="text"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder={tr("*RELATION TO NOMINEE")}
              aria-label={tr("Relation to nominee")}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER} ${PLACEHOLDER_M}`}
            />
          </div>
        </div>
        {emailError ? (
          <p id="nominator-email-error" role="alert" className="text-center text-[13px] text-magenta">
            {tr("Enter a valid email")}
          </p>
        ) : null}
      </div>
    </FormShell>
  );
}
