// CSRF gate for the email-confirmation POSTs (/api/apply/resume,
// /api/capture/confirm, /api/apply/switch-online).
//
// - "ok": the request is provably same-origin (Sec-Fetch-Site: same-origin, a
//   matching Origin, or no Origin at all from an older client).
// - "needs-token": Origin is the opaque "null" and there is no Sec-Fetch-Site
//   to settle it. Allowed only when the posted single-use token is valid, so
//   the route must answer 403 (not a soft redirect) when it is not.
// - "reject": any cross-site signal. Sec-Fetch-Site wins over Origin because
//   browsers set it from the real initiator, even when Origin is "null".
export type OriginVerdict = "ok" | "needs-token" | "reject";

export function checkOrigin(req: { headers: Headers; nextUrl: URL }): OriginVerdict {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" ? "ok" : "reject";
  const origin = req.headers.get("origin");
  if (!origin || origin === req.nextUrl.origin) return "ok";
  if (origin === "null") return "needs-token";
  return "reject";
}

export const INVALID_ORIGIN = { error: "invalid origin" } as const;
