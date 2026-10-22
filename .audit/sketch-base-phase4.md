# Staff desks

One case file. Two closed transition graphs. The intake tables stay what the public forms and Excel already write.

## Usage

Callers fix the desk in the server action. The client never posts a desk name. `lib/desk/case.ts` is the only writer of workflow state.

### Nomination note and status

```ts
"use server";

import { revalidatePath } from "next/cache";
import { addNote, isNominationStatus, moveStatus } from "@/lib/desk/case";
import { getDb } from "@/lib/db";
import { assertStaffAction } from "@/lib/staff/gate";
import { parseUserId } from "@/lib/staff/users";

export type DeskFormState =
  | {
      readonly result:
        | "forbidden"
        | "invalid"
        | "not_found"
        | "conflict"
        | "illegal"
        | "invalid_assignee"
        | "saved";
    }
  | null;

export async function addNominationNote(
  _previous: DeskFormState,
  formData: FormData,
): Promise<DeskFormState> {
  const actor = await assertStaffAction("nominations.note");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const noteId = parseUserId(String(formData.get("noteId") ?? ""));
  const body = String(formData.get("body") ?? "");
  if (!recordId || !noteId) return { result: "invalid" };
  const saved = await addNote(getDb(), actor, {
    desk: "nomination",
    recordId,
    noteId,
    body,
  });
  if (!saved.ok) return { result: saved.reason };
  revalidatePath(`/admin/records/nominations/${recordId}`);
  return { result: "saved" };
}

export async function moveNomination(
  _previous: DeskFormState,
  formData: FormData,
): Promise<DeskFormState> {
  const actor = await assertStaffAction("nominations.manage");
  if (!actor) return { result: "forbidden" };
  const recordId = parseUserId(String(formData.get("recordId") ?? ""));
  const expected = String(formData.get("expected") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!recordId || !isNominationStatus(expected) || !isNominationStatus(to)) {
    return { result: "invalid" };
  }
  const moved = await moveStatus(getDb(), actor, {
    desk: "nomination",
    recordId,
    expected,
    to,
  });
  if (!moved.ok) return { result: moved.reason };
  revalidatePath(`/admin/records/nominations/${recordId}`);
  revalidatePath("/admin/records");
  revalidatePath("/admin");
  return { result: "saved" };
}
```

The detail page renders `moves` from `loadDetail`. Each button posts the current token as `expected` and one edge target as `to`. A reviewer render has `moves: []`, so this action is not on their page. Partner pages are the same shape with `desk: "partner"`, `assertStaffAction("partners.manage")`, and `isPartnerStatus`. There is no shared action that reads `desk` from the form.

### Dashboard attention counts

```ts
export async function loadDashboard(
  db: Db,
  viewer: { readonly role: string },
): Promise<Dashboard> {
  return db.transaction(async (tx) => {
    const nominationDesk = await loadDeskSummary(tx, "nomination");
    const partnerWorkflow = can(viewer.role, "partners.read")
      ? await loadDeskSummary(tx, "partner")
      : null;
    // nominationDesk.needsAttention is the card.
    // nominationDesk.counts is every staff status, zeros filled, implicit "new" included.
    // partnerWorkflow is null for editor and reviewer, so their payload has no partner workflow.
    return {
      // pipeline, cycles, waitlist, interest, and recent rows stay.
      // nominations.counts is removed. nominationDesk.counts replaces that card.
      // partners.total stays the arrival count everyone already sees.
      // partnerWorkflow is the staff card, null without partners.read.
      nominationDesk,
      partnerWorkflow,
    };
  });
}
```

`needsAttention` on that summary is the only count the card renders. The list filter `attention=needs` calls the same predicate. Applicant `queue=needs` stays `under_review` and `accepted`. It is a different parameter and a different predicate.

### Export columns

The existing `exportList` path stays. `nominationSheet` and `partnerSheet` append two cells, still passed through `csvCell` and `toCsv`. `status` on the nomination CSV remains the intake enum. `staff_status` is the workflow token (`new` when no case row exists). `assignee_email` is `""` when nobody qualified owns the row.

