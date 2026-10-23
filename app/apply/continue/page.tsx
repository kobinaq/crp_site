import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { applicants, getDb } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { nextStepUrl } from "@/lib/application";
import { requestLocale } from "@/lib/request-locale";

// Applications run in English, French or Spanish only, so Portuguese visitors get the English title.
const TITLE = { en: "Continue your application", fr: "Poursuivre votre candidature", es: "Continuar con tu solicitud" } as const;
export async function generateMetadata() {
  const locale = await requestLocale();
  return { title: locale === "fr" || locale === "es" ? TITLE[locale] : TITLE.en, robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}
export default async function ContinueApplicationPage() {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/apply");
  const [applicant] = await getDb().select().from(applicants).where(eq(applicants.id, session.applicantId));
  if (!applicant?.emailVerifiedAt || applicant.sessionVersion !== session.version) redirect("/apply");
  const copy = {
    en: ["Email confirmed", "You can now continue your application.", "Continue application", "Home"],
    fr: ["Adresse e-mail confirmée", "Vous pouvez maintenant reprendre votre candidature.", "Continuer", "Accueil"],
    es: ["Correo confirmado", "Ya puedes continuar tu solicitud.", "Continuar solicitud", "Inicio"],
  }[applicant.language];
  return <main className="grid min-h-dvh place-items-center bg-cream p-8 text-black"><div className="max-w-lg rounded-[32px] bg-white p-10 text-center">
    <h1 className="text-3xl">{copy[0]}</h1>
    <p className="mt-5">{copy[1]}</p>
    <a href={nextStepUrl(applicant)} className="gradient-brand mt-8 inline-block rounded-full px-6 py-3 font-semibold text-white transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98]">{copy[2]}</a>
    <Link href={`/${applicant.language}`} className="mt-6 block underline">{copy[3]}</Link>
  </div></main>;
}
