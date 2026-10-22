-- VideoAsk answers shown on the admin applicant record.
-- Apply by hand. Do not run drizzle-kit migrate or drizzle-kit push.
-- The journal and __drizzle_migrations are out of sync, so this file is the
-- source the maintainer runs. Every statement is additive and uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "videoask_answers" (
	"applicant_id" uuid NOT NULL REFERENCES "applicants"("id") ON DELETE cascade,
	"question_id" text NOT NULL,
	"answer_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"medium" text NOT NULL,
	"text_body" text,
	"transcript" text,
	"source_url" text,
	"pathname" text,
	"content_type" text,
	"byte_size" integer,
	"copied_at" timestamp with time zone,
	PRIMARY KEY ("applicant_id", "question_id"),
	CONSTRAINT "videoask_answers_medium" CHECK ("medium" in ('text', 'poll', 'video', 'audio')),
	CONSTRAINT "videoask_answers_position" CHECK ("position" >= 0),
	CONSTRAINT "videoask_answers_title" CHECK (char_length("title") BETWEEN 1 AND 500),
	CONSTRAINT "videoask_answers_question" CHECK ("question_id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "videoask_answers_words" CHECK (
		("medium" in ('text', 'poll') AND "text_body" IS NOT NULL AND "transcript" IS NULL)
		OR ("medium" in ('video', 'audio') AND "text_body" IS NULL)
	),
	CONSTRAINT "videoask_answers_no_file_on_text" CHECK (
		"medium" in ('video', 'audio')
		OR ("source_url" IS NULL AND "pathname" IS NULL AND "content_type" IS NULL AND "byte_size" IS NULL AND "copied_at" IS NULL)
	),
	CONSTRAINT "videoask_answers_file_phase" CHECK (
		"medium" in ('text', 'poll')
		OR ("pathname" IS NULL AND "content_type" IS NULL AND "byte_size" IS NULL AND "copied_at" IS NULL)
		OR ("source_url" IS NULL AND "pathname" IS NOT NULL AND "content_type" IS NOT NULL AND "byte_size" IS NOT NULL AND "byte_size" >= 0 AND "copied_at" IS NOT NULL)
	),
	CONSTRAINT "videoask_answers_answer_len" CHECK (char_length("answer_id") BETWEEN 1 AND 200),
	CONSTRAINT "videoask_answers_text_len" CHECK ("text_body" IS NULL OR char_length("text_body") <= 20000),
	CONSTRAINT "videoask_answers_transcript_len" CHECK ("transcript" IS NULL OR char_length("transcript") <= 20000),
	CONSTRAINT "videoask_answers_source_len" CHECK ("source_url" IS NULL OR char_length("source_url") BETWEEN 1 AND 2000),
	CONSTRAINT "videoask_answers_pathname_prefix" CHECK (
		"pathname" IS NULL
		OR "pathname" ~ '^videoask/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,128}\.[a-z0-9]{1,8}$'
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_answers_pathname_key" ON "videoask_answers" ("pathname") WHERE "pathname" IS NOT NULL;
