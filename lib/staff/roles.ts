export const USER_ROLES = ["admin", "editor", "reviewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CAPABILITIES = [
  "dashboard.read",
  "copy.edit",
  "copy.publish",
  "users.manage",
  "records.export",
  "activity.read",
  "reviews.write",
  "reviews.assign",
  "decisions.confirm",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// A role missing from this map has no capabilities and is not staff.
export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  admin: ["dashboard.read", "copy.edit", "copy.publish", "users.manage", "records.export", "activity.read", "reviews.write", "reviews.assign", "decisions.confirm"],
  editor: ["dashboard.read", "copy.edit", "copy.publish"],
  reviewer: ["dashboard.read", "reviews.write"],
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function can(role: string, capability: Capability): boolean {
  return isUserRole(role) && ROLE_CAPABILITIES[role].includes(capability);
}
