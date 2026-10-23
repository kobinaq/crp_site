-- Staff review positions, notes, assignment, and decision audit columns.
-- Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push.

ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "assigned_staff_id" uuid REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applicants_assigned_staff_idx" ON "applicants" ("assigned_staff_id");
--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN IF NOT EXISTS "actor_staff_id" uuid REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "decision_receipts" ADD COLUMN IF NOT EXISTS "origin" text;
--> statement-breakpoint
ALTER TABLE "decision_receipts" ADD COLUMN IF NOT EXISTS "staff_user_id" uuid REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "decision_receipts" ADD COLUMN IF NOT EXISTS "review_cycle" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_receipts_staff_hold_idx" ON "decision_receipts" ("applicant_id", "review_cycle", "created_at" DESC) WHERE "origin" = 'staff';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_positions" (
  "applicant_id" uuid NOT NULL REFERENCES "applicants"("id") ON DELETE cascade,
  "review_cycle" integer NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "recommendation" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("applicant_id", "review_cycle", "author_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_positions_applicant_idx" ON "review_positions" ("applicant_id", "review_cycle");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_notes" (
  "id" uuid PRIMARY KEY,
  "applicant_id" uuid NOT NULL REFERENCES "applicants"("id") ON DELETE cascade,
  "review_cycle" integer NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_notes_body_len" CHECK (char_length("body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_notes_applicant_idx" ON "review_notes" ("applicant_id", "review_cycle", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sheet_conflicts" (
  "applicant_id" uuid NOT NULL REFERENCES "applicants"("id") ON DELETE cascade,
  "review_cycle" integer NOT NULL,
  "decision_id" uuid NOT NULL,
  "sheet_target" text NOT NULL,
  "held_status" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("applicant_id", "review_cycle", "decision_id")
);
