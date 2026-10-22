# Phase 4 grounding findings

Verified by the parent against the files named below. Explorers did not edit the repo.

## Storage today

Nominations live in `nominations` (`lib/db/schema.ts` 174-201). Status enum `nomination_status` is `new`, `invited`, `applied`, `declined` (schema.ts 56-61). Public `submitNomination` (`lib/actions.ts` 83-136) inserts `new`, dedupes on `(nominator_email, nominee_email)` with `onConflictDoNothing`, rate-limits, checks Turnstile, and queues a nominator acknowledgement. No app code updates `nominations.status` or `videoask_link` after insert. `nominee_dob` and `videoask_link` exist. The records CSV omits both (`lib/admin/records.ts` 667-680).

Partner inquiries live in `partner_inquiries` (`schema.ts` 213-226, `drizzle/0011_partner_inquiries.sql`). No status, no assignee, no unique key. `submitPartner` (`lib/actions.ts` 138-152) inserts every success, checks Turnstile, rate-limits, and queues an acknowledgement. Support and sponsorship are stored as translated labels.

Contact (`components/contact/ContactPage.tsx` 139-154) sets `window.location.href` to `mailto:`. No table, server action, or Resend send. The waitlist band on that page is a different form.

Do not change public nominate, partner, or contact behavior. Do not touch the apply flow, VideoAsk, Didit, Calendly, Turnstile config, or the apply-flow gate.

## Records and review desk

`RECORD_LISTS` is applicants, nominations, interest, waitlist, partners (`lib/admin/records.ts` 30). Nominations and partners are searchable lists. Their rows have `href: null` (records.ts 661 and the partner row builder). There is no `/admin/records/nominations/[id]` or partner detail route.

CSV is `csvCell` / `toCsv` (records.ts 849-859). A cell starting with `= + - @` tab or CR is prefixed with `'`. The file starts with U+FEFF and uses CRLF. `exportList` re-checks `records.export`, selects the filtered rows in one transaction, and writes `records.exported` with list, row count, and filters. Search text `q` is stored in the audit detail. `subject_id` is null for exports.

Applicant review is a different machine. `applyDecision`, `offeredMoves`, and `transition` move applicants only. Do not reuse them for nominations or partners. Scores and notes are `review_positions` and `review_notes`, keyed by applicant, cycle, and author. Assignment is `applicants.assigned_staff_id` with compare-and-swap, no version bump. Notes are append-only. `review.saved` stores note id and criterion ids, not the note body or scores.

`admin_events.subject_id` references `users` only (`schema.ts` 398-409). Applicant ids go in `detail`. `recordEvent` (`lib/admin/events.ts` 16-38) copies a field into detail only when that key is on the event. Activity labels must not print applicant names. A new event that includes `email` will store that address.

Queues `mine`, `unassigned`, and `needs` exist only for applicants. `needs` is `under_review` and `accepted`. The dashboard has no needs-attention card.

## Staff and dashboard

Capabilities (`lib/staff/roles.ts` 4-22):

- admin: dashboard.read, copy.edit, copy.publish, users.manage, records.export, activity.read, reviews.write, reviews.assign, decisions.confirm
- editor: dashboard.read, copy.edit, copy.publish
- reviewer: dashboard.read, reviews.write

There is no records.read. Seeing lists is dashboard.read, so editors and reviewers already open the nomination and partner lists and cannot export. Pages use `requireStaff`. Mutations use `assertStaffAction` plus same-origin. `can` is checked again inside sensitive writers.

Nav (`app/admin/(console)/layout.tsx`): Dashboard, Records, Copy, Staff, Activity, filtered by capability.

`loadDashboard` (`lib/admin/dashboard.ts`) counts applicant pipeline statuses, nomination statuses (filled with zero), waitlist, interest total, partner total, and 20 recent rows. `DashboardView` links pipeline cards to the applicant list. Nomination counts and the partner total are not links. Recent tables are not links.

Migrations 0014-0016 start with "Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push." 0016 uses `IF NOT EXISTS`. Tests apply SQL from `drizzle/meta/_journal.json` via `tests/db.mjs`. The next file must be `drizzle/0017_*.sql`, journal idx 17, and a matching edit in `schema.ts`. Never run drizzle-kit migrate or push. `users.role` is text, not an enum.

## UI and tests

Shared classes are in `components/admin/marks.tsx`: `card`, `pill`, `quiet`, `field`, `area`, `AdminFrame`. Font is Outfit from the root layout. `gradient-brand` is magenta to orange. Lime is a status-chip color. Desktop breakpoint is `desk` (900px). `RecordsView` repeats class strings instead of importing `pill`. New pages should import the constants.

Admin tests call loaders. They do not render React. `npm test` is `node --test tests/*.test.mjs`. There is no typecheck script. The equivalent is `npx tsc --noEmit`. Lint is `npm run lint`. Build is `npm run build`. No admin seed script.

Identity convergence tests (`tests/application.test.mjs` 522-539) lock the applicant row in `reconcileIdentity`. The later test "identity events for another session or from the past are ignored" (line 610) calls `h.cron()` and expects a new identity link. Cron defaults to 25 jobs (`app/api/cron/jobs/route.ts` 18, `runDueJobs` default 25 in `lib/jobs.ts` 141). Fallback tests call `provisionViaWorker` instead. This test was not changed to do that. The explorer did not run the suite, so the failure is a reading, not a red run.

## Constraints for the new work

Admin only. No member accounts, stories, or beacons. No new public write for contact. Resume links and identity documents stay off admin pages. PII stays out of logs. Nomination CSV must keep omitting date of birth and VideoAsk links. Partner and nomination public inserts stay as they are.
