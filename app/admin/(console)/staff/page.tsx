import { AdminSelect } from "@/components/admin/AdminSelect";
import { card, quiet } from "@/components/admin/marks";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/SubmitButton";
import { InviteForm } from "@/components/admin/InviteForm";
import { changeStaffAction } from "@/app/admin/(console)/staff/actions";
import { listStaff } from "@/lib/staff/manage";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { USER_ROLES } from "@/lib/staff/roles";

const NOTICES: Record<string, string> = {
  saved: "Saved.",
  self: "Use another admin to change your own account.",
  "last-admin": "The pavilion needs one enabled admin.",
  missing: "That account is not on the list.",
  forbidden: "Your role cannot change staff.",
  invalid: "That change was not understood.",
};

function stamp(value: Date | null): string {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "Never";
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
        <p className="mt-1 max-w-3xl text-sm leading-6 text-black/70">
          Invite an editor or a reviewer. An admin cannot remove the last enabled admin, and cannot change their own account.
        </p>
        {notice ? <p className="mt-3 text-sm font-semibold">{notice}</p> : null}
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
                  <td className="border-t border-black/10 py-3 pr-4">{member.email}</td>
                  <td className="border-t border-black/10 py-3 pr-4">{member.role ?? member.storedRole}</td>
                  <td className="border-t border-black/10 py-3 pr-4">{member.status}</td>
                  <td className="border-t border-black/10 py-3 pr-4">{stamp(member.lastSignInAt)}</td>
                  <td className="border-t border-black/10 py-3">
                    <form action={changeStaffAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={member.id} />
                      <label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.email}</label>
                      <AdminSelect id={`role-${member.id}`} name="role" className="w-36" defaultValue={member.role ?? "reviewer"} options={USER_ROLES.map((role) => ({ value: role, label: role }))} />
                      <SubmitButton className={quiet} name="intent" value="role" pendingLabel="Saving">Save role</SubmitButton>
                      {member.status === "disabled" ? (
                        <SubmitButton className={quiet} name="intent" value="enable" pendingLabel="Saving">Enable</SubmitButton>
                      ) : (
                        <ConfirmSubmit className={quiet} name="intent" value="disable" pendingLabel="Saving" title="Disable this account?" message={`Sign-in stops for ${member.email}. An admin can enable it again.`} confirmLabel="Disable">Disable</ConfirmSubmit>
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
