import { parseLocale } from "@/lib/locale";
export function confirmationPage(raw: string, action: "/api/apply/switch-online", title: string, requestedLocale?: string): Response {
  const locale = parseLocale(requestedLocale);
  const copy = {
    en: [title, "Confirm only if you requested this email.", "Confirm"],
    fr: ["Confirmez votre demande", "Confirmez uniquement si vous avez demandé cet e-mail.", "Confirmer"],
    es: ["Confirma tu solicitud", "Confirma solo si has solicitado este correo.", "Confirmar"],
    pt: ["Confirme o seu pedido", "Confirme apenas se pediu este e-mail.", "Confirmar"],
  }[locale];
  const token = /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : "";
  return new Response(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${copy[0]}</title><style>body{font:18px Arial,sans-serif;background:#f0eee6;color:#111;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;margin:24px;background:white;border-radius:32px;padding:40px}h1{font-size:28px}button{background:#111;color:white;border:0;border-radius:30px;padding:16px 28px;font:inherit;cursor:pointer}</style></head><body><main><h1>${copy[0]}</h1><p>${copy[1]}</p><form method="post" action="${action}"><input type="hidden" name="token" value="${token}"><button type="submit">${copy[2]}</button></form></main></body></html>`, { headers: {
    "X-Robots-Tag": "noindex, nofollow", "Content-Language": locale, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", // same-origin, not no-referrer: no-referrer makes Chromium post Origin: null.
    // The page loads nothing external and the form posts to this origin, so the
    // tokenised URL is still never sent to a third party.
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  } });
}
