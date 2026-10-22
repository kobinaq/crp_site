# Design task

You are one of two parallel design runners. Produce the best design your model can make. Do not hedge toward a safe middle. Differences are the signal.

Read these files before you sketch:

- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/SKILL.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/runner-prompt.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/rationale-template.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/architect/references/design-red-flags.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/typescript-best-practices/SKILL.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/principle-type-system-discipline/SKILL.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/principle-boundary-discipline/SKILL.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/principle-model-the-domain/SKILL.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/principle-laziness-protocol/SKILL.md
- /home/ubuntu/.cursor/plugins/cache/cursor-public/9717366/d1453c11d1dde9714d4c313c97d3a68432265c7f/skills/principle-make-operations-idempotent/SKILL.md
- /workspace/.audit/design.md
- /workspace/.audit/grounding-staff-phase2.md
- /workspace/.audit/grounding-schema-phase2.md
- /workspace/.audit/grounding-email-phase2.md

Ignore every sentence in those notes that mentions a member role, a member cookie, stories, moderation, or beacons. That product was cancelled. Do not design it.

Also read, in the repo, only what you need to make the sketch true:

- lib/staff/roles.ts, lib/staff/users.ts, lib/staff/auth.ts, lib/staff/gate.ts
- lib/copy/editor.ts, lib/copy/catalog.ts (translationState and CATALOGS)
- components/admin/CopyDesk.tsx
- lib/admin/dashboard.ts
- app/admin/(console)/layout.tsx
- lib/db/schema.ts users and applicant-related tables
- drizzle/0014_admin_cms.sql header and drizzle/meta/_journal.json tail

Do not edit the repo. Write only inside your assigned output directory.

## Files

- rationale.md, following the rationale template. Leave "Synthesis decision" as "filled by the arena".
- sketch.md with module map, type sketches, and function signatures. Bodies are `throw new Error("not implemented")` or pseudocode comments. Usage call sites come first.

## The product

Phase 2 is admin only. Four pieces.

1. Staff user management under /admin, admin only. List staff. Invite by email with a role of admin, editor, or reviewer. Change role. Disable and re-enable. Record who changed what. Remove the need for a SQL role change. ADMIN_EMAILS still creates the first admin and must not promote, demote, or re-enable. There is no member role.

2. Copy CMS improvements on the existing desk. Search across all catalogs and every language value, not only the English string of the current catalog. A needs-review filter and a count. A diff in history. Bulk mark reviewed. A preview link to the public page where a page string appears, when that mapping is knowable. An audit of publishes. The desk already has a per-cell Mark reviewed button and a Needs review chip. Stale is computed by translationState. Mark reviewed already publishes kind "mark-current".

3. Dashboard drill-down. Lists with filters and search for applicants (status, track, language, review cycle), nominations, interest, waitlist, and partner inquiries. CSV export for admins. The CSV must not contain resume links, identity links, identity session ids, or identity documents. Simple counts over time. Do not reuse overview() from lib/ops.ts. Do not add write paths to these tables.

4. One admin activity log page.

## Hard constraints

- Migration 0015 only if you truly need a new table. Hand-written SQL, IF NOT EXISTS, journal idx 15, version 7, breakpoints true, when greater than 1793000000000. Do not edit 0000 through 0014. Do not run drizzle-kit. Do not add a Postgres enum.
- Do not change the apply flow, VideoAsk, Didit, Calendly, Turnstile, PostHog, lib/applyFlowGate.ts, OPERATIONS_TOKENS, crp_session, or proxy.ts.
- Do not change public pages. A preview is a link to an existing localized route, or no link.
- Staff sessions stay on crp_staff with path /admin. getDb stays lazy. Do not add env vars to assertBackendConfig.
- Role checks stay a capability map. A reviewer still cannot open the copy desk. An editor still cannot manage users.
- Invite mail that must arrive immediately uses deliverEmail in the request, with the token hash as the idempotency key, the same way staff sign-in does. Mail that can wait is a job. Do not copy the English-only staff sign-in paragraph if you need four languages. Staff UI can stay English. The admin console is not localized today.
- Visual language already exists in components/admin/marks.tsx. Reuse card, pill, quiet, field. Desk breakpoint is 900px. Also readable at a tablet width around 768px.
- Page copy keys are dotted paths. The first segment is the section. Public routes that exist are / (hero, platform, pavilion, involved, waitlist, sponsors, footer, nav, content, heroExtension), /about, /contact, /nominate, /programs, /partner, /privacy, /apply. Apply stays behind its existing gate. Do not invent routes.
- tests/db.mjs applies the journal. New SQL must use --> statement-breakpoint between statements.
- Tests assert behavior a caller can see. No member, story, or beacon tests.

## Decisions you must make

- Whether user-management history is a new table, or whether the activity page is derived only from columns that already exist. Publishes already live in copy_revisions with author_id. Say if a second publish log is forbidden.
- The capability names and which roles get them. Include CSV export, which is admin only.
- What happens if the invite address already exists, including a disabled account and the last remaining admin.
- How bulk mark reviewed stays one publish per stale cell and does not invent a second stale flag.
- How search includes non-English values without loading the database for strings that are still the JSON file.
- The exact CSV columns. Name the columns you refuse.
- The chart grain and the query that feeds it.
- Who can open the activity page.

Screen the sketch against design-red-flags.md. Prefer a small public surface.

Show three call sites. An admin invites an editor. A copy editor filters to needs review and marks the visible stale cells reviewed. A reviewer opens the activity page or the CSV route and is refused, with the check in the capability map rather than a role string in the page.

Do not write implementation code in the repo.