```ts
const NOMINATION_CSV = [
  "nominator_name", "nominator_email", "nominator_phone", "nominator_organization", "nominator_relation",
  "nominee_name", "nominee_email", "nominee_phone", "nominee_nationality", "nominee_based_in", "nominee_location",
  "track", "status", "created_at", "staff_status", "assignee_email",
] as const;

const PARTNER_CSV = [
  "name", "email", "phone", "organization", "designation", "support", "sponsorship", "message", "created_at",
  "staff_status", "assignee_email",
] as const;
```

No `nominee_dob`. No `videoask_link`. No note body. `NOMINATION_COLUMNS` and `PARTNER_COLUMNS` in `lib/excel-rows.ts` do not gain these headers. Excel keeps seeing nomination `status` as `new | invited | applied | declined`.

## Types

```ts
export const USER_ROLES = ["admin", "editor", "reviewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// The only capability matrix. ROLE_CAPABILITIES and CAPABILITIES are derived.
const GRANTS = [
  ["dashboard.read", "admin", "editor", "reviewer"],
  ["copy.edit", "admin", "editor"],
  ["copy.publish", "admin", "editor"],
  ["users.manage", "admin"],
  ["records.export", "admin"],
  ["activity.read", "admin"],
  ["reviews.write", "admin", "reviewer"],
  ["reviews.assign", "admin"],
  ["decisions.confirm", "admin"],
  ["nominations.read", "admin", "reviewer"],
  ["nominations.note", "admin", "reviewer"],
  ["nominations.manage", "admin"],
  ["partners.read", "admin"],
  ["partners.manage", "admin"],
] as const satisfies readonly (readonly [string, ...UserRole[]])[];

export type Capability = (typeof GRANTS)[number][0];
export const CAPABILITIES = GRANTS.map((row) => row[0]);
export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  admin: capabilitiesFor("admin"),
  editor: capabilitiesFor("editor"),
  reviewer: capabilitiesFor("reviewer"),
};

export type DeskId = "nomination" | "partner";

export type NominationStatus = "new" | "reviewing" | "contacted" | "converted" | "closed";
export type PartnerStatus = "new" | "in_conversation" | "committed" | "declined" | "closed";

export type NoteCommand = {
  readonly desk: DeskId;
  readonly recordId: string;
  readonly noteId: string;
  readonly body: string;
};

// Status tokens are tied to the desk. A partner target cannot be passed on a nomination command.
export type MoveCommand =
  | { readonly desk: "nomination"; readonly recordId: string; readonly expected: NominationStatus; readonly to: NominationStatus }
  | { readonly desk: "partner"; readonly recordId: string; readonly expected: PartnerStatus; readonly to: PartnerStatus };

export type AssignCommand = {
  readonly desk: DeskId;
  readonly recordId: string;
  readonly assigneeId: string | null;
  readonly expectedAssigneeId: string | null;
};

export type DeskResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "forbidden" | "invalid" | "not_found" | "conflict" | "illegal" | "invalid_assignee";
    };

export type DeskSummary = {
  readonly desk: DeskId;
  readonly list: "nominations" | "partners";
  readonly total: number;
  readonly needsAttention: number;
  readonly counts: readonly { readonly status: string; readonly label: string; readonly count: number }[];
};

export type DeskDetail = {
  readonly desk: DeskId;
  readonly recordId: string;
  readonly heading: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly assignee: { readonly id: string; readonly name: string; readonly email: string } | null;
  readonly moves: readonly { readonly to: string; readonly label: string }[];
  readonly canNote: boolean;
  readonly canAssign: boolean;
  readonly assignees: readonly { readonly id: string; readonly name: string; readonly email: string }[];
  readonly notes: readonly { readonly id: string; readonly authorName: string; readonly body: string; readonly createdAt: string }[];
  readonly fields: readonly { readonly label: string; readonly value: string }[];
};

type Node = { readonly id: string; readonly label: string; readonly open: boolean };
type Machine = {
  readonly initial: "new";
  readonly nodes: readonly Node[];
  readonly edges: readonly (readonly [string, string])[];
};
```

`open: true` is the attention set. It is not a second list.

