"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { field, pill } from "@/components/admin/marks";
import { USER_ROLES } from "@/lib/staff/roles";
import { inviteAction } from "@/app/admin/(console)/staff/actions";

const NOTICES: Record<string, string> = {
  invited: "Invite recorded.",
  "mail-failed": "The account was created, but the message did not send. Invite them again.",
  resent: "A fresh link was issued.",
  "role-differs": "That person already has a different role. Change it from the list.",
  disabled: "That account is disabled.",
  "already-staff": "That person has already signed in.",
  "rate-limited": "Too many invites. Try again later.",
  forbidden: "Your role cannot invite staff.",
  invalid: "Enter an email and a role.",
};

export function InviteForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(inviteAction, null);
  useEffect(() => {
    if (state?.notice === "invited" || state?.notice === "resent") router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="mt-4 grid gap-3 desk:grid-cols-[1fr_12rem_auto] desk:items-end">
      <label className="grid gap-1 text-sm font-semibold" htmlFor="staff-email">
        Email
        <input id="staff-email" name="email" type="email" required autoComplete="off" className={field} />
      </label>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="staff-role">
        Role
        <select id="staff-role" name="role" className={field} defaultValue="editor">
          {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      </label>
      <button className={pill} type="submit" disabled={pending}>{pending ? "Sending" : "Invite"}</button>
      {state ? <p className="text-sm desk:col-span-3">{NOTICES[state.notice] ?? state.notice}</p> : null}
      {state?.devLink ? <p className="text-sm desk:col-span-3"><a className="font-semibold underline" href={state.devLink}>Open the invite link</a></p> : null}
    </form>
  );
}
