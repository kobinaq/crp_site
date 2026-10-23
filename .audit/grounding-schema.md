# Schema constraints for migration 0014 and the dashboard

Source: schema walkthrough, plus lib/db/schema.ts, lib/lifecycle.ts, lib/ops.ts, drizzle/meta/_journal.json, tests/db.mjs.

There is no rounds table and no newsletter table. Pipeline stage is applicants.status. A later review pass is applicants.review_cycle. Email updates live in waitlist.

- applicant_status values, in order: submitted, round1_complete, accepted, rejected, interview_yes, interview_no, docs_submitted, onboarding, online, ineligible, id_verified, id_failed, under_review, online_offered.
- identity_status: pending, verified, failed, review. track: in_person, online. app_language: en, fr, es. nomination_status: new, invited, applied, declined. waitlist_status: subscribed, unsubscribed. age_group: under_19, 19_plus. review_decision: accept, reject. interview_outcome: yes, no.
- /api/ops overview counts applicants by status and lists stuck queues. It does not read nominations, interest, waitlist, or partner_inquiries. The dashboard reads those four tables directly. It does not add write paths.
- nomination_status other than new, and waitlist unsubscribed, are never written by the app. Show the column. Do not invent transitions.
- interest has no status. partner_inquiries has no status and no unique key. The sync feed calls that table partners. The physical name is partner_inquiries.
- Locale is not stored on nominations, interest, waitlist, or partner inquiries. Applicant language is en, fr, or es only.
- docs_submitted is not reachable through TRANSITIONS. interview_no is reachable from accepted only. Do not "fix" that in this change.
- updated_at is Drizzle $onUpdate, not a SQL trigger. Rows inserted once keep the insert timestamp.
- Journal lists 0000 through 0013. Snapshots exist only for 0000 through 0003. Do not run drizzle-kit generate, migrate, or push. Hand-write drizzle/0014_*.sql and append journal idx 14, version 7, breakpoints true. The when value must be greater than 1792660000000 or a later drizzle-kit migrate skips the file.
- SQL is additive and idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS. Do not add an enum value and write that value in the same file. Do not edit 0000 through 0013.
- tests/db.mjs applies every journal entry, splitting on --> statement-breakpoint. New tables have to be in the journal or the tests never create them.
- Do not touch applicants, jobs, webhooks, or the apply tables except by reading them.
