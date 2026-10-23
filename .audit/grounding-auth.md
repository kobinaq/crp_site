# Auth constraints for staff sessions

Source: ops-auth walkthrough, plus lib/operations-auth.ts, lib/session.ts, lib/access.ts, app/api/ops/route.ts, proxy.ts.

- Staff access today is OPERATIONS_TOKENS. authenticateOperator hashes a Bearer token and returns an operator id. There is no user table and no role. Every valid token can do every ops action.
- Keep that function's bearer branch intact. A bad JSON entry fail-closes the whole list and production refuses to boot. Do not add role parsing there.
- Applicant sign-in is a different cookie, crp_session, HMAC under APP_SECRET and bound to applicants.session_version. Do not store staff sessions in it. Rotating APP_SECRET logs applicants out and breaks VideoAsk refs.
- access_tokens.purpose is only resume and switch_online. Magic links need their own table.
- proxy.ts skips every /api route. Do not enforce staff auth inside proxy for /api/ops, cron, sync, or webhooks. Page protection for /admin can live in the admin layout, not by widening the proxy matcher.
- /api/ops, /api/decisions, and /api/sync stay bearer or sync-secret. The new session authorizes /admin and new /api/admin routes only.
- A staff cookie on a mutating route needs a CSRF check. Bearer calls do not, because the browser does not attach them.
- Resend is deliverEmail, called by the job worker. Cron runs jobs once a minute. A magic link cannot wait for that cron. Login mail sends in the request, with an idempotency key, through the same Resend function.
- Next is 16.3.4 with a proxy export, not middleware.ts. Auth.js or better-auth route handlers under /api/auth are already outside the proxy matcher. Their middleware snippets must not be dropped in unchanged.
- Actor on application events stays the literal "ops". The operator id is interpolated into the reason string. Do not change that attribution as part of adding roles.
- getDb() throws when DATABASE_URL is missing and calls assertBackendConfig on first use. next build runs without a database. Auth setup must stay lazy. A module-scope client that opens the pool at import will fail the build.
- better-auth (checked 2026-10-22) has a Drizzle adapter, a magic-link plugin with a send callback, additional user fields, and Next 16 starters. It wants its own user, session, account, and verification tables, and a /api/auth handler. Do not paste its proxy snippet over proxy.ts.
- Auth.js v5 (next-auth) also has a Drizzle adapter and database sessions. Email magic links need the verification-token table. It is OAuth-shaped. Roles are a custom column, not a first-class field. Its proxy wrapper must not replace the locale proxy.
- A small hand-rolled magic link can reuse deliverEmail, a hashed token table, and an httpOnly cookie. It is less code to own, and more code to get wrong (expiry, single use, CSRF, session fixation).
- Whichever library wins, the user row needs a role that can later include a public member. Bootstrap is an allowlist of admin emails, not a seed password.
