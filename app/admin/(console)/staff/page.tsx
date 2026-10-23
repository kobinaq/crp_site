import type { Metadata } from "next";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { buttonClass } from "@/components/admin/Button";
import { EmailLine } from "@/components/admin/EmailLine";
import { ResultLine } from "@/components/admin/ResultLine";
import { When } from "@/components/admin/When";
import { card } from "@/components/admin/marks";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/SubmitButton";
import { InviteForm } from "@/components/admin/InviteForm";
import { changeStaffAction } from "@/app/admin/(console)/staff/actions";
import { listStaff } from "@/lib/staff/manage";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { USER_ROLES } from "@/lib/staff/roles";

export const metadata: Metadata = { title: "Staff" };

const NOTICES: Record<string, string> = {
  saved: "Saved.",
  self: "You can't change your own account. Ask another admin.",
  "last-admin": "There must always be at least one active admin.",
  missing: "That account could not be found.",
  forbidden: "You don't have permission to change staff.",
  invalid: "Not saved. Try again.",
};

function stamp(value: Date | null): string {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "";
}

function word(value: string): string {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : "";
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireStaff("users.manage");
  const params = await searchParams;
  const members = await listStaff(getDb());
  const notice = params.notice ? NOTICES[params.notice] : undefined;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Staff</h1>
        <ResultLine message={notice ?? null} tone={params.notice === "saved" ? "ok" : "warn"} />
      </div>
      <section className={card}>
        <h2 className="text-lg font-semibold">Invite</h2>
        <InviteForm />
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">Accounts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr>
                {["Email", "Role", "Status", "Last sign-in", ""].map((header) => <th key={header || "actions"} scope="col" className="pb-2 font-semibold">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? <tr><td className="py-3 text-sm text-black/60" colSpan={5}>No staff accounts.</td></tr> : null}
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="border-t border-black/10 py-3 pr-4"><EmailLine email={member.email} /></td>
                  <td className="border-t border-black/10 py-3 pr-4">{word(member.role ?? member.storedRole ?? "")}</td>
                  <td className="border-t border-black/10 py-3 pr-4">{word(member.status)}</td>
                  <td className="border-t border-black/10 py-3 pr-4">{stamp(member.lastSignInAt) ? <When stamp={stamp(member.lastSignInAt)} /> : "Never"}</td>
                  <td className="border-t border-black/10 py-3">
                    <form action={changeStaffAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={member.id} />
                      <label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.email}</label>
                      <AdminSelect id={`role-${member.id}`} name="role" className="w-36" defaultValue={member.role ?? "reviewer"} options={USER_ROLES.map((role) => ({ value: role, label: role.slice(0, 1).toUpperCase() + role.slice(1) }))} />
                      <SubmitButton className={buttonClass("solid")} name="intent" value="role" pendingLabel="Saving">Save role</SubmitButton>
                      {member.status === "disabled" ? (
                        <SubmitButton className={buttonClass("solid")} name="intent" value="enable" pendingLabel="Saving">Enable</SubmitButton>
                      ) : (
                        <ConfirmSubmit className={buttonClass("danger")} confirmVariant="danger" name="intent" value="disable" pendingLabel="Saving" title="Disable this account?" message={`Sign-in stops for ${member.email}. An admin can enable it again.`} confirmLabel="Disable">Disable</ConfirmSubmit>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
