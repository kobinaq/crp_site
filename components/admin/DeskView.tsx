"use client";

import { useActionState, useState } from "react";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button } from "@/components/admin/Button";
import { EmailLine } from "@/components/admin/EmailLine";
import { RecordChrome } from "@/components/admin/RecordChrome";
import { ResultLine } from "@/components/admin/ResultLine";
import { When } from "@/components/admin/When";
import { area, card } from "@/components/admin/marks";
import { intakeLabel, languageLabel, trackLabel } from "@/lib/admin/labels";
import type { DeskDetail } from "@/lib/desk/case";

type DeskFormState =
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

type DeskAction = (previous: DeskFormState, formData: FormData) => Promise<DeskFormState>;

const RESULT: Record<NonNullable<DeskFormState>["result"], string> = {
  saved: "Saved.",
  forbidden: "You don't have permission to do that.",
  invalid: "Not saved. Check the form and try again.",
  not_found: "This could not be found. It may have been removed.",
  conflict: "Someone else changed this. Reload the page and try again.",
  illegal: "That change isn't available right now.",
  invalid_assignee: "That person can't be assigned here.",
};

export function DeskView({
  detail,
  listHref,
  backLabel,
  previous,
  next,
  noteId,
  noteAction,
  moveAction,
  assignAction,
}: {
  detail: DeskDetail;
  listHref: string;
  backLabel: string;
  previous: string | null;
  next: string | null;
  noteId: string;
  noteAction: DeskAction;
  moveAction: DeskAction;
  assignAction: DeskAction;
}) {
  const options = detail.assignee && !detail.assignees.some((person) => person.id === detail.assignee?.id)
    ? [...detail.assignees, detail.assignee]
    : detail.assignees;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <RecordChrome
        backHref={listHref}
        backLabel={backLabel}
        title={detail.heading}
        previous={previous}
        next={next}
        meta={<p className="text-sm font-semibold">{detail.statusLabel}</p>}
      />
      <section className={card}>
        <h2 className="text-lg font-semibold">Details</h2>
        <dl className="mt-4 grid gap-4 desk:grid-cols-2">
          {detail.fields.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-black/50">{item.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm">{fieldValue(item.label, item.value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      {detail.moves.length > 0 ? (
        <section className={`${card} desk:sticky desk:top-36 desk:z-10`}>
          <h2 className="text-lg font-semibold">Status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.moves.map((move) => (
              <MoveButton key={`${detail.recordId}:${move.to}`} detail={detail} move={move} action={moveAction} />
            ))}
          </div>
        </section>
      ) : null}
      <section className={card}>
        <h2 className="text-lg font-semibold">Assigned to</h2>
        <p className="mt-2 text-sm">{detail.assignee ? detail.assignee.name || detail.assignee.email : "Unassigned"}</p>
        {detail.canAssign ? <AssignForm key={detail.recordId} detail={detail} options={options} action={assignAction} /> : null}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">Notes</h2>
        {detail.notes.length === 0 ? <p className="mt-3 text-sm text-black/60">No notes yet.</p> : (
          <div className="mt-4 grid gap-3">
            {detail.notes.map((note) => (
              <article key={note.id} className="rounded-3xl bg-cream px-4 py-3">
                <p className="text-sm font-semibold">{note.authorName} · <When stamp={note.createdAt} /></p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{note.body}</p>
              </article>
            ))}
          </div>
        )}
        {detail.canNote ? <NoteForm key={detail.recordId} detail={detail} noteId={noteId} action={noteAction} /> : null}
      </section>
    </div>
  );
}

function fieldValue(label: string, value: string) {
  if (!value) return "Not given";
  if (label.toLowerCase().includes("email")) return <EmailLine email={value} />;
  if (label === "Received") return <When stamp={value} />;
  if (label === "Nominee status") return intakeLabel(value);
  if (label === "Track") return trackLabel(value);
  if (label === "Locale" || label === "Language") return languageLabel(value);
  return value;
}

function NoteForm({ detail, noteId, action }: { detail: DeskDetail; noteId: string; action: DeskAction }) {
  const [state, submit, pending] = useActionState(action, null);
  const [body, setBody] = useState("");
  const [cleared, setCleared] = useState<DeskFormState>(null);
  if (state?.result === "saved" && cleared !== state) {
    setCleared(state);
    setBody("");
  }
  return (
    <form action={submit} className="mt-6 grid gap-3">
      <input type="hidden" name="recordId" value={detail.recordId} />
      <input type="hidden" name="noteId" value={noteId} />
      <label className="grid gap-1 text-sm font-semibold">
        Note
        <textarea className={area} name="body" maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <Button variant="primary" type="submit" disabled={pending}>{pending ? "Saving" : "Save note"}</Button>
      <ResultLine message={state ? RESULT[state.result] : null} tone={state?.result === "saved" ? "ok" : "warn"} />
    </form>
  );
}

function MoveButton({
  detail,
  move,
  action,
}: {
  detail: DeskDetail;
  move: DeskDetail["moves"][number];
  action: DeskAction;
}) {
  const [state, submit, pending] = useActionState(action, null);
  return (
    <form action={submit}>
      <input type="hidden" name="recordId" value={detail.recordId} />
      <input type="hidden" name="expected" value={detail.status} />
      <input type="hidden" name="to" value={move.to} />
      <Button variant={move.to === "closed" || move.to === "declined" ? "danger" : "solid"} type="submit" disabled={pending}>{pending ? "Saving" : move.label}</Button>
      <ResultLine message={state ? RESULT[state.result] : null} tone={state?.result === "saved" ? "ok" : "warn"} />
    </form>
  );
}

function AssignForm({
  detail,
  options,
  action,
}: {
  detail: DeskDetail;
  options: readonly { readonly id: string; readonly name: string; readonly email: string }[];
  action: DeskAction;
}) {
  const [state, submit, pending] = useActionState(action, null);
  return (
    <form action={submit} className="mt-4 grid gap-3">
      <input type="hidden" name="recordId" value={detail.recordId} />
      <input type="hidden" name="expectedAssigneeId" value={detail.assignee?.id ?? ""} />
      <label className="grid gap-1 text-sm font-semibold">
        Assigned to
        <AdminSelect
          name="assigneeId"
          defaultValue={detail.assignee?.id ?? ""}
          options={[{ value: "", label: "Unassigned" }, ...options.map((person) => ({ value: person.id, label: person.name || person.email }))]}
        />
      </label>
      <Button variant="solid" type="submit" disabled={pending}>{pending ? "Saving" : "Assign"}</Button>
      <ResultLine message={state ? RESULT[state.result] : null} tone={state?.result === "saved" ? "ok" : "warn"} />
    </form>
  );
}
