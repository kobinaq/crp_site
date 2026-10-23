"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { area, card, pill, quiet } from "@/components/admin/marks";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/SubmitButton";
import {
  MESSAGE_FIELDS,
  VERB_LABEL,
  messagesListHref,
  verbNeedsConfirm,
  type ContactVerb,
  type MessageDetail,
} from "@/lib/contact/model";

type MessageFormState =
  | { readonly result: "forbidden" | "invalid" | "not_found" | "conflict" | "illegal" | "invalid_assignee" | "saved" }
  | null;

type MessageAction = (previous: MessageFormState, formData: FormData) => Promise<MessageFormState>;

const RESULT: Record<NonNullable<MessageFormState>["result"], string> = {
  saved: "Saved.",
  forbidden: "Your role cannot do that.",
  invalid: "That could not be saved.",
  not_found: "That record was not found.",
  conflict: "Someone else changed this record. Reload and try again.",
  illegal: "That move is not available.",
  invalid_assignee: "That person cannot own this inbox.",
};

function when(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export function MessageView({
  detail,
  noteId,
  action,
}: {
  detail: MessageDetail;
  noteId: string;
  action: MessageAction;
}) {
  const options = detail.assignee && !detail.assignees.some((person) => person.id === detail.assignee?.id)
    ? [...detail.assignees, detail.assignee]
    : detail.assignees;
  const fields: readonly (readonly [string, string])[] = [
    ["Name", detail.name],
    ["Email", detail.email],
    ["Organization", detail.organization ?? ""],
    ["Phone", detail.phone],
    ["Locale", detail.locale],
    ["Created", when(detail.createdAt)],
    ["Message", detail.body],
  ];
  return (
    <div className="grid gap-6">
      <div>
        <Link className={quiet} href={messagesListHref()}>Messages</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="mt-2 text-sm text-black/70">{detail.statusLabel}</p>
      </div>
      <section className={card}>
        <h2 className="text-lg font-semibold">Record</h2>
        <dl className="mt-4 grid gap-4 desk:grid-cols-2">
          {fields.map((item) => (
            <div key={item[0]} className={item[0] === "Message" ? "desk:col-span-2" : undefined}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-black/50">{item[0]}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm">{item[1] || "Not given"}</dd>
            </div>
          ))}
        </dl>
      </section>
      {detail.canManage && detail.verbs.length > 0 ? (
        <section className={card}>
          <h2 className="text-lg font-semibold">Status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.verbs.map((verb) => (
              <VerbForm key={`${detail.id}:${verb}`} detail={detail} verb={verb} action={action} />
            ))}
          </div>
        </section>
      ) : null}
      <section className={card}>
        <h2 className="text-lg font-semibold">Assignee</h2>
        <p className="mt-2 text-sm">{detail.assignee ? detail.assignee.name || detail.assignee.email : "Unassigned"}</p>
        {detail.canManage ? <AssignForm key={detail.id} detail={detail} options={options} action={action} /> : null}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">Notes</h2>
        {detail.notes.length === 0 ? <p className="mt-3 text-sm text-black/60">No notes yet.</p> : (
          <div className="mt-4 grid gap-3">
            {detail.notes.map((note) => (
              <article key={note.id} className="rounded-3xl bg-cream px-4 py-3">
                <p className="text-sm font-semibold">{note.authorName} · {when(note.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{note.body}</p>
              </article>
            ))}
          </div>
        )}
        {detail.canManage ? <NoteForm key={detail.id} detail={detail} noteId={noteId} action={action} /> : null}
      </section>
    </div>
  );
}

function VerbForm({
  detail,
  verb,
  action,
}: {
  detail: MessageDetail;
  verb: ContactVerb;
  action: MessageAction;
}) {
  const [state, submit] = useActionState(action, null);
  return (
    <form action={submit}>
      <input type="hidden" name={MESSAGE_FIELDS.messageId} value={detail.id} />
      <input type="hidden" name={MESSAGE_FIELDS.expected} value={detail.state.status} />
      {verbNeedsConfirm(verb) ? (
        <ConfirmSubmit
          className={quiet}
          name={MESSAGE_FIELDS.kind}
          value={verb}
          pendingLabel="Saving"
          title="Mark as spam?"
          message="This message leaves the inbox. Restore puts it back."
          confirmLabel="Mark spam"
        >
          {VERB_LABEL[verb]}
        </ConfirmSubmit>
      ) : (
        <SubmitButton className={quiet} name={MESSAGE_FIELDS.kind} value={verb} pendingLabel="Saving">
          {VERB_LABEL[verb]}
        </SubmitButton>
      )}
      {state ? <p className="text-sm">{RESULT[state.result]}</p> : null}
    </form>
  );
}

function AssignForm({
  detail,
  options,
  action,
}: {
  detail: MessageDetail;
  options: MessageDetail["assignees"];
  action: MessageAction;
}) {
  const [state, submit] = useActionState(action, null);
  return (
    <form action={submit} className="mt-4 grid gap-3">
      <input type="hidden" name={MESSAGE_FIELDS.kind} value="assign" />
      <input type="hidden" name={MESSAGE_FIELDS.messageId} value={detail.id} />
      <input type="hidden" name={MESSAGE_FIELDS.expectedAssigneeId} value={detail.assignee?.id ?? ""} />
      <label className="grid gap-1 text-sm font-semibold">
        Assignee
        <AdminSelect
          name={MESSAGE_FIELDS.assigneeId}
          defaultValue={detail.assignee?.id ?? ""}
          options={[{ value: "", label: "Unassigned" }, ...options.map((person) => ({ value: person.id, label: person.name || person.email }))]}
        />
      </label>
      <SubmitButton className={quiet} pendingLabel="Saving">Assign</SubmitButton>
      {state ? <p className="text-sm">{RESULT[state.result]}</p> : null}
    </form>
  );
}

function NoteForm({
  detail,
  noteId,
  action,
}: {
  detail: MessageDetail;
  noteId: string;
  action: MessageAction;
}) {
  const [state, submit] = useActionState(action, null);
  const [body, setBody] = useState("");
  const [cleared, setCleared] = useState<MessageFormState>(null);
  if (state?.result === "saved" && cleared !== state) {
    setCleared(state);
    setBody("");
  }
  return (
    <form action={submit} className="mt-6 grid gap-3">
      <input type="hidden" name={MESSAGE_FIELDS.kind} value="note" />
      <input type="hidden" name={MESSAGE_FIELDS.messageId} value={detail.id} />
      <input type="hidden" name={MESSAGE_FIELDS.noteId} value={noteId} />
      <label className="grid gap-1 text-sm font-semibold">
        Note
        <textarea className={area} name={MESSAGE_FIELDS.body} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <SubmitButton className={pill} pendingLabel="Saving">Save note</SubmitButton>
      {state ? <p className="text-sm">{RESULT[state.result]}</p> : null}
    </form>
  );
}
