"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { area, card, pill, quiet } from "@/components/admin/marks";
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
  forbidden: "Your role cannot do that.",
  invalid: "That could not be saved.",
  not_found: "That record was not found.",
  conflict: "Someone else changed this record. Reload and try again.",
  illegal: "That move is not available.",
  invalid_assignee: "That person cannot own this desk.",
};

export function DeskView({
  detail,
  noteId,
  noteAction,
  moveAction,
  assignAction,
}: {
  detail: DeskDetail;
  noteId: string;
  noteAction: DeskAction;
  moveAction: DeskAction;
  assignAction: DeskAction;
}) {
  const back = detail.desk === "nomination" ? "/admin/records?list=nominations" : "/admin/records?list=partners";
  const backLabel = detail.desk === "nomination" ? "Nominations" : "Partner inquiries";
  const options = detail.assignee && !detail.assignees.some((person) => person.id === detail.assignee?.id)
    ? [...detail.assignees, detail.assignee]
    : detail.assignees;
  return (
    <div className="grid gap-6">
      <div>
        <Link className={quiet} href={back}>{backLabel}</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{detail.heading}</h1>
        <p className="mt-2 text-sm text-black/70">{detail.statusLabel}</p>
      </div>
      <section className={card}>
        <h2 className="text-lg font-semibold">Record</h2>
        <dl className="mt-4 grid gap-4 desk:grid-cols-2">
          {detail.fields.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-black/50">{item.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm">{item.value || "Not given"}</dd>
            </div>
          ))}
        </dl>
      </section>
      {detail.moves.length > 0 ? (
        <section className={card}>
          <h2 className="text-lg font-semibold">Status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.moves.map((move) => (
              <MoveButton key={`${detail.recordId}:${move.to}`} detail={detail} move={move} action={moveAction} />
            ))}
          </div>
        </section>
      ) : null}
      <section className={card}>
        <h2 className="text-lg font-semibold">Assignee</h2>
        <p className="mt-2 text-sm">{detail.assignee ? detail.assignee.name || detail.assignee.email : "Unassigned"}</p>
        {detail.canAssign ? <AssignForm key={detail.recordId} detail={detail} options={options} action={assignAction} /> : null}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">Notes</h2>
        {detail.notes.length === 0 ? <p className="mt-3 text-sm text-black/60">No notes yet.</p> : (
          <div className="mt-4 grid gap-3">
            {detail.notes.map((note) => (
              <article key={note.id} className="rounded-3xl bg-cream px-4 py-3">
                <p className="text-sm font-semibold">{note.authorName} · {note.createdAt}</p>
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
      <button className={pill} type="submit" disabled={pending}>{pending ? "Saving" : "Save note"}</button>
      {state ? <p className="text-sm">{RESULT[state.result]}</p> : null}
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
      <button className={quiet} type="submit" disabled={pending}>{pending ? "Saving" : move.label}</button>
      {state ? <p className="text-sm">{RESULT[state.result]}</p> : null}
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
        Assignee
        <AdminSelect
          name="assigneeId"
          defaultValue={detail.assignee?.id ?? ""}
          options={[{ value: "", label: "Unassigned" }, ...options.map((person) => ({ value: person.id, label: person.name || person.email }))]}
        />
      </label>
      <button className={quiet} type="submit" disabled={pending}>{pending ? "Saving" : "Assign"}</button>
      {state ? <p className="text-sm">{RESULT[state.result]}</p> : null}
    </form>
  );
}
