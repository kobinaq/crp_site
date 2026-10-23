"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { COUNTRIES, type Country } from "@/lib/countries";
import {
  CONTACT_PAGE_FEEDBACK,
  HONEYPOT_FIELD,
  REASON_LEAF,
  parseContactBody,
  parseContactName,
  parseDial,
  parseNational,
} from "@/lib/contact/model";
import { submitContact } from "@/lib/actions";
import { trail } from "@/lib/fonts";
import { CountryDropdown } from "../apply/CountryDropdown";
import { useCopy, useLanguage } from "../LanguageProvider";
import { Turnstile, TURNSTILE_SITE_KEY } from "../Turnstile";

function useDesk() {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setDesk(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return desk;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const US = COUNTRIES.find((c) => c.code === "US") ?? COUNTRIES[0];

const PILL =
  "w-full border border-black/12 bg-white font-semibold uppercase leading-[0.9] text-black outline-none placeholder:font-semibold placeholder:uppercase placeholder:leading-[0.9] placeholder:text-black/48";
const PILL_TYPE =
  "text-[12px] tracking-[0.48px] placeholder:text-[12px] placeholder:tracking-[0.48px] desk:text-[14px] desk:tracking-[0.56px] desk:placeholder:text-[14px] desk:placeholder:tracking-[0.56px]";
const FIELD_SM = `${PILL} ${PILL_TYPE} h-[61px] rounded-[48px] px-6 desk:h-[63px]`;

function MobileTile({
  icon,
  label,
  href,
}: {
  icon: string;
  label: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-[12px] bg-cream">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={12} height={12} className="size-3" />
      </span>
      <p className="w-full whitespace-nowrap text-center text-[12px] font-semibold uppercase leading-[0.9] tracking-[0.96px] text-black/64">
        {label}
      </p>
    </>
  );
  const className = "flex min-w-0 flex-1 flex-col items-center gap-3 rounded-[24px] p-3";
  if (href) {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }
  return <div className={className}>{body}</div>;
}

function ContactRow({
  icon,
  label,
}: {
  icon: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1 pr-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-[20px] bg-cream">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={16} height={16} className="size-4" />
      </span>
      <p className="text-[14px] font-semibold uppercase tracking-[1.12px] text-black/64">
        {label}
      </p>
    </div>
  );
}

function ArrowOut({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden>
      <path
        d="M4.5 11.5 11.5 4.5M11.5 4.5H6.5M11.5 4.5v5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmailRow({ email }: { email: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className="group inline-flex w-fit max-w-full items-center gap-3 rounded-full py-1 pr-5 transition-colors duration-300 hover:bg-cream hover:p-1 hover:pr-5 focus-visible:bg-cream focus-visible:p-1 focus-visible:pr-5 focus-visible:outline-none"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-[20px] bg-cream transition-all duration-300 group-hover:size-10 group-hover:rounded-full group-hover:bg-black group-focus-visible:size-10 group-focus-visible:rounded-full group-focus-visible:bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/contact/at.svg"
          alt=""
          width={16}
          height={16}
          className="size-4 group-hover:hidden group-focus-visible:hidden"
        />
        <ArrowOut className="hidden size-3.5 text-lime group-hover:block group-focus-visible:block" />
      </span>
      <p className="truncate text-[14px] font-semibold uppercase tracking-[1.12px] text-black/64 transition-colors duration-300 group-hover:text-black group-focus-visible:text-black">
        {email}
      </p>
    </a>
  );
}

export function ContactPage() {
  const copy = useCopy();
  const { locale } = useLanguage();
  const c = copy.contactPage;
  const desk = useDesk();
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [message, setMessage] = useState("");
  const [dial, setDial] = useState<Country>(US);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownDials = useMemo(() => COUNTRIES.map((country) => country.dial), []);

  const ready = useMemo(() => {
    const phoneOk = parseDial(dial.dial, knownDials) !== null && parseNational(mobile) !== null;
    const turnstileReady = !TURNSTILE_SITE_KEY || Boolean(turnstileToken);
    return parseContactName(name) !== null
      && parseContactBody(message) !== null
      && phoneOk
      && EMAIL_RE.test(email.trim())
      && turnstileReady;
  }, [dial.dial, email, knownDials, message, mobile, name, turnstileToken]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    const trap = e.currentTarget.elements.namedItem(HONEYPOT_FIELD);
    const honeypot = trap && "value" in trap ? String(trap.value) : "";
    try {
      const result = await submitContact({
        name,
        organization,
        email,
        dial: dial.dial,
        nationalNumber: mobile,
        message,
        locale,
        turnstileToken,
        [HONEYPOT_FIELD]: honeypot,
      });
      if (!result.ok) {
        setTurnstileToken(null);
        setWidgetKey((key) => key + 1);
        setError(c[REASON_LEAF[result.reason]]);
        setSubmitting(false);
        return;
      }
      setSent(true);
    } catch {
      setTurnstileToken(null);
      setWidgetKey((key) => key + 1);
      setError(c[CONTACT_PAGE_FEEDBACK.failed]);
      setSubmitting(false);
    }
  }

  return (
    <section className="overflow-x-hidden bg-cream px-3 pb-3 pt-[68px] desk:px-16 desk:py-[88px]">
      <div className="mx-auto flex w-full min-w-0 max-w-[1072px] flex-col overflow-hidden rounded-[88px] bg-white px-6 py-8 desk:h-[629px] desk:min-h-0 desk:flex-row desk:items-end desk:rounded-[154px] desk:px-10 desk:py-16">
        <div className="mb-[-19px] flex flex-col desk:mb-0 desk:h-[501px] desk:w-[558px] desk:shrink-0 desk:-mr-[109px]">
          <h1
            className={`${trail.className} text-[64px] uppercase leading-[0.9] tracking-[2.56px] text-black desk:flex-1 desk:text-[clamp(56px,12vw,130px)] desk:tracking-[5.2px]`}
          >
            {c.title}
          </h1>
          <div className="mt-6 hidden flex-col desk:mt-0 desk:flex">
            <EmailRow email={c.email} />
            <ContactRow icon="/icons/contact/map-pin.svg" label={c.address} />
            <ContactRow icon="/icons/contact/phone.svg" label={c.phone} />
          </div>
        </div>

        {sent ? (
          <p role="status" className="relative z-10 text-[16px] font-semibold leading-snug text-black desk:flex-1">{c[CONTACT_PAGE_FEEDBACK.sent]}</p>
        ) : (
        <form
          onSubmit={onSubmit}
          className="relative z-10 flex w-full flex-col gap-2 desk:h-[420px] desk:flex-1 desk:items-end desk:justify-center"
        >
          <input
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            defaultValue=""
            className="absolute left-[-9999px] h-px w-px overflow-hidden"
          />
          <input
            required
            name="name"
            autoComplete="name"
            placeholder={c.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={c.name}
            className={FIELD_SM}
          />
          <input
            name="organization"
            autoComplete="organization"
            placeholder={c.organization}
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            aria-label={c.organization}
            className={FIELD_SM}
          />
          <div className="flex w-full flex-col gap-2 desk:flex-row">
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder={c.emailField}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label={c.emailField}
              className={`${FIELD_SM} desk:min-w-0 desk:flex-1 desk:w-auto`}
            />
            <div className={`${PILL} ${PILL_TYPE} flex h-[61px] items-center gap-4 rounded-[48px] pl-4 pr-10 desk:h-[63px] desk:min-w-0 desk:flex-1 desk:w-auto desk:pr-6`}>
              <CountryDropdown compact={!desk} variant="inline" value={dial} onChange={setDial} />
              <input
                required
                type="tel"
                name="mobile"
                autoComplete="tel"
                placeholder={c.mobile}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                aria-label={c.mobile}
                className={`${PILL_TYPE} min-w-0 flex-1 bg-transparent uppercase text-black outline-none placeholder:font-semibold placeholder:uppercase placeholder:text-black/48`}
              />
            </div>
          </div>
          <textarea
            required
            name="message"
            placeholder={c.message}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={c.message}
            className={`${PILL} ${PILL_TYPE} h-[171px] w-full resize-none rounded-[31.5px] py-6 pl-6 pr-8 desk:h-auto desk:min-h-0 desk:flex-1`}
          />
          {error ? <p role="alert" className="w-full text-sm font-semibold text-magenta">{error}</p> : null}
          <Turnstile key={widgetKey} onToken={setTurnstileToken} />
          <button
            type="submit"
            disabled={!ready || submitting}
            className="h-16 w-full shrink-0 rounded-full bg-black text-[16px] font-semibold uppercase tracking-[0.64px] text-white transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-32 disabled:hover:scale-100 desk:w-[284px]"
          >
            {c.send}
          </button>
        </form>
        )}

        <div className="mt-4 flex w-full desk:hidden">
          <MobileTile href={`mailto:${c.email}`} icon="/icons/contact/at.svg" label={c.emailLabel} />
          <MobileTile icon="/icons/contact/map-pin.svg" label={c.addressLabel} />
          <MobileTile icon="/icons/contact/phone.svg" label={c.phoneLabel} />
        </div>
      </div>
    </section>
  );
}
