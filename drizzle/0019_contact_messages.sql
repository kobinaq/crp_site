-- Public contact messages and the staff notes that hang off them.
-- Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push.
-- The journal and __drizzle_migrations are out of sync, so this file is the
-- source the maintainer runs. Every statement is additive and uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "contact_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "organization" text,
  "phone" text NOT NULL,
  "body" text NOT NULL,
  "locale" text NOT NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "assignee_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "read_at" timestamp with time zone,
  CONSTRAINT "contact_messages_status" CHECK ("status" in ('new', 'read', 'archived', 'spam')),
  CONSTRAINT "contact_messages_read_pair" CHECK (
    ("status" = 'new' AND "read_at" IS NULL)
    OR ("status" = 'read' AND "read_at" IS NOT NULL)
    OR ("status" in ('archived', 'spam'))
  ),
  CONSTRAINT "contact_messages_name_len" CHECK (char_length("name") BETWEEN 2 AND 200),
  CONSTRAINT "contact_messages_email" CHECK (
    char_length("email") BETWEEN 3 AND 254
    AND "email" = lower("email")
  ),
  CONSTRAINT "contact_messages_organization_len" CHECK (
    "organization" IS NULL OR char_length("organization") BETWEEN 1 AND 200
  ),
  CONSTRAINT "contact_messages_phone" CHECK ("phone" ~ '^[+][0-9]{1,4} [0-9]{6,15}$'),
  CONSTRAINT "contact_messages_body_len" CHECK (char_length("body") BETWEEN 3 AND 4000),
  CONSTRAINT "contact_messages_locale" CHECK ("locale" in ('en', 'fr', 'es', 'pt'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_messages_created_idx" ON "contact_messages" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_messages_status_created_idx" ON "contact_messages" ("status", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_messages_assignee_idx" ON "contact_messages" ("assignee_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_notes" (
  "id" uuid PRIMARY KEY,
  "message_id" uuid NOT NULL REFERENCES "contact_messages"("id") ON DELETE cascade,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "contact_notes_body_len" CHECK (char_length("body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_notes_message_idx" ON "contact_notes" ("message_id", "created_at");
