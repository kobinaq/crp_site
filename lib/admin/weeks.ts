import { count, gte, sql, type SQLWrapper } from "drizzle-orm";
import { messageWeeks } from "@/lib/contact/messages";
import { CONTACT_LIST } from "@/lib/contact/model";
import { applicants, interest, nominations, partnerInquiries, waitlist, type Db } from "@/lib/db";

export const WEEK_COUNT = 26;

export type WeekCount = { readonly week: string; readonly count: number };

export const INTAKE_LISTS = ["applicants", "nominations", "interest", "waitlist", "partners", "messages"] as const;
export type IntakeList = (typeof INTAKE_LISTS)[number];

const messageList = CONTACT_LIST satisfies IntakeList;

function mondayUtc(from: Date): Date {
  const day = from.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - diff));
}

function weekOf(column: SQLWrapper) {
  return sql<string>`to_char(date_trunc('week', ${column} at time zone 'UTC'), 'YYYY-MM-DD')`.as("week");
}

function weekKey(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function weekCount(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function fill(rows: readonly { week: unknown; count: unknown }[], start: Date, weeks: number): readonly WeekCount[] {
  const found = new Map(rows.map((row) => [weekKey(row.week), weekCount(row.count)]));
  const filled: WeekCount[] = [];
  for (let index = 0; index < weeks; index += 1) {
    const week = new Date(start);
    week.setUTCDate(start.getUTCDate() + index * 7);
    filled.push({ week: week.toISOString().slice(0, 10), count: found.get(week.toISOString().slice(0, 10)) ?? 0 });
  }
  return filled;
}

export async function weeklyIntake(db: Db, list: IntakeList, weeks = WEEK_COUNT): Promise<readonly WeekCount[]> {
  const end = mondayUtc(new Date());
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (weeks - 1) * 7);
  const rows = await readWeeks(db, list, start);
  return fill(rows, start, weeks);
}

async function readWeeks(db: Db, list: IntakeList, start: Date): Promise<readonly { week: unknown; count: unknown }[]> {
  switch (list) {
    case "applicants": {
      const week = weekOf(applicants.createdAt);
      return db.select({ week, count: count() }).from(applicants).where(gte(applicants.createdAt, start)).groupBy(week);
    }
    case "nominations": {
      const week = weekOf(nominations.createdAt);
      return db.select({ week, count: count() }).from(nominations).where(gte(nominations.createdAt, start)).groupBy(week);
    }
    case "interest": {
      const week = weekOf(interest.createdAt);
      return db.select({ week, count: count() }).from(interest).where(gte(interest.createdAt, start)).groupBy(week);
    }
    case "waitlist": {
      const week = weekOf(waitlist.createdAt);
      return db.select({ week, count: count() }).from(waitlist).where(gte(waitlist.createdAt, start)).groupBy(week);
    }
    case "partners": {
      const week = weekOf(partnerInquiries.createdAt);
      return db.select({ week, count: count() }).from(partnerInquiries).where(gte(partnerInquiries.createdAt, start)).groupBy(week);
    }
    case messageList:
      return messageWeeks(db, start);
    default: {
      const unreachable: never = list;
      return unreachable;
    }
  }
}
