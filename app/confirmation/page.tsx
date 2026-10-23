import Link from "next/link";
import { redirect } from "next/navigation";
import { localePath } from "@/lib/locale";
import { requestLocale } from "@/lib/request-locale";

const COPY = {
  en: ["Request confirmed", "Your preferences have been saved.", "Home"],
  fr: ["Demande confirmée", "Vos préférences ont été enregistrées.", "Accueil"],
  es: ["Solicitud confirmada", "Tus preferencias se han guardado.", "Inicio"],
  pt: ["Pedido confirmado", "As suas preferências foram guardadas.", "Página inicial"],
} as const;

// Landing page for a legacy waitlist/interest confirmation link that saved a
// sign-up. Anything else goes home: there is no "expired" dead end any more.
// The path has no locale prefix, so the language comes from the visitor's language cookie.
export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  if (result !== "confirmed") redirect("/");
  const locale = await requestLocale();
  const copy = COPY[locale];
  return <main className="grid min-h-dvh place-items-center bg-cream p-8 text-black"><div className="max-w-lg rounded-[32px] bg-white p-10 text-center">
    <h1 className="text-3xl">{copy[0]}</h1>
    <p className="mt-5">{copy[1]}</p>
    <Link href={localePath("/", locale)} className="mt-8 inline-block rounded-full bg-black px-6 py-3 text-white transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98]">{copy[2]}</Link>
  </div></main>;
}
