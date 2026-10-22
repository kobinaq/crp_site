# Phase 1 design

Base is the opus sketch at `/tmp/arena-admin-cms/candidate-opus/`. The judge scored grok 32 and opus 31 on the raw rubric, then opus 34 after two grafts. I had preferred grok because it leaves the apply routes alone and the API is smaller. Graft A removes that apply-route risk. The remaining reason to keep opus is the invariant a later change is most likely to break. Published copy and its history are one append-only table, so the live value cannot drift from the revision log.

## Grafts from the grok sketch

- Email templates stay synchronous and take an `EmailSources` argument. Callers load it before `transaction(`. `receivedEmail` is the only template whose argument defaults to the JSON, and only so `app/api/apply/switch-online/route.ts` stays untouched.
- Page and UI placeholders must match the English set of names. Email placeholders must match the English counts, because those templates replace a token once.

## Cuts

- No user-admin screen and no `users.manage` capability. `ADMIN_EMAILS` creates admins. An editor or reviewer is a SQL update to `users.role` until a later screen exists.
- The staff cookie is `crp_staff` with path `/admin`. A public member later uses the same `users` table and a different cookie. A cookie on `/` would be sent to applicant API routes.

## Roles

- admin and editor: dashboard and copy, including publish, restore, and reset.
- reviewer: dashboard only.
- A role with no capabilities is not staff. Phase 2 adds `member` to the role union and the capability record.

## Copy

- `copy_revisions` is the history and the published value. NULL means the JSON bundle is live again.
- `copy_drafts` is one row per author per key.
- Stale is computed. English is never stale. A translation with no row is current against the bundled English. A CMS change to English marks the other locales stale. A deploy that edits only `en.json` does not, because both sides of the comparison would read the new file.
- Public read caches head rows under the tag `copy`, merges outside the cache, throws inside the cache on failure, and catches outside it.
- `copyFor` is deleted when its callers move.

## Auth

- Hand-rolled magic link. Tables `users`, `sign_in_tokens`, `user_sessions`.
- The link is single-use and is spent by a POST, not by opening the mail.
- `deliverEmail` may be called from the sign-in action. The comment in `lib/email.ts` says so. In development a skipped send shows the link on the sign-in page, because that is how the first admin is bootstrapped without Resend.
- Do not add `ADMIN_EMAILS` to `assertBackendConfig`.
