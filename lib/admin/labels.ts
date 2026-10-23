const TRACK = { in_person: "In person", online: "Online" } as const;
const LANGUAGE = { en: "English", fr: "French", es: "Spanish", pt: "Portuguese" } as const;
const AGE = { under_19: "Under 19", "19_plus": "19+" } as const;
const WAITLIST = { subscribed: "Subscribed", unsubscribed: "Unsubscribed" } as const;
const INTAKE = { new: "New", invited: "Invited", applied: "Applied", declined: "Declined" } as const;

function named(table: Readonly<Record<string, string>>, value: string): string {
  return table[value] ?? value;
}

export function trackLabel(value: string): string {
  return named(TRACK, value);
}

export function languageLabel(value: string): string {
  return named(LANGUAGE, value);
}

export function ageLabel(value: string): string {
  return named(AGE, value);
}

export function waitlistLabel(value: string): string {
  return named(WAITLIST, value);
}

export function intakeLabel(value: string): string {
  return named(INTAKE, value);
}

export function cycleLabel(cycle: number): string | null {
  if (!Number.isInteger(cycle) || cycle <= 0) return null;
  return `Review round ${cycle}`;
}
