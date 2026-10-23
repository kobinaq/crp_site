# Schema and copy constraints for migration 0015

Source: schema walkthrough, checked against `drizzle/meta/_journal.json` and `lib/copy/read.ts`.

The journal ends at idx 14, tag `0014_admin_cms`, `when` 1793000000000. The next file is `drizzle/0015_<name>.sql` with journal idx 15, version `"7"`, breakpoints true, and `when` greater than 1793000000000. Tests apply it by splitting on `--> statement-breakpoint`. Do not edit 0000 through 0014. Do not run drizzle-kit. Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. Role and status stay text columns.

`getDb()` is lazy and calls `assertBackendConfig` on first use. Do not add new env vars to that required list unless the apply flow already requires them.

Published copy is cached under tag `copy` for 600 seconds. `queryPublishedRows` may throw. `publishedOrFallback` catches outside the cache and returns the JSON. A stories read has to follow that same shape under its own tag. Do not store a failure.

A new page string is the same path in `lib/translations/{en,fr,es,pt}.json`. The English file is the type. Placeholders must match the English set. `tests/copy.test.mjs` counts page leaves at 372 and UI leaves at 114. The copy desk lists whatever `leaves()` returns. A new key is editable with no desk change, and it appears on the site only where a component reads that path.
