export const USER_ROLES = ["admin", "editor", "reviewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CAPABILITIES = ["dashboard.read", "copy.edit", "copy.publish"] as const;
export type Capability = (typeof CAPABILITIES)[number];

// A new role has to be added here or it has no capabilities and is not staff.
// Phase 2 adds `member` with none of these three.
export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  admin: ["dashboard.read", "copy.edit", "copy.publish"],
  editor: ["dashboard.read", "copy.edit", "copy.publish"],
  reviewer: ["dashboard.read"],
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function can(role: string, capability: Capability): boolean {
  return isUserRole(role) && ROLE_CAPABILITIES[role].includes(capability);
}
