export const USER_ROLES = ["admin", "editor", "reviewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Editors run the public website text only. Reviewers get everything the
// application review needs: applicants (answers, VideoAsk media, notes, scores),
// confirming decisions (accept/reject, interview outcome, corrections, single or
// bulk), and the nominations that feed applications. Assigning reviewers stays
// with admins. Admins get everything.
// dashboard.read is the bare console: a signed-in seat, the frame and sign-out.
const GRANTS = [
  ["dashboard.read", "admin", "editor", "reviewer"],
  ["applicants.read", "admin", "reviewer"],
  ["signups.read", "admin"],
  ["copy.edit", "admin", "editor"],
  ["copy.publish", "admin", "editor"],
  ["users.manage", "admin"],
  ["records.export", "admin"],
  ["activity.read", "admin"],
  ["reviews.write", "admin", "reviewer"],
  ["reviews.assign", "admin"],
  ["decisions.confirm", "admin", "reviewer"],
  ["nominations.read", "admin", "reviewer"],
  ["nominations.note", "admin", "reviewer"],
  ["nominations.manage", "admin"],
  ["partners.read", "admin"],
  ["partners.manage", "admin"],
  ["identity.view", "admin"],
  ["messages.read", "admin"],
  ["messages.manage", "admin"],
] as const satisfies readonly (readonly [string, ...UserRole[]])[];

export type Capability = (typeof GRANTS)[number][0];

function capabilitiesFor(role: UserRole): readonly Capability[] {
  return GRANTS.flatMap((row) => {
    const granted = row.slice(1) as readonly UserRole[];
    return granted.includes(role) ? [row[0]] : [];
  });
}

export const CAPABILITIES = GRANTS.map((row) => row[0]);

export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  admin: capabilitiesFor("admin"),
  editor: capabilitiesFor("editor"),
  reviewer: capabilitiesFor("reviewer"),
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function can(role: string, capability: Capability): boolean {
  return isUserRole(role) && ROLE_CAPABILITIES[role].includes(capability);
}
