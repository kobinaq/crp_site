"use client";

import Image from "next/image";
import {
  type ChangeEvent,
  type FormEvent,
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { trail } from "@/lib/fonts";
import { submitWaitlist } from "@/lib/actions";
import { Turnstile, TURNSTILE_SITE_KEY } from "./Turnstile";
import { useCopy, useLanguage } from "./LanguageProvider";
import { useCaptureSubmission } from "./useCaptureSubmission";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PINK_GRADIENT =
  "radial-gradient(circle at 50% 50%, #FA8D2E 0%, #EC268F 100%)";
const GRAY_GRADIENT =
  "radial-gradient(circle at 50% 50%, #E8E8E8 0%, #C8C8C8 100%)";
const SUCCESS_GRADIENT =
  "radial-gradient(circle at 50% 50%, #D2DE38 0%, #3DADFF 100%)";

const MORPH_EASE = [0.22, 1, 0.36, 1] as const;
const MORPH_DURATION = 0.7;

type WaitlistPhase = "idle" | "invalid" | "success";

function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

function ArrowIcon({ stroke = "#fff" }: { stroke?: string }) {
  return (
    <svg
      viewBox="0 0 20 18"
      className="h-5 w-5 desk:h-6 desk:w-6"
      fill="none"
      aria-hidden
    >
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
    <svg
      viewBox="0 0 18 13"
      className="h-4 w-4 desk:h-[18px] desk:w-[18px]"
      fill="none"
      aria-hidden
    >
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

export function Waitlist() {
  const copy = useCopy();
  const { locale } = useLanguage();
  const { pending, error, challengeKey, submit } = useCaptureSubmission();
  const errorId = useId();
  const reduceMotion = useReducedMotion() === true;
  const sectionRef = useRef<HTMLElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<WaitlistPhase>("idle");
  const [pillWidth, setPillWidth] = useState<number | "100%">("100%");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const submitted = phase === "success";
  const invalid = phase === "invalid";
  const hasInput = email.trim().length > 0;
  const showSubmit = hasInput || invalid || submitted;
  const morph = {
    duration: reduceMotion ? 0 : MORPH_DURATION,
    ease: MORPH_EASE,
  };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowTurnstile(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const col = colRef.current;
    const shell = shellRef.current;
    if (!col || !shell) return;

    const syncWidth = () => {
      if (phase === "success") {
        setPillWidth(shell.getBoundingClientRect().height);
        return;
      }
      setPillWidth(col.getBoundingClientRect().width);
    };

    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(col);
    return () => observer.disconnect();
  }, [phase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitted || pending || (TURNSTILE_SITE_KEY && !turnstileToken)) return;
    if (!isValidEmail(email)) {
      setPhase("invalid");
      return;
    }
    const saved = await submit(() => submitWaitlist({
      email: email.trim(),
      source: "homepage_waitlist",
      locale,
      turnstileToken,
    }));
    if (saved) setPhase("success");
    else setTurnstileToken(null);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setEmail(value);
    if (phase === "invalid") {
      setPhase(isValidEmail(value) ? "idle" : "invalid");
    }
  };

  const handleBlur = () => {
    if (phase === "success") return;
    if (email.trim().length > 0 && !isValidEmail(email)) {
      setPhase("invalid");
    }
  };

  return (
    <section
      ref={sectionRef}
      id="waitlist"
      data-nav-tone="dark"
      className="bg-ink px-5 py-16 text-white desk:px-8 desk:py-24"
    >
      <div className="mx-auto flex w-full max-w-[1072px] flex-col items-center gap-8 desk:gap-12">
        <h2 className="text-center text-[32px] leading-[0.95] tracking-[-0.04em] desk:text-[clamp(28px,6vw,48px)]">
          {copy.waitlist.title}
        </h2>

        <div className="relative mx-auto h-[484px] w-[298px] max-w-full overflow-hidden rounded-[88px] desk:aspect-square desk:h-auto desk:w-full desk:max-w-[536px] desk:rounded-[154px]">
          <Image
            src="/images/waitlist.jpg"
            alt={copy.waitlist.photoAlt}
            fill
            sizes="(min-width: 900px) 536px, 90vw"
            className="object-cover object-center"
          />

          <div className="absolute inset-0">
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-black/45"
              initial={false}
              animate={{ opacity: submitted ? 1 : 0 }}
              transition={morph}
            />

            <div className="relative z-10 flex h-full items-center justify-center px-[13px] desk:px-10">
              <div ref={colRef} className="relative w-full max-w-[272px] desk:max-w-[442px]">
                <motion.p
                  role="status"
                  aria-hidden={!submitted}
                  initial={false}
                  animate={{ opacity: submitted ? 1 : 0 }}
                  transition={morph}
                  className={`${trail.className} pointer-events-none absolute inset-x-0 bottom-[calc(100%+1.5rem)] text-center text-[clamp(52px,14vw,70px)] uppercase leading-[0.9] tracking-[-0.04em] text-lime [text-shadow:0_0_10px_rgba(0,0,0,0.35)] desk:bottom-[calc(100%+2rem)]`}
                >
                  {copy.waitlist.allSet}
                </motion.p>

                <form
                  noValidate
                  onSubmit={handleSubmit}
                  aria-busy={pending}
                  className="flex justify-center"
                >
                  <motion.div
                    ref={shellRef}
                    initial={false}
                    animate={{ width: pillWidth }}
                    transition={submitted ? morph : { duration: 0 }}
                    className="flex h-[76px] items-center overflow-hidden rounded-[48px] bg-white p-2 desk:h-[98px] desk:rounded-full"
                  >
                    <motion.div
                      initial={false}
                      animate={{ opacity: submitted ? 0 : 1 }}
                      transition={{
                        duration: reduceMotion ? 0 : 0.22,
                        ease: MORPH_EASE,
                      }}
                      className="min-w-0 flex-1 overflow-hidden"
                    >
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        spellCheck={false}
                        value={email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder={copy.waitlist.emailPlaceholder}
                        aria-label={copy.a11y.email}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? errorId : undefined}
                        disabled={submitted || pending}
                        tabIndex={submitted ? -1 : 0}
                        className="w-full min-w-0 bg-transparent px-3 text-[clamp(18px,4.5vw,32px)] tracking-[-0.04em] text-black outline-none placeholder:text-[13px] placeholder:font-semibold placeholder:uppercase placeholder:tracking-[0.04em] placeholder:text-black/30 desk:px-5 desk:placeholder:text-[20px]"
                      />
                    </motion.div>

                    {showSubmit ? (
                      <motion.button
                        type="submit"
                        aria-label={copy.a11y.joinWaitlist}
                        aria-hidden={submitted}
                        tabIndex={submitted ? -1 : 0}
                        disabled={submitted || pending || Boolean(TURNSTILE_SITE_KEY && !turnstileToken)}
                        initial={false}
                        transition={morph}
                        whileHover={
                          phase === "idle" && !reduceMotion
                            ? { scale: 1.05 }
                            : undefined
                        }
                        whileTap={
                          phase === "idle" && !reduceMotion
                            ? { scale: 0.95 }
                            : undefined
                        }
                        className="relative grid h-[60px] w-[60px] shrink-0 place-items-center overflow-hidden rounded-full desk:h-20 desk:w-20"
                      >
                        <motion.span
                          aria-hidden
                          className="absolute inset-0 rounded-full"
                          style={{ background: PINK_GRADIENT }}
                          initial={false}
                          animate={{
                            opacity: submitted || invalid ? 0 : 1,
                          }}
                          transition={morph}
                        />
                        <motion.span
                          aria-hidden
                          className="absolute inset-0 rounded-full"
                          style={{ background: GRAY_GRADIENT }}
                          initial={false}
                          animate={{
                            opacity: invalid && !submitted ? 1 : 0,
                          }}
                          transition={{
                            duration: reduceMotion ? 0 : 0.25,
                            ease: MORPH_EASE,
                          }}
                        />
                        <motion.span
                          aria-hidden
                          className="absolute inset-0 rounded-full"
                          style={{ background: SUCCESS_GRADIENT }}
                          initial={false}
                          animate={{ opacity: submitted ? 1 : 0 }}
                          transition={morph}
                        />
                        <span className="relative z-10 grid place-items-center">
                          <motion.span
                            className="col-start-1 row-start-1"
                            initial={false}
                            animate={{ opacity: submitted ? 0 : 1 }}
                            transition={morph}
                          >
                            <ArrowIcon stroke={invalid ? "#5C5C5C" : "#fff"} />
                          </motion.span>
                          <motion.span
                            className="col-start-1 row-start-1"
                            initial={false}
                            animate={{ opacity: submitted ? 1 : 0 }}
                            transition={morph}
                          >
                            <CheckIcon />
                          </motion.span>
                        </span>
                      </motion.button>
                    ) : null}
                  </motion.div>
                  {invalid ? (
                    <p id={errorId} role="alert" className="sr-only">
                      {copy.a11y.emailInvalid}
                    </p>
                  ) : null}
                </form>

                <motion.p
                  aria-hidden={!submitted}
                  initial={false}
                  animate={{ opacity: submitted ? 1 : 0 }}
                  transition={morph}
                  className="pointer-events-none absolute inset-x-0 top-[calc(100%+1.5rem)] mx-auto max-w-[16ch] text-center text-[clamp(20px,5vw,32px)] leading-[0.95] tracking-[-0.04em] text-white desk:top-[calc(100%+2rem)]"
                >
                  {copy.waitlist.checkEmail}
                </motion.p>
              </div>
            </div>
          </div>
        </div>

        {showTurnstile ? (
          <Turnstile key={challengeKey} onToken={setTurnstileToken} />
        ) : null}
        {error ? (
          <p role="alert" className="text-center text-sm text-white">
            {copy.waitlist.saveError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
