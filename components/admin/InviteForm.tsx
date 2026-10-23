"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Button, buttonClass } from "@/components/admin/Button";
import { ResultLine } from "@/components/admin/ResultLine";
import { field } from "@/components/admin/marks";
import { USER_ROLES } from "@/lib/staff/roles";
import { inviteAction, type InviteState } from "@/app/admin/(console)/staff/actions";

const NOTICES: Record<string, string> = {
  invited: "Invite sent.",
  "mail-failed": "The account was added, but the email did not send. Invite them again.",
  resent: "A new invite was sent.",
  "role-differs": "That person already has a different role. Change it from the list.",
  disabled: "That account is disabled.",
  "already-staff": "That person has already signed in.",
  "rate-limited": "Too many invites. Try again later.",
  forbidden: "You don't have permission to invite staff.",
  invalid: "Enter an email and a role.",
};

export function InviteForm() {
  const router = useRouter();
  const [state, action] = useActionState(inviteAction, null);
  const [formKey, setFormKey] = useState(0);
  const [cleared, setCleared] = useState<InviteState>(null);
  if ((state?.notice === "invited" || state?.notice === "resent") && cleared !== state) {
    setCleared(state);
    setFormKey((value) => value + 1);
  }
  useEffect(() => {
    if (state?.notice === "invited" || state?.notice === "resent") router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="mt-4 grid gap-3 desk:grid-cols-[minmax(0,1fr)_12rem_auto] desk:items-end">
      <label className="grid gap-1 text-sm font-semibold" htmlFor="staff-email">
        Email
        <input key={formKey} id="staff-email" name="email" type="email" required autoComplete="off" className={field} />
      </label>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="staff-role">
        Role
        <AdminSelect id="staff-role" name="role" defaultValue="editor" options={USER_ROLES.map((role) => ({ value: role, label: role }))} />
      </label>
      <SubmitButton className={buttonClass("primary")} pendingLabel="Sending">Invite</SubmitButton>
      <ResultLine message={state ? NOTICES[state.notice] ?? state.notice : null} tone={state?.notice === "invited" || state?.notice === "resent" ? "ok" : "warn"} />
      {state?.devLink ? <div className="desk:col-span-3"><Button href={state.devLink} variant="outline" size="sm">Open the invite link</Button></div> : null}
    </form>
  );
}
