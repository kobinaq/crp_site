"use client";

import { type FormEvent, type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import LocaleLink from "@/components/LocaleLink";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { COUNTRIES, type Country } from "@/lib/countries";
import { CountryDropdown } from "../apply/CountryDropdown";
import { PLACEHOLDER } from "../apply/fieldStyles";
import { useText } from "@/lib/ui-text";
import { submitPartner } from "@/lib/actions";
import { useCopy, useLanguage } from "../LanguageProvider";
import { Turnstile } from "../Turnstile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const US = COUNTRIES.find((c) => c.code === "US") ?? COUNTRIES[0];

const FIELD =
  `${PLACEHOLDER} w-full rounded-[48px] border border-black/12 bg-white text-[14px] font-semibold uppercase tracking-[0.56px] text-black outline-none`;
const FIELD_SM = `${FIELD} h-[63px] px-6`;

const SUPPORT_INTENTS = ["ambassador", "storyline", "speaker"] as const;

function Caret({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`size-3 shrink-0 text-black/48 ${up ? "rotate-180" : ""}`} fill="none" aria-hidden>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RadioMark({ selected, lime = false }: { selected: boolean; lime?: boolean }) {
  return (
    <span
      className={`grid size-5 shrink-0 place-items-center rounded-full border bg-white ${
        selected && lime ? "border-2 border-lime" : "border-black/32"
      }`}
    >
      {selected ? <span className={`size-2.5 rounded-full ${lime ? "bg-lime" : "bg-black"}`} /> : null}
    </span>
  );
}

function CheckMark({ selected }: { selected: boolean }) {
  return (
    <span className={`grid size-5 shrink-0 place-items-center rounded-[8px] border border-black/32 ${selected ? "bg-black" : "bg-white"}`}>
      {selected ? (
        <svg viewBox="0 0 12 12" className="size-3 text-white" fill="none" aria-hidden>
          <path d="M2.5 6.2 4.8 8.5 9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function useMenu(open: boolean, onClose: () => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = triggerRef.current;
    if (!open || !anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      setBox({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-choice-menu]")) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return { triggerRef, box };
}

function MenuShell({
  open,
  box,
  label,
  children,
}: {
  open: boolean;
  box: { top: number; left: number; width: number } | null;
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  if (!open || !box || typeof document === "undefined") return null;
  return createPortal(
    <div
      data-choice-menu
      id={id}
      role="listbox"
      aria-label={label}
      style={{ top: box.top, left: box.left, width: box.width }}
      className="fixed z-[80] flex flex-col rounded-[24px] border border-black/12 bg-white px-[18px] py-1.5"
    >
      {children}
    </div>,
    document.body,
  );
}

function OptionRow({
  selected,
  onClick,
  children,
  mark,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
  mark: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="relative flex h-14 w-full items-center gap-3 rounded-[18px] text-left transition-colors hover:bg-[rgba(244,241,234,0.64)]"
    >
      {selected ? <span className="absolute inset-y-0 -left-3 -right-3 rounded-[18px] bg-[rgba(244,241,234,0.64)]" /> : null}
      <span className="relative">{mark}</span>
      <span className="relative min-w-0 flex-1 text-[20px] leading-[0.96] tracking-[-0.8px] text-black">{children}</span>
    </button>
  );
}

function FieldButton({
  label,
  value,
  open,
  onClick,
  buttonRef,
}: {
  label: string;
  value: string;
  open: boolean;
  onClick: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onClick}
      className="flex h-[63px] min-w-0 flex-1 items-center rounded-[48px] border border-black/12 bg-white pl-6 pr-8 text-left transition-colors hover:border-black/40"
    >
      {value ? (
        <span className="flex min-w-0 flex-1 flex-col justify-center pr-3">
          <span className="text-[10px] font-semibold uppercase leading-[0.9] tracking-[0.4px] text-black/48 mix-blend-hard-light">{label}</span>
          <span className="truncate text-[20px] font-normal leading-[1.2] tracking-[-0.8px] text-black">{value}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate pr-3 text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] text-black/48 mix-blend-hard-light">
          {label}
        </span>
      )}
      <Caret up={open} />
    </button>
  );
}

function SupportMenu({
  label,
  options,
  wholeOrg,
  picks,
  onWholeOrg,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  wholeOrg: boolean;
  picks: readonly number[];
  onWholeOrg: () => void;
  onToggle: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useMemo(() => () => setOpen(false), []);
  const { triggerRef, box } = useMenu(open, close);
  const value = wholeOrg
    ? options[0] ?? ""
    : picks.map((index) => options[index]).filter(Boolean).join(", ");

  return (
    <>
      <FieldButton label={label} value={value} open={open} onClick={() => setOpen((current) => !current)} buttonRef={triggerRef} />
      <MenuShell open={open} box={box} label={label}>
        <OptionRow selected={wholeOrg} onClick={onWholeOrg} mark={<RadioMark selected={wholeOrg} lime />}>
          {options[0] ?? ""}
        </OptionRow>
        <div className="my-1.5 h-px w-full bg-black/12" />
        {options.slice(1).map((option, index) => {
          const optionIndex = index + 1;
          const selected = picks.includes(optionIndex);
          return (
            <OptionRow key={option} selected={selected} onClick={() => onToggle(optionIndex)} mark={<CheckMark selected={selected} />}>
              {option}
            </OptionRow>
          );
        })}
      </MenuShell>
    </>
  );
}

function SponsorshipMenu({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useMemo(() => () => setOpen(false), []);
  const { triggerRef, box } = useMenu(open, close);

  return (
    <>
      <FieldButton label={label} value={value} open={open} onClick={() => setOpen((current) => !current)} buttonRef={triggerRef} />
      <MenuShell open={open} box={box} label={label}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <OptionRow
              key={option}
              selected={selected}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              mark={<RadioMark selected={selected} />}
            >
              {option}
            </OptionRow>
          );
        })}
      </MenuShell>
    </>
  );
}

function initialSupport(intent: string | null) {
  const index = SUPPORT_INTENTS.indexOf(intent as (typeof SUPPORT_INTENTS)[number]);
  if (index === -1) return { wholeOrg: true, picks: [] as number[] };
  return { wholeOrg: false, picks: [index + 1] };
}

export function PartnerReachPage() {
  const copy = useCopy();
  const { locale } = useLanguage();
  const tr = useText();
  const params = useSearchParams();
  const form = copy.partnerPage.reachOutForm;
  const starting = initialSupport(params.get("support"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [organization, setOrganization] = useState("");
  const [designation, setDesignation] = useState("");
  const [wholeOrg, setWholeOrg] = useState(starting.wholeOrg);
  const [picks, setPicks] = useState<number[]>(starting.picks);
  const [sponsorship, setSponsorship] = useState("");
  const [message, setMessage] = useState("");
  const [dial, setDial] = useState<Country>(US);
  const [step, setStep] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supportLabel = wholeOrg
    ? form.supportOptions[0] ?? ""
    : picks.map((index) => form.supportOptions[index]).filter(Boolean).join(", ");

  const aboutReady =
    name.trim().length > 1 &&
    EMAIL_RE.test(email.trim()) &&
    mobile.trim().length > 5 &&
    organization.trim().length > 1 &&
    designation.trim().length > 1;

  const ready = useMemo(
    () =>
      name.trim().length > 1 &&
      EMAIL_RE.test(email.trim()) &&
      mobile.trim().length > 5 &&
      organization.trim().length > 1 &&
      designation.trim().length > 1 &&
      supportLabel.length > 0,
    [name, email, mobile, organization, designation, supportLabel],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitting || sent) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitPartner({
        name: name.trim(),
        email: email.trim(),
        phone: mobile.trim() ? `${dial.dial} ${mobile.trim()}` : undefined,
        organization: organization.trim(),
        designation: designation.trim(),
        support: supportLabel,
        sponsorship: sponsorship.trim() || undefined,
        message: message.trim() || undefined,
        locale,
        turnstileToken,
      });
      if (!result.ok) {
        setError(
          result.reason === "turnstile"
            ? tr("Please complete the security check and try again.")
            : result.reason === "rate_limited"
              ? tr("Too many attempts from this connection. Please wait a little while and try again.")
              : tr("Please check your details and try again."),
        );
        setSubmitting(false);
        return;
      }
      setSent(true);
    } catch (err) {
      console.error("[partner] submit failed", err);
      setError(tr("Something went wrong. Please try again."));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-cream px-3 pb-2 pt-0 desk:px-16 desk:pb-6 desk:pt-0">
      <header className="flex h-[68px] shrink-0 items-center justify-between px-5 desk:h-[88px] desk:px-0">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep(0)}
            aria-label={tr("Back")}
            className="grid size-8 place-items-center rounded-full bg-white desk:hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/apply/arrow-left.svg" alt="" width={16} height={16} className="size-4" />
          </button>
        ) : null}
        <LocaleLink
          href="/partner"
          aria-label={tr("Back")}
          className={`grid size-8 place-items-center rounded-full bg-white desk:size-10 ${step > 0 ? "hidden desk:grid" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/apply/arrow-left.svg" alt="" width={16} height={16} className="size-4 desk:size-6" />
        </LocaleLink>
        <LanguageSwitch />
      </header>

      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col items-center">
        <div className="flex w-full max-w-[1072px] min-w-0 flex-1 flex-col items-center overflow-x-hidden rounded-[88px] bg-white px-6 py-8 desk:rounded-[154px] desk:px-10 desk:py-16">
          <div className="flex w-full max-w-[632px] flex-1 flex-col items-center justify-between gap-8">
            <div className="flex w-full flex-col items-center gap-4 text-center text-black desk:gap-6">
              <h1 className="text-[28px] leading-[0.9] tracking-[-1.12px] desk:text-[48px] desk:tracking-[-1.92px]">
                <span className="desk:hidden">{step === 0 ? form.title : form.sponsorshipDetails}</span>
                <span className="hidden desk:inline">{form.title}</span>
              </h1>
              <p className={`max-w-[545px] text-[20px] leading-[0.9] tracking-[-0.8px] desk:text-[32px] desk:tracking-[-1.28px] ${step === 0 ? "" : "hidden desk:block"}`}>
                {form.body}
              </p>
            </div>

            <div className={`w-full flex-col gap-2 ${step === 0 ? "flex" : "hidden desk:flex"}`}>
              <input
                required
                name="name"
                autoComplete="name"
                placeholder={form.name}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label={form.name}
                className={FIELD_SM}
              />
              <div className="flex min-w-0 flex-col gap-2 desk:flex-row">
                <input
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder={form.email}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-label={form.email}
                  className={`${FIELD_SM} desk:min-w-0 desk:flex-1`}
                />
                <div className={`${FIELD_SM} flex min-w-0 items-center gap-4 pl-4 pr-6 desk:w-[312px]`}>
                  <CountryDropdown variant="inline" value={dial} onChange={setDial} />
                  <input
                    required
                    type="tel"
                    name="mobile"
                    autoComplete="tel"
                    placeholder={form.mobile}
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value)}
                    aria-label={form.mobile}
                    className={`${PLACEHOLDER} min-w-0 flex-1 bg-transparent text-[14px] font-semibold uppercase tracking-[0.56px] text-black outline-none`}
                  />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2 desk:flex-row">
                <input
                  required
                  name="organization"
                  autoComplete="organization"
                  placeholder={form.organization}
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                  aria-label={form.organization}
                  className={`${FIELD_SM} desk:min-w-0 desk:flex-1`}
                />
                <input
                  required
                  name="designation"
                  autoComplete="organization-title"
                  placeholder={form.designation}
                  value={designation}
                  onChange={(event) => setDesignation(event.target.value)}
                  aria-label={form.designation}
                  className={`${FIELD_SM} desk:min-w-0 desk:flex-1`}
                />
              </div>
            </div>
            <div className={`w-full flex-col gap-2 ${step === 1 ? "flex" : "hidden desk:flex"}`}>
              <div className="flex min-w-0 flex-col gap-2 desk:flex-row">
                <SupportMenu
                  label={form.support}
                  options={form.supportOptions}
                  wholeOrg={wholeOrg}
                  picks={picks}
                  onWholeOrg={() => {
                    setWholeOrg(true);
                    setPicks([]);
                  }}
                  onToggle={(index) => {
                    setWholeOrg(false);
                    setPicks((current) =>
                      current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort(),
                    );
                  }}
                />
                <SponsorshipMenu
                  label={form.sponsorship}
                  options={form.sponsorshipOptions}
                  value={sponsorship}
                  onChange={setSponsorship}
                />
              </div>
              <textarea
                name="message"
                placeholder={form.message}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                aria-label={form.message}
                className={`${FIELD} h-[145px] resize-none rounded-[31.5px] px-6 py-6`}
              />
            </div>
          </div>
        </div>

        <Turnstile onToken={setTurnstileToken} size="compact" />
        {sent ? (
          <p className="mt-2 text-center text-[16px] leading-[0.9] text-black">{form.sent}</p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-center text-[13px] text-magenta">{error}</p>
        ) : null}
        <button
          type="button"
          disabled={!aboutReady || submitting || sent}
          onClick={() => setStep(1)}
          className={`relative mt-2 h-16 w-full items-center justify-center overflow-hidden rounded-full text-[15px] font-semibold uppercase leading-[0.9] tracking-[0.6px] text-white mix-blend-hard-light transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:opacity-100 desk:hidden ${step === 0 ? "flex" : "hidden"}`}
        >
          <span aria-hidden className="absolute inset-0 rounded-full bg-black opacity-32" />
          <span aria-hidden className="absolute inset-y-0 left-0 w-1/2 overflow-hidden rounded-full">
            <span className="gradient-brand absolute inset-y-0 left-0 w-[200%]" />
          </span>
          <span className="relative">{form.continue}</span>
        </button>
        <button
          type="submit"
          disabled={!ready || submitting || sent}
          className={`relative mt-2 h-16 w-full items-center justify-center overflow-hidden rounded-full text-[15px] font-semibold uppercase leading-[0.9] tracking-[0.6px] text-white mix-blend-hard-light transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 desk:hidden ${
            step === 1 ? "flex" : "hidden"
          } ${ready ? "gradient-brand" : "gradient-brand opacity-32"}`}
        >
          {form.continue}
        </button>
        <button
          type="submit"
          disabled={!ready || submitting || sent}
          className={`mt-4 hidden h-16 w-full max-w-[632px] items-center justify-center rounded-full text-[18px] font-semibold uppercase leading-[0.9] tracking-[0.72px] text-white mix-blend-hard-light transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 desk:mt-2 desk:flex desk:h-20 desk:text-[20px] desk:tracking-[0.8px] ${
            ready ? "gradient-brand" : "gradient-brand opacity-32"
          }`}
        >
          {form.continue}
        </button>
      </form>
    </div>
  );
}
