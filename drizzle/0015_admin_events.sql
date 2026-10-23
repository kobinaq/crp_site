-- Staff account changes and record exports.
-- Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push.
-- Copy publishes are not recorded here. copy_revisions is the publish log.

CREATE TABLE IF NOT EXISTS "admin_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "subject_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "kind" text NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_events_created_idx" ON "admin_events" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_events_subject_idx" ON "admin_events" ("subject_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copy_revisions_created_idx" ON "copy_revisions" ("created_at");