```ts
// Unexported. Both machines live in lib/desk/case.ts.
const MACHINES = {
  nomination: {
    initial: "new",
    nodes: [
      { id: "new", label: "New", open: true },
      { id: "reviewing", label: "Reviewing", open: true },
      { id: "contacted", label: "Contacted", open: true },
      { id: "converted", label: "Converted to applicant", open: false },
      { id: "closed", label: "Closed", open: false },
    ],
    edges: [
      ["new", "reviewing"],
      ["new", "closed"],
      ["reviewing", "contacted"],
      ["reviewing", "closed"],
      ["contacted", "converted"],
      ["contacted", "closed"],
    ],
  },
  partner: {
    initial: "new",
    nodes: [
      { id: "new", label: "New", open: true },
      { id: "in_conversation", label: "In conversation", open: true },
      { id: "committed", label: "Committed", open: false },
      { id: "declined", label: "Declined", open: false },
      { id: "closed", label: "Closed", open: false },
    ],
    edges: [
      ["new", "in_conversation"],
      ["new", "declined"],
      ["new", "closed"],
      ["in_conversation", "committed"],
      ["in_conversation", "declined"],
      ["in_conversation", "closed"],
    ],
  },
} as const satisfies Record<DeskId, Machine>;
```

There is no edge into `converted` except `contacted → converted`. There is no edge out of `converted`, `committed`, `declined`, or `closed`. `new → closed` is the side exit for a row that should not be worked.

Storage, in `lib/db/schema.ts` and `drizzle/0017_desk_cases.sql`. Text, not a new pg enum. `nominations.status` and `nomination_status` stay as they are.

```ts
export const deskCases = pgTable("desk_cases", {
  desk: text("desk").notNull(),
  recordId: uuid("record_id").notNull(),
  status: text("status").notNull(),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [
  primaryKey({ columns: [t.desk, t.recordId] }),
  index("desk_cases_assignee_idx").on(t.assigneeId),
  check("desk_cases_desk", sql`${t.desk} in ('nomination', 'partner')`),
  check("desk_cases_status", sql`
    (${t.desk} = 'nomination' and ${t.status} in ('new', 'reviewing', 'contacted', 'converted', 'closed'))
    or (${t.desk} = 'partner' and ${t.status} in ('new', 'in_conversation', 'committed', 'declined', 'closed'))
  `),
]);

export const deskNotes = pgTable("desk_notes", {
  id: uuid("id").primaryKey(),
  desk: text("desk").notNull(),
  recordId: uuid("record_id").notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("desk_notes_desk", sql`${t.desk} in ('nomination', 'partner')`),
  check("desk_notes_body_len", sql`char_length(${t.body}) between 1 and 4000`),
  index("desk_notes_record_idx").on(t.desk, t.recordId, t.createdAt),
]);
```

No `updated_at` and no version. Compare-and-swap uses `status` for a move and `assignee_id` for assignment. History is `admin_events`. A missing `desk_cases` row is the initial state: status `new`, assignee null. `submitNomination` and `submitPartner` do not insert a case.

Audit variants appended to `AdminEvent`. None of them have an `email` field. `recordEvent` copies `email` whenever that key exists, so the key must be absent, not null.

```ts
| { readonly kind: "nomination.noted"; readonly nominationId: string; readonly noteId: string }
| { readonly kind: "nomination.status"; readonly nominationId: string; readonly from: NominationStatus; readonly to: NominationStatus }
| { readonly kind: "nomination.assigned"; readonly subject: string | null; readonly nominationId: string; readonly assigneeId: string | null; readonly previousAssigneeId: string | null }
| { readonly kind: "partner.noted"; readonly partnerId: string; readonly noteId: string }
| { readonly kind: "partner.status"; readonly partnerId: string; readonly from: PartnerStatus; readonly to: PartnerStatus }
| { readonly kind: "partner.assigned"; readonly subject: string | null; readonly partnerId: string; readonly assigneeId: string | null; readonly previousAssigneeId: string | null }
```

`subject` is set only on the two assigned kinds, and only to the new assignee (null when clearing). `subject_id` keeps referencing `users`. Record ids stay in `detail`. The copier gains `nominationId` and `partnerId`. It already copies `from`, `to`, `noteId`, `assigneeId`, and `previousAssigneeId`.

## Signatures

