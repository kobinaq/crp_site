import Link from "next/link";
import { redirect } from "next/navigation";

// Landing page for a legacy waitlist/interest confirmation link that saved a
// sign-up. Anything else goes home: there is no "expired" dead end any more.
export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  if (result !== "confirmed") redirect("/");
  return <main className="grid min-h-dvh place-items-center bg-cream p-8 text-black"><div className="max-w-lg rounded-[32px] bg-white p-10 text-center">
    <h1 className="text-3xl">Request confirmed</h1>
    <p className="mt-5">Your preferences have been saved. / Vos préférences ont été enregistrées.</p>
    <Link href="/" className="mt-8 inline-block rounded-full bg-black px-6 py-3 text-white transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98]">Home / Accueil</Link>
  </div></main>;
}
