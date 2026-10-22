-- Staff accounts, magic-link sign-in, and the copy CMS.
-- Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push.
-- The journal and __drizzle_migrations are out of sync, so this file is the
-- source the maintainer runs. Every statement is additive and uses IF NOT EXISTS.
--
-- users.role is text (admin, editor, reviewer). A later public member role is
-- another value, not an enum change.
-- copy_revisions is both the history and the published value. The highest
-- revision for a catalog, locale, and key is live. A null value means the
-- JSON file is live again.
-- copy_drafts is one unsaved row per author per key.

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "role" text NOT NULL,
  "disabled_at" timestamp with time zone,
  "last_sign_in_at" timestamp with time zone,
  CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sign_in_tokens" (
  "hash" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "email" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sign_in_tokens_expires_idx" ON "sign_in_tokens" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "hash" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_user_idx" ON "user_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_expires_idx" ON "user_sessions" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "copy_revisions" (
  "catalog" text NOT NULL,
  "locale" text NOT NULL,
  "key" text NOT NULL,
  "revision" integer NOT NULL,
  "value" text,
  "translated_from" text,
  "reverted_from" integer,
  "author_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "copy_revisions_pkey" PRIMARY KEY ("catalog", "locale", "key", "revision"),
  CONSTRAINT "copy_revisions_revision_positive" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "copy_drafts" (
  "catalog" text NOT NULL,
  "locale" text NOT NULL,
  "key" text NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "value" text NOT NULL,
  "translated_from" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "copy_drafts_pkey" PRIMARY KEY ("catalog", "locale", "key", "author_id")
);
