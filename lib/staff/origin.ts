// Stricter than checkOrigin. A staff mutation with neither Sec-Fetch-Site nor
// Origin is refused. Applicant routes still use the looser helper.
export function staffSameOrigin(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  const origin = headers.get("origin");
  if (!site && !origin) return false;
  if (site && site !== "same-origin") return false;
  if (!origin) return true;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]?.trim();
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
