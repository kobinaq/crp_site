# Staff desks

## Problem

Nominations and partner inquiries need a staff desk: list, search, filter, detail, append-only notes, compare-and-swap assignment, a status workflow, `admin_events` rows, and two extra columns on the existing formula-safe CSV. The nomination row already has `nomination_status` (`new`, `invited`, `applied`, `declined`). That enum is Excel's `status` header, `submitNomination` only inserts `new`, and no app code advances it. The staff words (reviewing, contacted, converted, closed) are a different fact. Partner inquiries have no status, no assignee, and no unique key; every successful `submitPartner` inserts another row. Applicant review already has notes and assignment, on other tables, with cycles and versions this work must not call. `admin_events.subject_id` references `users` only, and `recordEvent` copies `email` into detail whenever an event carries that field. Seeing a records list today is `dashboard.read`, so editors and reviewers already open both lists. Contact is a `mailto:` link with no stored rows.

## Usage (caller's view)

The server action pins the desk. The form does not.

```ts
export async function addNominationNote(_previous: DeskFormState, formData: FormData): Promise<DeskFormState> {
  const actor = await assertStaffAction("nominations.note");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const noteId = parseUserId(String(formData.get("noteId") ?? ""));
  const body = String(formData.get("body") ?? "");
  if (!recordId || !noteId) return { result: "invalid" };
  const saved = await addNote(getDb(), actor, { desk: "nomination", recordId, noteId, body });
  if (!saved.ok) return { result: saved.reason };
  revalidatePath(`/admin/records/nominations/${recordId}`);
  return { result: "saved" };
}

export async function moveNomination(_previous: DeskFormState, formData: FormData): Promise<DeskFormState> {
  const actor = await assertStaffAction("nominations.manage");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const expected = String(formData.get("expected") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!recordId || !isNominationStatus(expected) || !isNominationStatus(to)) return { result: "invalid" };
  const moved = await moveStatus(getDb(), actor, { desk: "nomination", recordId, expected, to });
  if (!moved.ok) return { result: moved.reason };
  revalidatePath(`/admin/records/nominations/${recordId}`);
  revalidatePath("/admin/records");
  revalidatePath("/admin");
  return { result: "saved" };
}
```

The dashboard loader asks the case module for both counts inside its existing transaction. Partner workflow is omitted unless the viewer has `partners.read`.

```ts
const nominationDesk = await loadDeskSummary(tx, "nomination");
const partnerWorkflow = can(viewer.role, "partners.read") ? await loadDeskSummary(tx, "partner") : null;
// nominationDesk.needsAttention and partnerWorkflow.needsAttention are the cards.
```

Export stays `exportList`. Nomination headers keep intake `status` and append `staff_status`, `assignee_email`. Partner headers append the same two names. Both still go through `csvCell`.

## Shape

Staff workflow does not reuse `nominations.status`, does not replace `nomination_status`, and does not add a sibling column on `nominations` or `partner_inquiries`. Excel keeps reading the intake enum, which the app still never updates. Current staff state is one row in `desk_cases`, keyed by `(desk, record_id)`. Notes are append-only rows in `desk_notes`. A missing case row means status `new` and assignee null, so public inserts stay untouched and the migration does not backfill.

The organizing structure is two closed graphs in `lib/desk/case.ts`, not a desk registry. Nomination edges run `new → reviewing → contacted → converted`, with `closed` as a side exit from each non-terminal. Partner edges run `new → in_conversation → committed`, with `declined` and `closed` as side exits. `converted` writes only the case status. It does not look up or insert an applicant. Terminals have no outgoing edge. Posting the current status again is a successful no-op with no second audit row.

Capabilities are one grant table. `CAPABILITIES` and `ROLE_CAPABILITIES` are derived from it. New grants: `nominations.read` and `nominations.note` for admin and reviewer; `nominations.manage`, `partners.read`, and `partners.manage` for admin. Editor is on none of those rows. Partner notes use `partners.manage`, because nobody can note a partner without managing it. The nomination list stays on `dashboard.read`, which editors already have; detail and notes require `nominations.read`. The partner list and detail require `partners.read`, so a reviewer cannot open partners. That also removes the partner list from editors. There is no second role matrix and no `role === "reviewer"` branch.

