import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { assertBackendConfig } from "@/lib/config";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Store = Pick<Db, "select" | "insert" | "update" | "delete" | "execute">;

let cached: { db: Db; pool: Pool } | undefined;

// pg 8 already treats sslmode=prefer/require/verify-ca exactly like
// verify-full (full certificate chain and hostname checks) and prints a
// SECURITY WARNING on every cold start saying so. Spelling out verify-full
// keeps that exact behaviour, silences the warning, and pins it so pg 9's
// weaker libpq semantics for "require" can't apply silently after an upgrade.
// A URL that opts into uselibpqcompat, or anything unparsable, is left alone.
export function normalizeSslMode(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const mode = parsed.searchParams.get("sslmode");
  if (!mode || !["prefer", "require", "verify-ca"].includes(mode)) return url;
  if (parsed.searchParams.has("uselibpqcompat")) return url;
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

// Built lazily so a missing URL fails on the first query with a clear message,
// not at build time when the env var legitimately isn't present.
export function getDb(): Db {
  if (cached) return cached.db;
  assertBackendConfig();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: normalizeSslMode(url), max: 5,
    connectionTimeoutMillis: 10_000, idleTimeoutMillis: 20_000,
    statement_timeout: 15_000, idle_in_transaction_session_timeout: 20_000,
  });
  cached = { db: drizzle(pool, { schema }), pool };
  return cached.db;
}

// Test harnesses open a database per run and must release the pool.
export async function closeDb(): Promise<void> {
  const current = cached;
  cached = undefined;
  await current?.pool.end();
}

export * from "./schema";
