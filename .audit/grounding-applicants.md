# Applicant review constraints

Source: `lib/ops.ts`, `lib/lifecycle.ts`, `lib/decisions.ts`, `lib/db/schema.ts`. Checked 2026-10-22.

`/api/ops` calls `applicantDetail` and `performAction`. Do not change that route. `applicantDetail` selects the whole applicant row, the event history, and job rows. Job payloads can carry live links. The dashboard must not call `applicantDetail` or `overview`.

Columns safe to show on a staff page: name, email, date of birth, age, track, phone, nationality, based in, skills, can travel, passport flag, language, status, review cycle, created at, round 1 completed at, identity status, identity checked at, review decision, review notes, reviewer, review date, interview outcome, interview notes, interview date, docs status, online offered at.

Columns that stay off the page: `round1_link`, `identity_link`, `identity_session_id`, `identity_link_opened_at`, every `identity_documents` row, and every job payload. There is no short-lived staff file grant in this phase, so those stay off.

VideoAsk status is derived. `round1_completed_at` set means the round is complete. Otherwise it is not. The link is not shown. Identity status is the enum value, or none. The timeline is `application_events` for that applicant, newest or oldest, as text. Reasons are escaped by rendering them as text.

`TRANSITIONS` in `lib/lifecycle.ts` is the only legal status graph. `performAction` already moves an applicant through `transition` with actor `ops` and the operator name in the reason. `applyDecision` is the Excel path. It also queues a decision email. Neither is called from the new dashboard in this phase. Review buttons, notes editing, assignment, bulk decisions, and email preview are phase 3, and they must call these functions rather than write `applicants.status` themselves.

There is no contact-message table. The contact page stores nothing. Do not add a public form. Partner inquiries are the stored reach-outs.

Nominations, interest, waitlist, and partner inquiries are list-and-filter reads. No new writes.