```ts
function capabilitiesFor(role: UserRole): readonly Capability[] {
  throw new Error("not implemented");
  // GRANTS.flatMap(row => row.slice(1).includes(role) ? [row[0]] : [])
}

export function can(role: string, capability: Capability): boolean {
  return isUserRole(role) && ROLE_CAPABILITIES[role].includes(capability);
}

export function isNominationStatus(value: string): value is NominationStatus {
  throw new Error("not implemented");
}

export function isPartnerStatus(value: string): value is PartnerStatus {
  throw new Error("not implemented");
}

export function legalMove(desk: DeskId, from: string, to: string): boolean {
  throw new Error("not implemented");
  // true when from === to, or MACHINES[desk].edges contains [from, to]
  // same-status is not an edge and is not offered in DeskDetail.moves
}

export function needsAttention(
  desk: DeskId,
  status: string,
  assignee: { readonly role: string; readonly disabled: boolean } | null,
): boolean {
  throw new Error("not implemented");
  // false when the node is missing or node.open is false
  // true when open and assignee is null, disabled, or lacks VERBS[desk].manage
  // managersOf(desk) is USER_ROLES.filter(role => can(role, VERBS[desk].manage))
}

const VERBS = {
  nomination: { read: "nominations.read", note: "nominations.note", manage: "nominations.manage" },
  partner: { read: "partners.read", note: "partners.manage", manage: "partners.manage" },
} as const satisfies Record<DeskId, { read: Capability; note: Capability; manage: Capability }>;

export function addNote(db: Db, actor: Staff, command: NoteCommand): Promise<DeskResult> {
  throw new Error("not implemented");
  // 1. forbidden unless can(actor.role, VERBS[command.desk].note)
  // 2. invalid unless noteId is a uuid and trim(body) length is 1..4000
  // 3. lock the intake row (nominations or partner_inquiries) for update
  // 4. not_found when that row is absent
  // 5. insert desk_notes with the trimmed body, on conflict (id) do nothing, returning id
  // 6. when a row was inserted, recordEvent nomination.noted or partner.noted
  //    detail is { nominationId|partnerId, noteId } and nothing else
  // 7. when the id already existed, return ok and write no event; the first body stands
}

export function moveStatus(db: Db, actor: Staff, command: MoveCommand): Promise<DeskResult> {
  throw new Error("not implemented");
  // 1. forbidden unless can(actor.role, VERBS[command.desk].manage)
  // 2. lock the intake row for update; not_found when absent
  // 3. current = case.status or MACHINES[desk].initial when no case row
  // 4. conflict when current !== command.expected
  // 5. ok, no write, no event, when current === command.to
  // 6. illegal when legalMove is false
  // 7. insert the case or update desk_cases.status where status = expected
  //    a lost race returns conflict; the intake lock makes that race wait
  // 8. recordEvent *.status with from, to, and the record id
  // never update nominations.status, never recordChange, never insert an applicant
}

export function assignStaff(db: Db, actor: Staff, command: AssignCommand): Promise<DeskResult> {
  throw new Error("not implemented");
  // 1. forbidden unless can(actor.role, VERBS[command.desk].manage)
  // 2. invalid when assigneeId is a non-null non-uuid
  // 3. lock the intake row; not_found when absent
  // 4. current = case.assigneeId or null
  // 5. conflict when current !== command.expectedAssigneeId (null matches null)
  // 6. ok, no write, no event, when current === command.assigneeId
  // 7. invalid_assignee when the user is missing, disabled, or not in managersOf(desk)
  // 8. insert (status = initial) or update assignee_id where assignee_id is not distinct from expected
  // 9. recordEvent *.assigned, subject = assigneeId, previousAssigneeId = current
  // no version column and no bump of any applicant column
}

export function loadDetail(db: Db, actor: Staff, desk: DeskId, recordId: string): Promise<DeskDetail | null> {
  throw new Error("not implemented");
  // null when the actor lacks VERBS[desk].read, the id is not a uuid, or the intake row is missing
  // status is the effective token; statusLabel comes from the node
  // moves is the edge list from that token, labels included, and [] unless the actor has manage
  // canNote / canAssign come from VERBS, not from a second role switch
  // assignees is enabled managersOf(desk), and [] unless canAssign
  // notes are oldest first; bodies are read here and nowhere in admin_events
  // nomination fields: nominator name, email, phone, organization, relation;
  //   nominee name, email, phone, nationality, based in, location, track;
  //   intake status (the enum token, label "Intake status"); created
  //   omit nominee_dob and videoask_link
  // partner fields: name, email, phone, organization, designation, support, sponsorship, message, created
  // heading is the nominee name, or the partner organization
}

export function loadDeskSummary(tx: Tx, desk: DeskId): Promise<DeskSummary> {
  throw new Error("not implemented");
  // left join desk_cases; coalesce(status, initial); group; fill every node in order with zero
  // total is the sum of those counts, not a second query
  // needsAttention is count(*) where the shared attention predicate is true
  // list is listOfDesk(desk)
}

export function deskOfList(list: RecordList): DeskId | null {
  throw new Error("not implemented");
  // nominations → nomination, partners → partner, anything else → null
}

export function listOfDesk(desk: DeskId): "nominations" | "partners" {
  throw new Error("not implemented");
}

export function statusOptions(desk: DeskId): readonly (readonly [string, string])[] {
  throw new Error("not implemented");
  // node id, node label, machine order
}

export function deskWhere(
  desk: DeskId,
  recordId: SQL,
  query: { readonly status: string; readonly attention: "" | "needs" },
): SQL | "empty" {
  throw new Error("not implemented");
  // unknown status token → "empty"
  // status compares effectiveStatus, which is coalesce(case.status, initial)
  // attention === "needs" appends the same predicate as needsAttention
  // a live enabled manager assignee drops the row; a null, disabled, or demoted assignee keeps an open row
}

export function deskColumns(
  desk: DeskId,
  recordId: SQL,
): { readonly status: SQL<string>; readonly label: SQL<string>; readonly assigneeEmail: SQL<string | null> } {
  throw new Error("not implemented");
  // status token, label, and users.email for a non-null assignee
  // records.ts uses these for the screen and the CSV and does not select from desk_cases itself
}
```

