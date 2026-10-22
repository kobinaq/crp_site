import type { RecordList } from "@/lib/admin/records";
import { can, USER_ROLES, type Capability, type UserRole } from "@/lib/staff/roles";

export type DeskId = "nomination" | "partner";

type Node = { readonly id: string; readonly label: string; readonly open: boolean };
type Machine = {
  readonly initial: "new";
  readonly nodes: readonly Node[];
  readonly edges: readonly (readonly [string, string])[];
};

const MACHINES = {
  nomination: {
    initial: "new",
    nodes: [
      { id: "new", label: "New", open: true },
      { id: "reviewing", label: "Reviewing", open: true },
      { id: "contacted", label: "Contacted", open: true },
      { id: "converted", label: "Converted to applicant", open: false },
      { id: "closed", label: "Closed", open: false },
    ],
    edges: [
      ["new", "reviewing"],
      ["new", "closed"],
      ["reviewing", "contacted"],
      ["reviewing", "closed"],
      ["contacted", "converted"],
      ["contacted", "closed"],
      ["closed", "new"],
      ["converted", "new"],
    ],
  },
  partner: {
    initial: "new",
    nodes: [
      { id: "new", label: "New", open: true },
      { id: "in_conversation", label: "In conversation", open: true },
      { id: "committed", label: "Committed", open: false },
      { id: "declined", label: "Declined", open: false },
      { id: "closed", label: "Closed", open: false },
    ],
    edges: [
      ["new", "in_conversation"],
      ["new", "declined"],
      ["new", "closed"],
      ["in_conversation", "committed"],
      ["in_conversation", "declined"],
      ["in_conversation", "closed"],
      ["closed", "new"],
      ["committed", "new"],
      ["declined", "new"],
    ],
  },
} as const satisfies Record<DeskId, Machine>;

export type NominationStatus = (typeof MACHINES.nomination.nodes)[number]["id"];
export type PartnerStatus = (typeof MACHINES.partner.nodes)[number]["id"];

const VERBS = {
  nomination: { read: "nominations.read", note: "nominations.note", manage: "nominations.manage" },
  partner: { read: "partners.read", note: "partners.manage", manage: "partners.manage" },
} as const satisfies Record<DeskId, { read: Capability; note: Capability; manage: Capability }>;

function managersOf(desk: DeskId): readonly UserRole[] {
  return USER_ROLES.filter((role) => can(role, VERBS[desk].manage));
}

export function isNominationStatus(value: string): value is NominationStatus {
  return MACHINES.nomination.nodes.some((node) => node.id === value);
}

export function isPartnerStatus(value: string): value is PartnerStatus {
  return MACHINES.partner.nodes.some((node) => node.id === value);
}

export function legalMove(desk: DeskId, from: string, to: string): boolean {
  if (from === to) return true;
  return MACHINES[desk].edges.some((edge) => edge[0] === from && edge[1] === to);
}

export function needsAttention(
  desk: DeskId,
  status: string,
  assignee: { readonly role: string; readonly disabled: boolean } | null,
): boolean {
  const node = MACHINES[desk].nodes.find((item) => item.id === status);
  if (!node?.open) return false;
  if (!assignee || assignee.disabled) return true;
  return !managersOf(desk).some((role) => role === assignee.role);
}

export function statusOptions(desk: DeskId): readonly (readonly [string, string])[] {
  return MACHINES[desk].nodes.map((node) => [node.id, node.label]);
}

export function deskOfList(list: RecordList): DeskId | null {
  if (list === "nominations") return "nomination";
  if (list === "partners") return "partner";
  return null;
}

export function listOfDesk(desk: DeskId): "nominations" | "partners" {
  if (desk === "nomination") return "nominations";
  return "partners";
}
