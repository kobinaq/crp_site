"use client";

import { useText } from "@/lib/ui-text";

import { localePath } from "@/lib/locale";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startApplication } from "@/lib/actions";
import { useLanguage } from "../LanguageProvider";
import { TermsStep } from "./TermsStep";
import { SkillsStep } from "./SkillsStep";
import { AboutStep, type AboutData } from "./AboutStep";
import { RedirectingStep } from "./RedirectingStep";
import { APPLY_DRAFT, asBoolean, asOneOf, asTextList } from "@/lib/formDraft";
import { endDraft, useDraftState } from "@/lib/useFormDraft";

type Step = "terms" | "skills" | "about" | "redirecting" | "redirecting-home" | "check-email";

// Terms → skills → application details → email ownership confirmation.
export function ApplyFlow({ onClose }: { onClose: () => void }) {
  const tr = useText();
  const { locale } = useLanguage();
  const router = useRouter();
  // Step, skills and consent live in the session draft so a language switch resumes here.
  const [step, setStep] = useDraftState<Step>(APPLY_DRAFT, "step", "terms", asOneOf(["terms", "skills", "about"] as const));
  const [skills, setSkills] = useDraftState<string[]>(APPLY_DRAFT, "skills", [], asTextList);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [existing, setExisting] = useState(false);
  const [consent, setConsent] = useDraftState(APPLY_DRAFT, "consent", false, asBoolean);
  // Display-only copy of who applied, for the check-email screen.
  const [applicant, setApplicant] = useState<{ name: string; email: string } | null>(null);

  const handleSubmit = async (data: AboutData) => {
    if (submitting || !consent) return;
    setSubmitting(true);
    setError(null);
    setRetryable(false);
    setExisting(false);
    try {
      const result = await startApplication({ ...data, consent, language: data.language });
      if (!result.ok) {
        if (result.reason === "ineligible") {
          endDraft(APPLY_DRAFT);
          setStep("redirecting-home");
          window.setTimeout(() => router.push(localePath("/", locale)), 2500);
          return;
        }
        if (result.reason === "existing") {
          // Knowing the address proves nothing; offer to email the owner a
          // single-use link instead of showing them anything.
          setExisting(true);
          setSubmitting(false);
          return;
        }
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
      endDraft(APPLY_DRAFT);
      setApplicant({ name: data.fullName, email: data.email });
      setStep("check-email");
    } catch (err) {
      console.error("[apply] submit failed", err);
      // Server error / dropped connection: the details are still in the form,
      // so say so and offer a retry (AboutStep shows it as a toast).
      setError(tr("We couldn't send your application because of a problem on our side. Your details are still here, so you can try again in a moment."));
      setRetryable(true);
      setSubmitting(false);
    }
  };

  // A restored step past the terms needs the consent given on them.
  if (step === "terms" || (!consent && (step === "skills" || step === "about"))) {
    return <TermsStep onAccept={() => { setConsent(true); setStep("skills"); }} onClose={onClose} />;
  }
  if (step === "skills") {
    return (
      <SkillsStep
        selected={skills}
        onChange={setSkills}
        onBack={() => setStep("terms")}
        onContinue={() => setStep("about")}
      />
    );
  }
  if (step === "about") {
    return (
      <AboutStep
        skills={skills}
        onBack={() => setStep("skills")}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        retryable={retryable}
        onDismissError={() => {
          setError(null);
          setRetryable(false);
        }}
        existing={existing}
      />
    );
  }
  if (step === "check-email") {
    return (
      <RedirectingStep
        onBack={onClose}
        message={applicant ? tr("Hi {name},").replace("{name}", applicant.name) : tr("Check your email to confirm your address and begin.")}
        detail={
          applicant ? (
            <>
              <span className="text-black/64">{tr("Complete your application through the link we've sent you on your registered email")}</span>
              <br />
              <span className="break-all">{applicant.email}</span>
            </>
          ) : undefined
        }
        pending={false}
      />
    );
  }
  if (step === "redirecting-home") {
    return <RedirectingStep message={tr("Redirecting you to the homepage")} onBack={onClose} />;
  }
  return <RedirectingStep message={tr("Redirecting you to VideoAsk")} onBack={onClose} />;
}
