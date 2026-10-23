-- Desk cases for nominations and partner inquiries.
-- Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push.

CREATE TABLE IF NOT EXISTS "desk_cases" (
  "desk" text NOT NULL,
  "record_id" uuid NOT NULL,
  "status" text NOT NULL,
  "assignee_id" uuid REFERENCES "users"("id") ON DELETE set null,
  PRIMARY KEY ("desk", "record_id"),
  CONSTRAINT "desk_cases_desk" CHECK ("desk" in ('nomination', 'partner')),
  CONSTRAINT "desk_cases_status" CHECK (
    ("desk" = 'nomination' AND "status" in ('new', 'reviewing', 'contacted', 'converted', 'closed'))
    OR ("desk" = 'partner' AND "status" in ('new', 'in_conversation', 'committed', 'declined', 'closed'))
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desk_cases_assignee_idx" ON "desk_cases" ("assignee_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "desk_notes" (
  "id" uuid PRIMARY KEY,
  "desk" text NOT NULL,
  "record_id" uuid NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "desk_notes_desk" CHECK ("desk" in ('nomination', 'partner')),
  CONSTRAINT "desk_notes_body_len" CHECK (char_length("body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desk_notes_record_idx" ON "desk_notes" ("desk", "record_id", "created_at");
