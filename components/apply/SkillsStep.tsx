"use client";

import { useText } from "@/lib/ui-text";

import { APPLY_SKILLS } from "@/lib/apply-skills";
import { useLanguage } from "../LanguageProvider";
import { ContinueButton } from "./ContinueButton";
import { FormShell } from "./FormShell";
import { LimeCheck } from "./LimeCheck";

function Ear({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 19.125 19.125"
      preserveAspectRatio="none"
      className={`block ${className}`}
      aria-hidden
    >
      <path
        d="M0 0C0 10.5624 8.56255 19.125 19.125 19.125H0V0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SkillTab({ label, selected }: { label: string; selected: boolean }) {
  const tone = selected ? "text-black" : "text-white";
  const text = selected ? "text-lime" : "text-black/72 mix-blend-hard-light";
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 -bottom-px z-10 flex justify-center ${tone}`}
    >
      <div className="relative flex items-end max-desk:max-w-full">
        <span aria-hidden className="absolute inset-x-0 -bottom-px h-[3px] bg-current" />
        <Ear className="h-[19px] w-[19px] shrink-0 -mr-[2px] -scale-y-100 rotate-180" />
        <span className="relative z-[1] inline-flex min-h-[38px] max-w-[160px] max-desk:min-w-0 items-center justify-center rounded-t-[19px] bg-current px-5 py-3 text-center text-[12px] max-desk:px-4 font-semibold uppercase leading-[1.2] tracking-[0.48px] desk:max-w-none desk:whitespace-nowrap">
          <span className={text}>{label}</span>
        </span>
        <Ear className="h-[19px] w-[19px] shrink-0 -ml-[2px]" />
      </div>
    </div>
  );
}

export function SkillsStep({
  selected,
  onChange,
  onBack,
  onContinue,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const tr = useText();
  const { locale } = useLanguage();
  const count = selected.length;

  const toggle = (label: string) => {
    onChange(
      selected.includes(label)
        ? selected.filter((item) => item !== label)
        : [...selected, label],
    );
  };

  return (
    <FormShell
      fill
      wide
      onBack={onBack}
      footer={
        <ContinueButton
          label={tr("Continue")}
          selectedCount={count}
          progress={0.5}
          disabled={count === 0}
          onClick={onContinue}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col desk:gap-8">
        <div className="shrink-0 p-8 text-center desk:p-0">
          <h1 className="text-[28px] leading-[0.9] tracking-[-1.12px] text-black desk:text-[48px] desk:tracking-[-1.92px]">
            {tr("Got skills, experience, or genuine curiosity in any of these?")}</h1>
          <p className="mt-4 text-[20px] leading-[0.9] tracking-[-0.8px] text-black desk:mt-6 desk:text-[32px] desk:tracking-[-1.28px] desk:text-black/86">
            {tr("Select the ones that apply")}</p>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto rounded-t-[44px] pb-10 desk:pb-16">
          <div className="grid min-w-0 grid-cols-2 desk:grid-cols-3">
            {APPLY_SKILLS.map((skill) => {
              const on = selected.includes(skill.en);
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggle(skill.en)}
                  aria-pressed={on}
                  className={`relative aspect-square overflow-hidden rounded-[44px] ${
                    on ? "border-2 border-black" : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={skill.image}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                  <span
                    aria-hidden
                    className={`absolute left-[22px] top-[22px] z-10 grid size-8 place-items-center rounded-full border border-white desk:left-6 desk:top-6 ${
                      on ? "bg-black text-lime" : "bg-white"
                    }`}
                  >
                    {on ? (
                      <>
                        {/* Figma mobile 2308:10381: lime dot; desktop keeps the check. */}
                        <span aria-hidden className="size-3 rounded-full bg-lime desk:hidden" />
                        <LimeCheck className="hidden size-3.5 desk:block" />
                      </>
                    ) : null}
                  </span>
                  <SkillTab label={skill[locale]} selected={on} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </FormShell>
  );
}
