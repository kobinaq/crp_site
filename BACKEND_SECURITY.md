# Backend security deployment

Apply `npm run db:migrate` with the intended DATABASE_URL before enabling the
updated application. Do not replace migrations with `db:push`: migration 0008
backfills existing rows into the sync feed and 0009 adds session generations and
single-use confirmation tokens. Backfill briefly locks source tables. Existing
consent records are preserved; the app requires explicit consent for new submissions.

## Applicant access

Submitting an application queues an email, without signing the browser in or
returning a VideoAsk link. The mailbox owner confirms with a button (POST) in the
email landing page. The confirmation POST redirects to a same-site page; its
Continue link opens the next provider step without relaxing form-action CSP. GET requests, including email scanners, consume nothing.
Tokens are created immediately before delivery, work once, and expire after 30
minutes. Delivery retries keep the same message and refresh an unused token.

Confirmation records email ownership, increments the applicant session generation,
and creates a signed 12-hour cookie. Every later sign-in revokes earlier sessions.
Legacy cookies are rejected. Existing applicants must request a fresh resume link;
old UUID-only form links no longer advance an application. Pending old application
emails that lack a confirmation token are parked rather than sending an unsafe link.

Visiting `/api/apply/verify` never completes Round 1. The signed VideoAsk event is
required first. A delayed webhook may leave the applicant on the acknowledgement
page; the identity provisioning job sends the next link after the event is processed.

## VideoAsk setup

1. Set all four `VIDEOASK_<ROUND1|ROUND2>_FORM_ID_<EN|FR>` values to the actual
   provider form UUIDs. Keep the existing HTTPS share URLs configured as well.
2. Add the custom variable `application_ref` to each form. App links pass it in
   the URL fragment, using VideoAsk's variable convention.
3. Configure `/api/webhooks/videoask` with the custom `x-webhook-secret` header
   matching VIDEOASK_WEBHOOK_SECRET. Remove secrets from query strings.
4. Enable `form_response` or `form_response_transcribed`. Only events whose
   `contact.status` is `completed` are eligible. The handler reads the signed
   reference from `contact.variables`, verifies the form id, and stores the
   named answer fields for staff review. A recursive walk of the payload is
   still forbidden.
5. Verify a real test completion for each configured form before production rollout.
   If the provider uses a different variable field, normalize that documented field
   explicitly; do not restore arbitrary recursive payload searching.

References: [VideoAsk webhook payloads](https://www.postman.com/videoask/videoask-s-public-workspace/folder/dmjtdvf/webhooks)
and [VideoAsk variables](https://www.videoask.com/help/tracking/360044540211-how-to-use-variables).

## Public preferences

Waitlist and interest forms now queue confirmation emails. No record is created,
resubscribed, or updated until its mailbox owner confirms. Both known and unknown
addresses receive the same public response. Confirmation links are single-use,
short-lived, and unaffected by GET previews. Nomination submissions remain separate.

## Individual operations access

`OPERATIONS_SECRET` and `x-operator` no longer authorize or identify operators.
Generate one credential per person with:

```sh
node scripts/create-operator.mjs reviewer@example.com
```

Store the raw token in that person's password manager. Configure only the emitted
`{id, tokenHash}` entry in the server's OPERATIONS_TOKENS JSON array. Send the raw
token in `Authorization: Bearer <token>` when calling `/api/ops`. Audit records use
the configured identity, regardless of supplied name headers. Remove an entry to
revoke access, or generate a replacement to rotate it. Do not share tokens.

Scheduled jobs and Excel sync require the separate CRON_SECRET; operations tokens
and the retired shared operations secret cannot run cron endpoints.

## Regression coverage

`npm test` uses a disposable PostgreSQL cluster and mocked external providers; it
never connects to production. Tests cover denied unverified access, session
revocation, skipped-round prevention, wrong forms and tampered references, mailbox
confirmation for preference changes, operator attribution, worker lease recovery,
Excel replay/edit/batch behavior, migration backfill, and explicit consent.

External provider credentials and production form settings must still be configured
and smoke-tested. No production database migration or live email delivery is performed
by the test suite.
