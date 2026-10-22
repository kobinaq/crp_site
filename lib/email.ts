export type EmailInput = { to: string; subject: string; html: string };

export type DeliveryResult =
  | { ok: true; id: string | null; skipped?: boolean }
  | { ok: false; error: string; retryable: boolean };

// Talks to Resend once. The job worker is the usual caller. The staff sign-in
// action and the staff invite action also call it, with the token hash as the
// idempotency key, because a magic link has to leave in the request that
// created it. Every other email is
// stored as a job in the same transaction as the record it belongs to, and this
// function is retried from the worker until Resend accepts it. The idempotency
// key stops a retry after a timeout from delivering twice inside Resend's
// 24-hour window.
export async function deliverEmail(input: EmailInput, idempotencyKey: string): Promise<DeliveryResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    console.warn("[email] RESEND_API_KEY/RESEND_FROM unset; skipped:", input.subject);
    return { ok: true, id: null, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from, ...input }),
    });
    if (!res.ok) {
      const text = await res.text();
      // 4xx other than rate limiting is a bad request that will never succeed.
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, error: `resend ${res.status}: ${text.slice(0, 500)}`, retryable };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, id: typeof data.id === "string" ? data.id : null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), retryable: true };
  }
}
