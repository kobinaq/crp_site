import { dashboardAccess, hasDashboard } from "@/lib/admin/dashboard";
import { readableLists } from "@/lib/admin/records";
import { can } from "@/lib/staff/roles";

export type ConsoleArea = "dashboard" | "records" | "copy" | "staff" | "activity";

export const AREA_HREF: Record<ConsoleArea, string> = {
  dashboard: "/admin",
  records: "/admin/records",
  copy: "/admin/copy",
  staff: "/admin/staff",
  activity: "/admin/activity",
};

// The console areas a role can open. Nav, the home redirect, and the not-found
// page read this; each page still checks its own capability on the server.
export function consoleAreas(role: string): readonly ConsoleArea[] {
  const areas: ConsoleArea[] = [];
  if (hasDashboard(dashboardAccess(role))) areas.push("dashboard");
  if (readableLists(role).length > 0) areas.push("records");
  if (can(role, "copy.edit")) areas.push("copy");
  if (can(role, "users.manage")) areas.push("staff");
  if (can(role, "activity.read")) areas.push("activity");
  return areas;
}
