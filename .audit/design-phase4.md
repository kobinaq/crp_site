# Phase 4 staff desks

Base is the Grok sketch at `.audit/sketch-base-phase4.md`. This file is the contract. Where they differ, this file wins.

## Organizing structure

One module, `lib/desk/case.ts`, owns two closed transition graphs, the case row, the notes, and the needs-attention predicate. A missing `desk_cases` row means status `new` and no assignee. Public inserts do not write a case. `nominations.status` stays the Excel intake enum. `submitNomination` and `submitPartner` are not edited.

## Grafts on the base

Editors and reviewers keep the Records lists they already open with `dashboard.read`. Do not redirect `list=partners`. A nomination row links to `/admin/records/nominations/[id]` only when the viewer has `nominations.read`. A partner row links to `/admin/records/partners/[id]` only when the viewer has `partners.read`. Editors see both lists and no detail link. Reviewers open nomination detail and notes. They do not open partner detail.

The dashboard keeps `nominations.counts` filled from `nomination_status`, including the zero `declined` count the admin test asserts. Add needs-attention counts beside that. Do not replace the intake counts with staff statuses. `partners.total` stays visible to every dashboard reader. The new cards are visible on the dashboard too. Their links go to the records list, which those readers can already open.

Terminal statuses can move back to `new` only. That is the undo. Same-status posts stay a successful no-op with no second audit row. `converted` still does not create an applicant.

## Status graphs

Nomination edges: `new → reviewing`, `new → closed`, `reviewing → contacted`, `reviewing → closed`, `contacted → converted`, `contacted → closed`, `closed → new`, `converted → new`.

Partner edges: `new → in_conversation`, `new → declined`, `new → closed`, `in_conversation → committed`, `in_conversation → declined`, `in_conversation → closed`, `closed → new`, `committed → new`, `declined → new`.

Open nodes, the only ones that can need attention: nomination `new`, `reviewing`, `contacted`. Partner `new`, `in_conversation`.

Needs attention is one predicate, shared by `loadDeskSummary` and the list filter `attention=needs`. An open row needs attention when it has no assignee who is enabled and holds that desk's manage capability. A missing case row counts, because it is `new` and unassigned. Applicant `queue=needs` stays a different parameter.

## Capabilities

One `GRANTS` table in `lib/staff/roles.ts`. `CAPABILITIES` and `ROLE_CAPABILITIES` are derived from it. There is no second matrix.

New rows:

- `nominations.read` for admin and reviewer
- `nominations.note` for admin and reviewer
- `nominations.manage` for admin
- `partners.read` for admin
- `partners.manage` for admin

Editor's derived set stays `dashboard.read`, `copy.edit`, `copy.publish`. Export stays `records.export`. Partner notes use `partners.manage`.

## Storage

`drizzle/0017_desk_cases.sql`. Header lines:

```
-- Desk cases for nominations and partner inquiries.
-- Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push.
```

`CREATE TABLE IF NOT EXISTS` for `desk_cases` and `desk_notes`, checks, and indexes, as in the base sketch. Journal idx 17, tag `0017_desk_cases`, when `1793300000000`, breakpoints true. Pair `lib/db/schema.ts`. Do not add columns to `nominations` or `partner_inquiries`. Do not create a Postgres enum. Do not run drizzle-kit.

## Commands

`addNote`, `moveStatus`, and `assignStaff` in `lib/desk/case.ts` are the only writers. They recheck `can` before they query. They lock the intake row. They do not call `recordChange`, `applyDecision`, or `transition`. Notes are append-only, 1 to 4000 characters, idempotent on the client note id. Assignment is compare-and-swap on `assignee_id` with no version column. A repeat of the current assignee writes nothing.

Audit kinds and detail fields are the six in the base sketch. No `email` field. No note body. `subject` is set only on the assigned kinds, to the new assignee or null when clearing. Activity labels name the desk and the status tokens, not people, emails, or note text.

## Reads, list, export, pages

`loadDetail` omits `nominee_dob` and `videoask_link`. It omits resume links and identity documents because those columns are not on these tables. CSV stays `exportList` and `csvCell`. Nomination headers keep the current cells, including intake `status`, and append `staff_status` and `assignee_email`. Partner headers append the same two. No note body. `NOMINATION_COLUMNS` and `PARTNER_COLUMNS` do not change.

Search stays on the intake columns. It does not search note bodies. `attention=needs` is a records query field. Do not reuse applicant `queue`.

Pages:

- `app/admin/(console)/records/nominations/[id]/page.tsx`
- `app/admin/(console)/records/nominations/[id]/actions.ts`
- `app/admin/(console)/records/partners/[id]/page.tsx`
- `app/admin/(console)/records/partners/[id]/actions.ts`
- `components/admin/DeskView.tsx`

Import `card`, `pill`, `quiet`, `field`, and `area` from `components/admin/marks.tsx`. One detail view. Hide note, move, and assign controls when the viewer cannot use them. Server actions pin the desk literal. The form does not post a desk name.

## Contact

No contact table. No admin contact route. No public write. Add `docs/contact-messages.md`. It is an explanation for the owner, not a tutorial. Say what storing messages would need: a table, Turnstile on a public write, a retention rule, and an email notice. Do not change `components/contact/ContactPage.tsx`.

## Identity test

The test named "identity events for another session or from the past are ignored" in `tests/application.test.mjs` calls `h.cron()`, and the cron drains 25 jobs. Reproduce it before editing it. If it fails because the retry job is left outside that 25, call the identity session handler the way `provisionViaWorker` already does. Do not raise the cron limit. If the test passes, leave it and say so.

## Left alone

Public nominate, partner, and contact behavior. Apply flow, VideoAsk, Didit, Calendly, Turnstile config, the apply-flow gate. Applicant review, `applyDecision`, scores, notes, and assignment. Member accounts, stories, beacons. No secrets in code. No PII in logs.

## Done

`node --test tests/*.test.mjs`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass. Work on branch `cursor/admin-intake-desks-a8be`. Commit each green unit. Do not push. Do not open a pull request. Do not run drizzle-kit migrate or push.
