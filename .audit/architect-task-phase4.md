# Phase 4 design task

Produce one candidate design package. Do not edit the repo. Do not implement. Write files only under the output directory you were given.

Read these first:

- Architect skill: /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/SKILL.md
- Runner rules: /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/runner-prompt.md
- Rationale template: /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/rationale-template.md
- Red flags: /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/design-red-flags.md
- Grounding: /workspace/.audit/how-phase4-findings.md

Write `rationale.md` in the template's shape, and `sketch.md` with the module map, types, and function signatures. Bodies are `not implemented` or short pseudocode. Usage comes before types, and the types must match the usage.

## What to design

Staff desks for nominations and partner inquiries on the existing admin console. List, search, filter, detail, notes, assignment, a staff status workflow, audit rows in `admin_events`, and the existing formula-safe CSV export extended only as far as the new staff columns require. Dashboard home gains counts and needs-attention cards for both, next to applicants.

## Facts you must honor

- Nominations already exist. `nomination_status` is `new`, `invited`, `applied`, `declined`. `submitNomination` always inserts `new` and never updates status. Excel `NOMINATION_COLUMNS` in `lib/excel-rows.ts` includes `status`, `nomineeDob`, and `videoaskLink`. The admin screen and admin CSV omit date of birth and the VideoAsk link. Keep that omission.
- Partner inquiries already exist and have no status, assignee, or unique key. `submitPartner` inserts every success. `support` and `sponsorship` are translated labels.
- Contact is a `mailto:` form. Do not add a public write. Do not add a contact table unless the disabled admin path truly needs one. Prefer no table. The proposal (table, Turnstile, retention, email notice) is named in the rationale, not built.
- `admin_events.subject_id` references `users` only. Record ids go in `detail`. `recordEvent` copies `email` into detail when the event has that field. Do not put note bodies or extra PII in the audit row.
- Export already exists: `exportList` plus `records.exported`, admin-only via `records.export`, formula-safe in `csvCell`. Do not add a second exporter. Do not put note bodies, date of birth, or VideoAsk links in the CSV.
- Applicant review (`applyDecision`, `offeredMoves`, `transition`, `review_positions`, `review_notes`, applicant assignment) stays untouched. Do not reuse it as the nomination or partner writer.
- Public pages, apply flow, VideoAsk, Didit, Calendly, Turnstile config, and the apply-flow gate stay untouched.
- Capabilities today are the closed map in `lib/staff/roles.ts`. Editor has dashboard, copy edit, and copy publish only. Reviewer has dashboard read and reviews.write only. Seeing the current records list is `dashboard.read`.
- Migration must be additive `drizzle/0017_*.sql` with an Apply-by-hand header and `IF NOT EXISTS`. Pair it with `schema.ts`. Do not run drizzle-kit. `users.role` stays text.
- No member accounts, stories, or beacons. Resume links and identity documents stay off admin pages.

## Decisions the sketch must make

Pick one organizing structure for both desks. A state machine and a registry are in play. A second copy of the applicant review module is not.

Status. The requested nomination examples are new, reviewing, contacted, converted to applicant, closed. The requested partner examples are new, in conversation, committed, declined, closed. The existing nomination enum does not match those words, and Excel already ships that enum as `status`. Say whether staff workflow reuses that column, adds a second column, or replaces the enum, and what Excel keeps seeing. Do not create an applicant row when a nomination becomes "converted".

Capabilities. Admin can read and manage both desks, including assignment and status. Reviewer can read nominations and add notes, and cannot assign, change status, export, or open partners. Editor gains no capability. One list of capabilities. Derive role grants from it. Do not leave a second hand-written matrix that can drift.

Needs attention. One definition, used by the dashboard cards and by any filter on the desk. Say which statuses and which assignment states count.

Notes and assignment. Append-only notes. Assignment compare-and-swap, no applicant version bump. Say who may write each.

Audit. Name each new `AdminEvent` kind and the exact detail fields. No note body. No emails unless a staff-account event already does that.

Contact. State why there is or is not a disabled admin route.

## Call sites to show before the types

1. The nomination detail server action that adds a note, and the one that changes status.
2. The dashboard loader reading the needs-attention counts.
3. The export column list after the new columns exist.

## Rejected shapes you must still name in the rationale

Name at least two alternatives you considered and why they lost. Judge them on interface depth.