Needs attention is one predicate, used by `loadDeskSummary` and by `deskWhere` for `attention=needs`. An open row counts when it has no assignee who is enabled and holds that desk's manage capability. Open nodes are nomination `new`, `reviewing`, `contacted`, and partner `new`, `in_conversation`. The manager role list is `USER_ROLES.filter(role => can(role, manage))`, the same function `assignStaff` uses to accept an assignee. Applicant `queue=needs` is not this predicate.

Assignment is compare-and-swap on `assignee_id`, with the intake row locked `for update`. There is no version column. Notes take a client id, insert `on conflict do nothing`, and audit only when a row was inserted. Each command checks its capability before querying. `recordEvent` learns six kinds. Detail is the record id plus `noteId`, or `from`/`to`, or `assigneeId`/`previousAssigneeId`. Assigned events set `subject` to the new assignee. Noted and status events omit `subject` and omit `email`. Activity labels name the desk and the status tokens, not people or note text.

Commands are `addNote`, `moveStatus`, and `assignStaff`. Reads are `loadDetail`, `loadDeskSummary`, `statusOptions`, `deskWhere`, and `deskColumns`. Behind them: the graphs, implicit `new`, the intake lock, assignee eligibility, the attention join, the audit kind map, and the refusal to touch Excel or applicants. Callers see a command result or a view model. They do not see edges, table names, or which detail keys are safe. `records.ts` never selects `desk_cases` itself. Per boundary-discipline, the action parses strings and the module treats typed commands as already narrowed, then rechecks the edge. Per encode-lessons-in-structure, a partner status is not a legal `MoveCommand` for a nomination. The case row stores no timestamps; when something changed is the audit row, so there is nothing to keep in sync.

Contact has no admin route. The page does not persist a message, so a disabled route would be an empty desk. The unimplemented proposal is a contact table, Turnstile on a public write, a retention rule, and an email notice. None of that is in this design.

## Synthesis decision

Placeholder for the orchestrator.

## Tradeoffs accepted

- We accept that editors lose the partner list in exchange for excluding reviewers without a handwritten role exception or a new editor capability.
- We accept a frozen intake enum that the desk does not show as its status, while the nomination CSV still has that enum in `status`, in exchange for leaving the Excel workbook's header and vocabulary alone.
- We accept no jump to `converted` and no edge out of a terminal in exchange for an audit trail that can only contain real steps.
- We accept no `mine` queue in exchange for keeping assignment as ownership inside the attention predicate. Assigned rows stay on the unfiltered list.
- We accept that a missing case row is `new` in exchange for not writing workflow state from `submitNomination` or `submitPartner`.
- We accept a demoted or disabled assignee putting an open row back on the card in exchange for one definition of "a manager still owns this."
- We accept `declined` as a partner staff word that is unrelated to nomination intake `declined`. A nomination filter of `declined` or `invited` matches nothing.

## Alternatives considered

A desk registry (`DESKS[id]` carrying table, columns, transitions, CSV headers, and grants) lost on interface depth. The registry publishes every difference, so list, export, and dashboard each learn the plugin shape. It hides almost nothing. The graphs hide the transitions; CSV headers stay next to the exporter that already owns them.

A second copy of `lib/review`, or calling `transition` / `assignReviewer` with a dummy cycle, lost on interface depth the other way. Callers would have to know review cycles, scores, versions, and applicant locks to change a nomination. Those rules are the wrong complexity, and they write applicant-owned tables.

Reusing `nominations.status`, replacing the enum, or adding `staff_status` on each intake table lost because it couples the staff graph to the Excel payload. `submitNomination` syncs the whole row. A sibling column also leaves partners, which have no enum, on a second writer. One case table is the writer for both desks.

## Open questions and risks

- Should unassigned `contacted` and `in_conversation` stay on the needs-attention card, or does "contacted" mean the team is waiting on the other party?
- Should `converted`, `committed`, `declined`, and `closed` stay terminal if a mistaken click has to be undone?
- Should disabling or demoting the assignee put the row back on the card, which is what `needsAttention` does now?
- Is the existing partner total enough for editors once the partner list is admin-only?
- `tests/admin.test.mjs` asserts an intake `declined` count on the dashboard. That card becomes staff statuses, so the assertion has to move with it.

## Next implementation step

Add the `GRANTS` rows in `lib/staff/roles.ts` and the pure machines in `lib/desk/case.ts` (`nodes`, `edges`, `legalMove`, `needsAttention`), then land `drizzle/0017_desk_cases.sql` and the matching `schema.ts` tables those types describe.
