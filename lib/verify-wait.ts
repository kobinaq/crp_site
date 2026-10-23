import { eq } from "drizzle-orm";
import { applicants, type Applicant, type Db } from "@/lib/db";
import { parseLocale } from "@/lib/locale";

// The VideoAsk thank-you redirect usually lands a moment before the signed
// webhook. /api/apply/verify never advances an applicant itself (a browser
// redirect proves nothing); it only waits briefly for the webhook to do so.
// Mutable so tests can shrink the timings.
export const verifyWait = {
  budgetMs: 6000,
  intervalMs: 750,
  // "Finishing up" page: re-checks this many times, refreshAfterSeconds apart,
  // before settling on /apply/complete (the email still carries the next step).
  maxAttempts: 6,
  refreshAfterSeconds: 3,
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

// Re-reads the applicant until it leaves "submitted" or the budget runs out.
export async function waitWhileSubmitted(db: Db, applicant: Applicant): Promise<Applicant> {
  let current = applicant;
  const deadline = Date.now() + verifyWait.budgetMs;
  while (current.status === "submitted" && Date.now() + verifyWait.intervalMs <= deadline) {
    await verifyWait.sleep(verifyWait.intervalMs);
    const [fresh] = await db.select().from(applicants).where(eq(applicants.id, current.id));
    if (!fresh) break;
    current = fresh;
  }
  return current;
}

// Minimal self-refreshing page shown while the webhook is still in flight.
export function finishingUpPage(nextUrl: string, requestedLocale?: string): Response {
  const locale = parseLocale(requestedLocale);
  const copy = {
    en: ["Finishing up…", "We’re confirming your video answers. This page will continue automatically.", "Continue"],
    fr: ["Encore un instant…", "Nous confirmons vos réponses vidéo. La suite s’affichera automatiquement.", "Continuer"],
    es: ["Un momento…", "Estamos confirmando tus respuestas en vídeo. Esta página continuará automáticamente.", "Continuar"],
    pt: ["Só um momento…", "Estamos a confirmar as suas respostas em vídeo. Esta página continuará automaticamente.", "Continuar"],
  }[locale];
  const href = nextUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new Response(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="${verifyWait.refreshAfterSeconds};url=${href}"><title>${copy[0]}</title><style>body{font:18px Arial,sans-serif;background:#f0eee6;color:#111;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;margin:24px;background:white;border-radius:32px;padding:40px;text-align:center}a{color:#111}</style></head><body><main><h1>${copy[0]}</h1><p>${copy[1]}</p><p><a href="${href}">${copy[2]}</a></p></main></body></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Content-Language": locale,
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  } });
}
