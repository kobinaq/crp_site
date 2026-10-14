import { operationsCredentials } from "@/lib/operations-auth";

export function appUrl(): string {
  const value = process.env.APP_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("APP_URL must use HTTPS");
  return url.origin;
}

// Signs sessions, rate-limit keys, and recovery tokens. A dev fallback keeps
// local builds working; production must set a real 32+ character secret.
export function appSecret(): string {
  const secret = process.env.APP_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "local-development-only");
  if (!secret) throw new Error("APP_SECRET is required");
  return secret;
}

let checked = false;

// Runs once per process, on the first database access, so a misconfigured
// production deploy fails loudly before it can accept an application.
export function assertBackendConfig(): void {
  if (checked || process.env.NODE_ENV !== "production") return;
  const required = ["DATABASE_URL", "APP_URL", "RESEND_API_KEY", "RESEND_FROM", "APP_SECRET", "OPERATIONS_TOKENS", "CRON_SECRET", "SYNC_API_SECRET", "TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "VIDEOASK_WEBHOOK_SECRET", "VIDEOASK_FORM_URL", "VIDEOASK_FORM_ID", "DIDIT_API_KEY", "DIDIT_WORKFLOW_ID", "DIDIT_WEBHOOK_SECRET", "RESEND_WEBHOOK_SECRET", "BLOB_READ_WRITE_TOKEN"];
  // Calendly is optional (CALENDLY_URL_*, CALENDLY_WEBHOOK_SIGNING_KEY): see
  // calendlyEnabled() in lib/calendly.ts.
  const missing = required.filter((key) => !process.env[key]);
  try { if (new URL(process.env.VIDEOASK_FORM_URL ?? "").protocol !== "https:") missing.push("VIDEOASK_FORM_URL"); }
  catch { missing.push("VIDEOASK_FORM_URL"); }
  for (const key of ["APP_SECRET", "CRON_SECRET", "SYNC_API_SECRET"]) {
    if ((process.env[key]?.length ?? 0) < 32) missing.push(`${key} (32+ characters)`);
  }
  if (!operationsCredentials().length) missing.push("valid OPERATIONS_TOKENS");
  if ((process.env.IDENTITY_PROVIDER ?? "didit") !== "didit") missing.push("IDENTITY_PROVIDER=didit");
  if (missing.length) throw new Error(`Backend configuration incomplete: ${missing.join(", ")}`);
  appUrl();
  checked = true;
}
