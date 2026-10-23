"use client";

import { useText } from "@/lib/ui-text";

import { useState } from "react";
import { COUNTRIES, type Country } from "@/lib/countries";
import { CountryDropdown } from "../apply/CountryDropdown";
import { DateField } from "../apply/DateField";
import { FormShell } from "../apply/FormShell";
import { FormRadioCard } from "../apply/FormRadioCard";
import { ContinueButton } from "../apply/ContinueButton";
import { NOMINATE_DRAFT, asCountry, asNullable, asOneOf, asText } from "@/lib/formDraft";
import { useDraftState } from "@/lib/useFormDraft";
import { FIELD, FIELD_M, PLACEHOLDER, PLACEHOLDER_M } from "../apply/fieldStyles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GHANA = COUNTRIES.find((c) => c.code === "GH") ?? COUNTRIES[0];

export type NomineeData = {
  nomineeName: string;
  nomineeEmail: string;
  nomineeDob: string;
  nomineePhone?: string;
  nomineeNationality?: string;
  nomineeBasedIn?: string;
  track: "in_person" | "online";
};

export function NomineeStep({
  onBack,
  onContinue,
  initial,
}: {
  onBack: () => void;
  onContinue: (data: NomineeData) => void;
  initial?: Partial<NomineeData>;
}) {
  const tr = useText();
  // Typed answers live in the session draft so they survive a language switch.
  const [name, setName] = useDraftState(NOMINATE_DRAFT, "nominee.name", initial?.nomineeName ?? "", asText);
  const [email, setEmail] = useDraftState(NOMINATE_DRAFT, "nominee.email", initial?.nomineeEmail ?? "", asText);
  const [dob, setDob] = useDraftState(NOMINATE_DRAFT, "nominee.dob", initial?.nomineeDob ?? "", asText);
  const [emailTouched, setEmailTouched] = useState(false);
  const [dialCountry, setDialCountry] = useDraftState<Country>(NOMINATE_DRAFT, "nominee.dialCountry", GHANA, asCountry);
  const [mobile, setMobile] = useDraftState(NOMINATE_DRAFT, "nominee.mobile", "", asText);
  const [nationality, setNationality] = useDraftState<Country | null>(NOMINATE_DRAFT, "nominee.nationality", null, asNullable(asCountry));
  const [basedIn, setBasedIn] = useDraftState<Country | null>(NOMINATE_DRAFT, "nominee.basedIn", null, asNullable(asCountry));
  // No default track (Figma 2308:9574): the nominee's program must be chosen explicitly.
  const [track, setTrack] = useDraftState<"in_person" | "online" | null>(NOMINATE_DRAFT, "nominee.track", initial?.track ?? null, asNullable(asOneOf(["in_person", "online"] as const)));
  const [trackError, setTrackError] = useState(false);
  const chooseTrack = (t: "in_person" | "online") => {
    setTrack(t);
    setTrackError(false);
  };

  const valid =
    name.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dob);
  const emailError = emailTouched && email.trim().length > 0 && !EMAIL_RE.test(email.trim());

  return (
    <FormShell
      onBack={onBack}
      mobileCard
      footer={
        <ContinueButton
          label={tr("Continue")}
          progress={0.5}
          disabled={!valid}
          className="max-desk:h-16"
          onClick={() => {
            if (!valid) return;
            if (!track) {
              setTrackError(true);
              return;
            }
            onContinue({
              nomineeName: name.trim(),
              nomineeEmail: email.trim(),
              nomineeDob: dob,
              nomineePhone: mobile.trim()
                ? `${dialCountry.dial} ${mobile.trim()}`
                : undefined,
              nomineeNationality: nationality?.name,
              nomineeBasedIn: basedIn?.name,
              track,
            });
          }}
        />
      }
    >
      <h1 className="text-center text-[26px] leading-[0.9] tracking-[-1.04px] text-black max-desk:mt-[30px] max-desk:text-[28px] max-desk:tracking-[-1.12px] desk:text-[36px] desk:tracking-[-1.44px]">
        {tr("About the nominee")}</h1>

      <div className="mt-5 flex flex-col gap-1.5 max-desk:mt-[44px] max-desk:gap-2 max-desk:px-6 desk:mt-7 desk:gap-2">
        <div className="flex min-w-0 flex-col gap-1.5 max-desk:gap-2 desk:flex-row desk:gap-2">
          <div className={`${FIELD} ${FIELD_M} min-w-0 shrink-0 pl-5 pr-6 max-desk:pl-6 desk:shrink desk:flex-1`}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("*NAME")}
              aria-label={tr("Nominee full name")}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER} ${PLACEHOLDER_M}`}
            />
          </div>
          <DateField value={dob} onChange={setDob} className="desk:w-[206px]" mobileTall />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 max-desk:gap-2 desk:flex-row desk:gap-2">
          <div className={`${FIELD} ${FIELD_M} min-w-0 shrink-0 pl-5 pr-6 max-desk:pl-6 desk:shrink desk:flex-1`}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder={tr("*EMAIL")}
              aria-label={tr("Nominee email")}
              aria-invalid={emailError || undefined}
              aria-describedby={emailError ? "nominee-email-error" : undefined}
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
              aria-label={tr("Nominee mobile number")}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER} ${PLACEHOLDER_M}`}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 max-desk:gap-2 desk:flex-row desk:gap-2">
          <CountryDropdown
            variant="field"
            label={tr("Nationality")}
            value={nationality}
            onChange={setNationality}
            mobileTall
          />
          <CountryDropdown
            variant="field"
            label={tr("Currently based in")}
            value={basedIn}
            onChange={setBasedIn}
            mobileTall
          />
        </div>

        <div
          role="group"
          aria-label={tr("Program")}
          aria-describedby={trackError ? "nominee-track-error" : undefined}
          className="mt-0.5 flex min-w-0 gap-1.5 max-desk:mt-0 max-desk:gap-[2px] desk:gap-2"
        >
          <FormRadioCard
            label={tr("Only program")}
            selected={track === "online"}
            onSelect={() => chooseTrack("online")}
            mobileTall
          />
          <FormRadioCard
            label={tr("Travel to Antalya")}
            selected={track === "in_person"}
            onSelect={() => chooseTrack("in_person")}
            mobileTall
          />
        </div>
        {emailError ? (
          <p id="nominee-email-error" role="alert" className="text-center text-[13px] text-magenta">
            {tr("Enter a valid email")}
          </p>
        ) : null}
        {trackError ? (
          <p id="nominee-track-error" role="alert" className="text-center text-[13px] text-magenta">
            {tr("Please choose a program.")}
          </p>
        ) : null}
      </div>
    </FormShell>
  );
}
