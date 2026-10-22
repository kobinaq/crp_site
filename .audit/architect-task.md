# Design task

You are one of two parallel design runners. Produce the best design your model can make. Do not hedge toward a safe middle. Differences are the signal.

Read these files before you sketch:

- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/SKILL.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/runner-prompt.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/rationale-template.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/design-red-flags.md
- /workspace/.audit/how-explanation.md
- /workspace/.audit/grounding-auth.md
- /workspace/.audit/grounding-copy.md
- /workspace/.audit/grounding-schema.md
- /workspace/.audit/grounding-design.md

Also read the principle skills you apply, under /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/. TypeScript rules are in typescript-best-practices/SKILL.md. Apply type-system-discipline and boundary-discipline.

## What to produce

A design package for phase 1 of an admin CMS on this Next.js 16 site. Write it only inside your assigned output directory. Do not edit the repo.

Files:

- rationale.md, following the rationale template. Leave "Synthesis decision" as "filled by the arena".
- sketch.md with module map, type sketches, and function signatures. Bodies are `throw new Error("not implemented")` or pseudocode comments. Usage call sites come first and the types are derived from them.

## The product

1. Staff auth with roles admin, editor, and reviewer. The same user and session model must be able to gain a public member later, when people post stories into the beacons. Do not build stories, moderation, or public signup now.
2. Bootstrap the first admins from an allowlist of emails in an env var. Sign-in is an email magic link sent through the existing Resend helper (lib/email.ts deliverEmail). Sessions live in Neon.
3. OPERATIONS_TOKENS, authenticateOperator, crp_session, APP_SECRET's current uses, proxy.ts matchers, the apply flow, VideoAsk, Didit, Calendly, Turnstile, PostHog, and lib/applyFlowGate.ts stay as they are. New session authorizes /admin and new /api/admin routes only.
4. Copy CMS. JSON files in lib/translations remain the defaults. Database rows are sparse overrides of string leaves. Draft, publish, version history with revert, stale flags when the English published value changes, and placeholder checks for {word} tokens. Publish revalidates a cache tag. Public pages stay fast and render the JSON if the database errors. Do not cache that failure.
5. Page copy, UI chrome (keys are the English source strings), acknowledgement emails (en/fr/es/pt), and application emails (en/fr/es only) are all in scope. Do not add Portuguese application emails. Do not let editors add, remove, or reorder array items. Empty string is a real value. Page overrides are plain text. Email signoff may contain the HTML it already contains.
6. Read-only dashboard of applicant status counts, nominations, interest sign-ups, waitlist, and partner inquiries, using the existing tables. No new write path except what /api/ops already does, and do not change /api/ops.
7. Everything under /admin. noindex. Add /admin to robots.ts disallow. Not linked from the public site. Visual language is the public site: Outfit, cream #f4f1ea, lime #d2de38, magenta #ec268f, orange #fa8d2e, gradient-brand pills, 32px white cards. Readable tables. Works at the desk breakpoint (900px) and at a tablet width.
8. Migration 0014 is hand-written SQL, additive, IF NOT EXISTS, journal idx 14, when greater than 1792660000000. Do not run drizzle-kit. Do not add an enum value and use it in the same file. Tests apply the journal via tests/db.mjs.
9. getDb() must not run at import time. next build has no DATABASE_URL. A database error on a public page returns JSON copy.

## Decisions you must make, not dodge

- Auth library versus a small hand-rolled magic link. Name the tables either way. Sessions in Neon. Lazy init.
- The copy row shape, the draft versus published representation, and where history lives.
- How a stale flag is set and cleared.
- The exact public function a server component calls to get merged copy, and how UI strings reach the client.
- Role checks as data, not scattered ifs. Who may draft, publish, and revert.
- How the first admin is created on first magic-link click.

Screen your own sketch against design-red-flags.md before you finish. Prefer a small public surface that hides the merge, the session lookup, and the role rule.

Caller's usage first. Show three call sites: a public server component reading copy, an admin action publishing one string, and a server layout rejecting a reviewer who opens the editor.

Do not write implementation code in the repo. The sketch is the artifact.

## Corrections the explanation established

These override a looser reading of the earlier notes. Honor them.

- operationsCredentials() returning an empty list does not stop the process from booting. assertBackendConfig runs on the first getDb() call and throws on every later call while the env is bad. A public copy read that calls getDb() will take the apply flow down with it if the ops env is malformed. The copy loader must catch that and return JSON. Do not add the admin allowlist to assertBackendConfig's required list.
- deliverEmail's file header says callers are the job worker, never a request handler. Applicant magic links are enqueued and wait for the minute cron. Pick one of these on purpose and say why: accept the latency, enqueue and then run that one job inside the request, or call deliverEmail from the handler and change the comment. Login mail that "succeeds" with skipped: true in development must still be observable locally.
- Every email catalog string is interpolated as raw HTML, not only signoff. Applicant names are escaped. Page copy is React text. The design must say which overrides are escaped, which may contain markup, and how a placeholder is checked. {name} is replaced only once.
- checkOrigin returns ok when both Sec-Fetch-Site and Origin are missing. A cookie-authenticated mutation needs a stricter check. Server actions get Next's Origin/Host check. Say which one you use.
- React cache() only dedupes one request. Publish needs a tagged cross-request cache. Do not turn on cacheComponents. Throw inside the cached function on database failure and catch outside it, so the failure is not stored. Do not make copyFor async if a pure function that takes overrides keeps tests/seo.test.mjs synchronous. Load at the edges.
- Email templates run inside transactions that lock the applicant row. An override query on that same transaction can abort the apply step. Load overrides before the transaction, or on a separate connection, with a JSON fallback.
- Role and copy status columns should be text with a TypeScript union, matching jobs.kind and access_tokens.purpose. Do not add a Postgres enum for a set that must later include a public member.
- Do not reuse overview() for the dashboard. It returns job payloads that contain live resume links, raw webhook bodies, and identity links. Select listing columns. Identity documents stay on the bearer route.
- PostHog wraps /admin through the root layout. Keep the provider. Suppress capture on admin so applicant names are not autocaptured.
- Dotted copy keys must not be path segments. A dot in the path skips proxy.ts.
- lib/apply-skills.ts English labels are stored data. They are not CMS copy.
- Newlines in page strings are layout. The editor must not collapse whitespace.
- Do not change TRANSITIONS, /api/ops, the ops actor, or the apply routes.
- Staff session cookies are opaque ids stored hashed. Do not sign them with APP_SECRET. Purge expired staff tokens from the existing worker tick.