`needsAttention` and the SQL inside `deskWhere` / `loadDeskSummary` both take open-node ids from `MACHINES` and manager roles from `managersOf`. Neither function lists statuses or role names of its own.

Attention, in one sentence: an open row needs attention when it has no assignee who is enabled and currently holds that desk's manage capability. Open means `new`, `reviewing`, and `contacted` for nominations, and `new` and `in_conversation` for partners. `converted`, `closed`, `committed`, and `declined` never count. A missing case row counts, because it is `new` and unassigned.

## Module map

`lib/desk/case.ts` is the module. It owns the machines, the three commands, the detail and summary reads, and the SQL fragments the list and export use. App routes, `records.ts`, and `dashboard.ts` do not import `deskCases` or `deskNotes`. Schema exports those tables because drizzle requires it. A second importer is a bug, not an extension point.

| File | Change |
| --- | --- |
| `lib/staff/roles.ts` | Replace the hand-written `ROLE_CAPABILITIES` pairs with `GRANTS`. `can` stays. Editor's derived set is `dashboard.read`, `copy.edit`, `copy.publish`. |
| `lib/desk/case.ts` | New. The file above. |
| `lib/db/schema.ts` | Add `deskCases` and `deskNotes`. Do not alter `nominationStatus` or `partnerInquiries` columns. |
| `drizzle/0017_desk_cases.sql` | Additive migration. Journal idx 17, tag `0017_desk_cases`, `when` `1793300000000`. |
| `lib/admin/events.ts` | Six `AdminEvent` variants. Copier writes `nominationId` and `partnerId` when present. |
| `lib/admin/activity.ts` | One arm per kind. Labels below. |
| `lib/admin/records.ts` | Query, list, href, CSV. Reads through `deskWhere` and `deskColumns`. |
| `lib/admin/dashboard.ts` | `loadDashboard(db, viewer)`. Replace intake-enum nomination counts with `nominationDesk`. Keep `partners.total` and partner recent rows. Attach `partnerWorkflow` only when `can(viewer.role, "partners.read")`. Recent nomination status becomes the staff label. |
| `app/admin/(console)/page.tsx` | Pass `staff.role` into the loader and the view. |
| `app/admin/(console)/records/page.tsx` | Redirect `list=partners` without `partners.read` to `/admin?denied=1`. |
| `app/admin/(console)/records/nominations/[id]/page.tsx` | `requireStaff("nominations.read")`, then `loadDetail`. `notFound` on null. |
| `app/admin/(console)/records/nominations/[id]/actions.ts` | The note and move actions in Usage, plus `assignNomination` posting `assigneeId` and `expectedAssigneeId`. |
| `app/admin/(console)/records/partners/[id]/page.tsx` | `requireStaff("partners.read")`. |
| `app/admin/(console)/records/partners/[id]/actions.ts` | Same three actions, partner literals, `partners.manage` for note, move, and assign. |
| `components/admin/DeskView.tsx` | One view. Props are `DeskDetail` and the three bound actions. Uses `card`, `field`, `area`, `pill` from `components/admin/marks.tsx`. Hides a form when `canNote` is false, `moves` is empty, or `canAssign` is false. |
| `components/admin/DashboardView.tsx` | Nomination attention card links to `/admin/records?list=nominations&attention=needs`. Status counts link to `&status=`. Partner card renders only when `partnerWorkflow` is non-null. |
| `components/admin/RecordsView.tsx` | Desk status options come from `RecordPage.statusOptions`. Attention choice is `needs` or any, desk lists only. Partners tab omitted without `partners.read`. Export hidden inputs include `attention`. |
| `tests/desk.test.mjs` | Pure graph, grant derivation, attention predicate, migration token lock. |

