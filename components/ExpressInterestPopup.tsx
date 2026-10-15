"use client";

import Image from "next/image";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { trail } from "@/lib/fonts";
import { submitInterest } from "@/lib/actions";
import { Turnstile, TURNSTILE_SITE_KEY } from "./Turnstile";
import { useCopy, useLanguage } from "./LanguageProvider";
import { useCaptureSubmission } from "./useCaptureSubmission";

/** Figma sponsor-block edge — inputs authored at this size, then scaled. */
const DESIGN = 536;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRAND_GRADIENT =
  "radial-gradient(circle at 70% 70%, #FA8D2E 0%, #EC268F 100%)";
const GRAY_GRADIENT =
  "radial-gradient(circle at 50% 50%, #E8E8E8 0%, #C8C8C8 100%)";
const SUCCESS_GRADIENT =
  "radial-gradient(circle at 50% 50%, #D2DE38 0%, #3DADFF 100%)";

export type InterestAgeGroup = "15_18" | "19_26" | "27_34";

type Phase = "idle" | "invalid" | "success";

function interestDbAgeGroup(ageGroup: InterestAgeGroup): "under_19" | "19_plus" {
  return ageGroup === "15_18" ? "under_19" : "19_plus";
}

function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[24px]" aria-hidden>
      <path
        d="M5.5 5.5l13 13M18.5 5.5l-13 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon({ stroke = "#fff" }: { stroke?: string }) {
  return (
    <svg viewBox="0 0 20 18" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M2 9h15M11 3l6 6-6 6"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 18 13" className="size-5" fill="none" aria-hidden>
      <path
        d="M2 7l4.5 4L16 2"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Outer fills available space as a square; inner stays at the 536² Figma layout
 * and scales uniformly so input width (442), padding (40), and radius (48/154)
 * shrink together.
 */
function ScaledInterestCard({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(DESIGN);

  useEffect(() => {
    const el = outerRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const measure = () => {
      const avail = Math.min(parent.clientWidth, parent.clientHeight, DESIGN);
      if (avail > 0) setSize(avail);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const scale = size / DESIGN;

  return (
    <div
      ref={outerRef}
      className="relative mx-auto shrink-0"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute left-0 top-0 overflow-hidden"
        style={{
          width: DESIGN,
          height: DESIGN,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          borderRadius: 154,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Figma 2141:288 / 2141:290 — 442×(40+content+40), radius 48. */
function Field({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex w-[442px] shrink-0 flex-col justify-center rounded-[48px] bg-white p-[40px]">
      {active ? (
        <span className="absolute left-[40px] top-[18px] text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] text-black/32">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

type ExpressInterestPopupProps = {
  open: boolean;
  ageGroup: InterestAgeGroup;
  /** Defaults to apply_express_{ageGroup}. Use nominate_express_19_26 from nominate CTAs. */
  source?: string;
  onClose: () => void;
};

export function ExpressInterestPopup({
  open,
  ageGroup,
  source,
  onClose,
}: ExpressInterestPopupProps) {
  const copy = useCopy();
  const { locale } = useLanguage();
  const { pending, error, challengeKey, submit } = useCaptureSubmission();
  const titleId = useId();
  const errorId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const submitted = phase === "success";
  const invalid = phase === "invalid";
  const nameActive = name.trim().length > 0;
  const emailActive = email.trim().length > 0;
  const hasInput = nameActive || emailActive;
  const showSubmit = hasInput || invalid || submitted;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitted || pending || (TURNSTILE_SITE_KEY && !turnstileToken)) return;
    if (!name.trim() || !isValidEmail(email)) {
      setPhase("invalid");
      return;
    }
    const saved = await submit(() => submitInterest({
      email: email.trim(),
      name: name.trim(),
      ageGroup: interestDbAgeGroup(ageGroup),
      source: source ?? `apply_express_${ageGroup}`,
      locale,
      turnstileToken,
    }));
    if (saved) setPhase("success");
    else setTurnstileToken(null);
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
    if (phase === "invalid") setPhase("idle");
  };

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setEmail(value);
    if (phase === "invalid") {
      setPhase(isValidEmail(value) && name.trim() ? "idle" : "invalid");
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label={copy.a11y.closeExpressInterest}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-[80dvh] max-h-[80dvh] w-full flex-col gap-8 overflow-hidden rounded-tl-[64px] rounded-tr-[64px] bg-black px-5 py-10 text-white desk:gap-[48px] desk:rounded-tl-[154px] desk:rounded-tr-[154px] desk:px-[64px] desk:py-[96px]"
      >
        <div className="relative flex h-auto w-full shrink-0 items-start justify-end desk:h-[43px] desk:pr-[32px]">
          <h2
            id={titleId}
            className="absolute inset-x-0 top-0 text-center text-[32px] font-normal leading-[0.9] tracking-[-0.04em] desk:text-[48px] desk:tracking-[-1.92px]"
          >
            {copy.apply.interest}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={copy.a11y.closeExpressInterest}
            className="relative z-10 size-[24px] shrink-0 text-white"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <ScaledInterestCard>
            <Image
              src="/images/apply/interest-bg.jpg"
              alt=""
              fill
              sizes="536px"
              className="object-cover"
            />
            {submitted ? (
              <div className="absolute inset-0 bg-black/45" aria-hidden />
            ) : null}

            {submitted ? (
              <div className="relative z-10 flex size-full flex-col items-center justify-center gap-8 p-[40px]">
                <p
                  role="status"
                  className={`${trail.className} text-center text-[69.5px] uppercase leading-[0.9] tracking-[-0.04em] text-lime`}
                >
                  {copy.waitlist.allSet}
                </p>
                <div
                  className="grid size-[80px] place-items-center rounded-full"
                  style={{ background: SUCCESS_GRADIENT }}
                >
                  <CheckIcon />
                </div>
                <p className="max-w-[250px] text-center text-[32px] leading-[0.9] tracking-[-1.28px] text-white">
                  {copy.waitlist.checkEmail}
                </p>
              </div>
            ) : (
              <form
                noValidate
                onSubmit={handleSubmit}
                aria-busy={pending}
                className="relative z-10 flex size-full flex-col items-center justify-center gap-[9px] p-[40px]"
              >
                <Field label={copy.apply.namePlaceholder} active={nameActive}>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    value={name}
                    disabled={pending}
                    onChange={handleNameChange}
                    placeholder={
                      nameActive ? undefined : copy.apply.namePlaceholder
                    }
                    aria-label={copy.apply.namePlaceholder}
                    className={`w-full bg-transparent text-black outline-none ${
                      nameActive
                        ? "pt-3 text-[32px] leading-[0.9] tracking-[-1.28px]"
                        : "text-[20px] font-semibold uppercase leading-[0.9] tracking-[0.8px] placeholder:text-black/32"
                    }`}
                  />
                </Field>

                <Field label={copy.apply.emailPlaceholder} active={emailActive}>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={email}
                    disabled={pending}
                    onChange={handleEmailChange}
                    placeholder={
                      emailActive ? undefined : copy.apply.emailPlaceholder
                    }
                    aria-label={copy.a11y.email}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? errorId : undefined}
                    className={`w-full bg-transparent text-black outline-none ${
                      emailActive
                        ? "pt-3 text-[32px] leading-[0.9] tracking-[-1.28px]"
                        : "text-[20px] font-semibold uppercase leading-[0.9] tracking-[0.8px] placeholder:text-black/32"
                    }`}
                  />
                </Field>

                <Turnstile key={challengeKey} onToken={setTurnstileToken} />

                {showSubmit ? (
                  <button
                    type="submit"
                    disabled={pending || Boolean(TURNSTILE_SITE_KEY && !turnstileToken)}
                    aria-label={copy.a11y.submitInterest}
                    className="mt-2 grid size-[80px] place-items-center rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-95 disabled:hover:scale-100"
                    style={{
                      background: invalid ? GRAY_GRADIENT : BRAND_GRADIENT,
                    }}
                  >
                    <ArrowIcon stroke={invalid ? "#5C5C5C" : "#fff"} />
                  </button>
                ) : null}

                {invalid ? (
                  <p id={errorId} role="alert" className="sr-only">
                    {copy.a11y.emailInvalid}
                  </p>
                ) : null}
              </form>
            )}
          </ScaledInterestCard>
        </div>
        {error ? (
          <p role="alert" className="shrink-0 text-center text-sm text-white">
            {copy.waitlist.saveError}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
