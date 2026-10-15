"use client";

import { useText } from "@/lib/ui-text";

import { useState } from "react";
import { COUNTRIES, type Country } from "@/lib/countries";
import { CountryDropdown } from "../apply/CountryDropdown";
import { DateField } from "../apply/DateField";
import { FormShell } from "../apply/FormShell";
import { FormRadioCard } from "../apply/FormRadioCard";
import { ContinueButton } from "../apply/ContinueButton";
import { FIELD, PLACEHOLDER } from "../apply/fieldStyles";

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
  const [name, setName] = useState(initial?.nomineeName ?? "");
  const [email, setEmail] = useState(initial?.nomineeEmail ?? "");
  const [dob, setDob] = useState(initial?.nomineeDob ?? "");
  const [dialCountry, setDialCountry] = useState<Country>(GHANA);
  const [mobile, setMobile] = useState("");
  const [nationality, setNationality] = useState<Country | null>(null);
  const [basedIn, setBasedIn] = useState<Country | null>(null);
  const [track, setTrack] = useState<"in_person" | "online">(
    initial?.track ?? "in_person",
  );

  const valid =
    name.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dob);

  return (
    <FormShell
      onBack={onBack}
      footer={
        <ContinueButton
          label={tr("Continue")}
          disabled={!valid}
          onClick={() => {
            if (!valid) return;
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
      <h1 className="text-center text-[26px] leading-[0.9] tracking-[-1.04px] text-black desk:text-[36px] desk:tracking-[-1.44px]">
        {tr("About the nominee")}</h1>

      <div className="mt-5 flex flex-col gap-1.5 desk:mt-7 desk:gap-2">
        <div className="flex min-w-0 flex-col gap-1.5 desk:flex-row desk:gap-2">
          <div className={`${FIELD} min-w-0 shrink-0 pl-5 pr-6 desk:shrink desk:flex-1`}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("*NAME")}
              aria-label={tr("Nominee full name")}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER}`}
            />
          </div>
          <DateField value={dob} onChange={setDob} className="desk:w-[206px]" />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 desk:flex-row desk:gap-2">
          <div className={`${FIELD} min-w-0 shrink-0 pl-5 pr-6 desk:shrink desk:flex-1`}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr("*EMAIL")}
              aria-label={tr("Nominee email")}
              spellCheck={false}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER}`}
            />
          </div>
          <div className={`${FIELD} min-w-0 gap-3 pl-3 pr-5 desk:w-[312px]`}>
            <CountryDropdown variant="inline" value={dialCountry} onChange={setDialCountry} />
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder={tr("MOBILE")}
              aria-label={tr("Nominee mobile number")}
              className={`w-full bg-transparent text-[15px] text-black outline-none ${PLACEHOLDER}`}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 desk:flex-row desk:gap-2">
          <CountryDropdown
            variant="field"
            label={tr("Nationality")}
            value={nationality}
            onChange={setNationality}
          />
          <CountryDropdown
            variant="field"
            label={tr("Currently based in")}
            value={basedIn}
            onChange={setBasedIn}
          />
        </div>

        <div className="mt-0.5 flex min-w-0 gap-1.5 desk:gap-2">
          <FormRadioCard
            label={tr("Only program")}
            selected={track === "online"}
            onSelect={() => setTrack("online")}
          />
          <FormRadioCard
            label={tr("Travel to Antalya")}
            selected={track === "in_person"}
            onSelect={() => setTrack("in_person")}
          />
        </div>
      </div>
    </FormShell>
  );
}