`RecordQuery` gains `attention: "" | "needs"`. `parseRecordQuery` keeps the value only when it is exactly `needs`. `auditOf`, `hrefFor`, and the export form all read that field. `queue` is untouched and is still applicant-only.

List headers become `Nominator, Nominee, Email, Track, Status, Assignee, Created` and `Name, Email, Organization, Support, Status, Assignee, Created`. The Status cell is the staff label. The Assignee cell is the staff name, else email, else empty. Nomination href is `/admin/records/nominations/${id}` when `can(role, "nominations.read")`, else null. Partner href requires `partners.read`. Search `q` stays on the intake columns it already uses and does not match note bodies.

Activity labels, with no names, emails, note text, or record ids:

- `nomination.noted`: `Added a nomination note`
- `nomination.status`: `Moved a nomination from ${from} to ${to}`
- `nomination.assigned`: `Assigned a nomination` or `Cleared a nomination assignee`
- `partner.noted`: `Added a partner note`
- `partner.status`: `Moved a partner inquiry from ${from} to ${to}`
- `partner.assigned`: `Assigned a partner inquiry` or `Cleared a partner assignee`

```sql
-- Desk cases for nominations and partner inquiries.
-- Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push.

CREATE TABLE IF NOT EXISTS "desk_cases" (
  "desk" text NOT NULL,
  "record_id" uuid NOT NULL,
  "status" text NOT NULL,
  "assignee_id" uuid REFERENCES "users"("id") ON DELETE set null,
  PRIMARY KEY ("desk", "record_id"),
  CONSTRAINT "desk_cases_desk" CHECK ("desk" in ('nomination', 'partner')),
  CONSTRAINT "desk_cases_status" CHECK (
    ("desk" = 'nomination' AND "status" in ('new', 'reviewing', 'contacted', 'converted', 'closed'))
    OR ("desk" = 'partner' AND "status" in ('new', 'in_conversation', 'committed', 'declined', 'closed'))
  )
);
CREATE INDEX IF NOT EXISTS "desk_cases_assignee_idx" ON "desk_cases" ("assignee_id");

CREATE TABLE IF NOT EXISTS "desk_notes" (
  "id" uuid PRIMARY KEY,
  "desk" text NOT NULL,
  "record_id" uuid NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "desk_notes_desk" CHECK ("desk" in ('nomination', 'partner')),
  CONSTRAINT "desk_notes_body_len" CHECK (char_length("body") BETWEEN 1 AND 4000)
);
CREATE INDEX IF NOT EXISTS "desk_notes_record_idx" ON "desk_notes" ("desk", "record_id", "created_at");
```

No backfill. Existing rows are `new` and unassigned by absence.

### Left alone

`submitNomination`, `submitPartner`, `NOMINATION_COLUMNS`, Excel sync, `lib/review/**`, `applyDecision`, `offeredMoves`, `transition`, applicant assignment, the apply flow, VideoAsk, Didit, Calendly, Turnstile, and the apply-flow gate. No contact table and no `/admin` contact route. No member accounts, stories, beacons, resume links, or identity documents on these pages. `users.role` stays text.

### Call chain

Action file asserts the capability and pins the desk literal. `case.ts` locks the intake row, checks the graph, writes one case or note row, and records one event. The page reads `DeskDetail`. That is two files of behavior. `records.ts` and `dashboard.ts` call into `case.ts` and do not write.
