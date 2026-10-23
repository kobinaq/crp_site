import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "pg-connection-string";
import { loader } from "./helpers.mjs";

function setup() {
  const load = loader({
    "next/cache": { unstable_cache: (fn) => fn, updateTag: () => {} },
    "@/lib/db": { getDb: () => { throw new Error("no db in unit tests"); } },
  });
  return { read: load("lib/copy/read.ts"), resilience: load("lib/copy/resilience.ts"), catalog: load("lib/copy/catalog.ts") };
}

const ROWS = [{ catalog: "page", locale: "en", key: "hero.line1Accent", value: "unequally" }];
const RETRY = { attemptTimeoutMs: 200, budgetMs: 1000, retryDelayMs: 1, sleep: async () => {} };

function connectionTimeout() {
  return new Error("Connection terminated due to connection timeout", { cause: new Error("Connection terminated unexpectedly") });
}

function recorder() {
  const warns = [];
  const errors = [];
  return { warns, errors, log: { warn: (key, line) => warns.push(line), error: (line) => errors.push(line) } };
}

test("a connection timeout on the first attempt is retried once and the retry's rows are served", async () => {
  const { read, catalog } = setup();
  const { warns, errors, log } = recorder();
  let calls = 0;
  const source = read.createCopySource({
    query: async () => {
      calls += 1;
      if (calls === 1) throw connectionTimeout();
      return ROWS;
    },
    deadlineMs: 1000,
    retry: RETRY,
    log,
  });
  const published = await source.read();
  assert.equal(calls, 2);
  assert.equal(catalog.mergePage(published, "en").hero.line1Accent, "unequally");
  assert.deepEqual(source.lastGood(), ROWS);
  assert.deepEqual(warns, []);
  assert.deepEqual(errors, []);
});

test("an attempt that hangs past its timeout counts as a connection failure and is retried", async () => {
  const { read } = setup();
  const { errors, log } = recorder();
  let calls = 0;
  const source = read.createCopySource({
    query: () => {
      calls += 1;
      return calls === 1 ? new Promise(() => {}) : Promise.resolve(ROWS);
    },
    deadlineMs: 1000,
    retry: { ...RETRY, attemptTimeoutMs: 20 },
    log,
  });
  await source.refresh();
  assert.equal(calls, 2);
  assert.deepEqual(source.lastGood(), ROWS);
  assert.deepEqual(errors, []);
});

test("when both attempts fail the last good copy is served with one warn line and no error", async () => {
  const { read, catalog } = setup();
  const { warns, errors, log } = recorder();
  let calls = 0;
  let down = false;
  const source = read.createCopySource({
    query: async () => {
      calls += 1;
      if (down) throw connectionTimeout();
      return ROWS;
    },
    deadlineMs: 1000,
    retry: RETRY,
    log,
  });
  const good = await source.read();
  down = true;
  calls = 0;
  const rows = await source.refresh();
  assert.equal(calls, 2);
  assert.deepEqual(rows, ROWS);
  const served = await source.read();
  assert.equal(catalog.mergePage(good, "en").hero.line1Accent, "unequally");
  assert.equal(catalog.mergePage(served, "en").hero.line1Accent, "unequally");
  assert.notEqual(served, catalog.NO_OVERRIDES);
  assert.equal(warns.length, 2);
  for (const line of warns) {
    assert.match(line, /^\[copy\] /);
    assert.doesNotMatch(line, /\n|\bat /);
  }
  assert.deepEqual(errors, []);
});

test("when both attempts fail and nothing was ever loaded the defaults are served without an error", async () => {
  const { read, catalog } = setup();
  const { warns, errors, log } = recorder();
  let calls = 0;
  const source = read.createCopySource({
    query: async () => {
      calls += 1;
      throw connectionTimeout();
    },
    deadlineMs: 1000,
    retry: RETRY,
    log,
  });
  assert.equal(await source.read(), catalog.NO_OVERRIDES);
  assert.equal(calls, 2);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /serving default copy/);
  assert.deepEqual(errors, []);
});

test("a non-connection error is not retried and is still reported as an error", async () => {
  const { read, catalog } = setup();
  const { warns, errors, log } = recorder();
  let calls = 0;
  const source = read.createCopySource({
    query: async () => {
      calls += 1;
      throw Object.assign(new Error('relation "copy_revisions" does not exist'), { code: "42P01" });
    },
    deadlineMs: 1000,
    retry: RETRY,
    log,
  });
  await assert.rejects(source.refresh(), /does not exist/);
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(await source.read(), catalog.NO_OVERRIDES);
  assert.equal(calls, 1);
  assert.deepEqual(warns, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not exist/);
});

test("the page read never waits longer than its deadline", async () => {
  const { read, catalog } = setup();
  const { warns, log } = recorder();
  const source = read.createCopySource({
    query: () => new Promise(() => {}),
    deadlineMs: 30,
    retry: { ...RETRY, attemptTimeoutMs: 5000, budgetMs: 8000 },
    log,
  });
  const started = Date.now();
  assert.equal(await source.read(), catalog.NO_OVERRIDES);
  assert.ok(Date.now() - started < 1000);
  assert.match(warns[0], /timed out/);
});

test("the retry respects the total budget", async () => {
  const { resilience } = setup();
  let clock = 0;
  let calls = 0;
  const query = async () => {
    calls += 1;
    clock += 900;
    throw connectionTimeout();
  };
  await assert.rejects(resilience.queryWithRetry(query, { attemptTimeoutMs: 1000, budgetMs: 1000, retryDelayMs: 200, now: () => clock, sleep: async () => {} }), /connection timeout/);
  assert.equal(calls, 1);
});

test("connection errors are told apart from query errors", () => {
  const { resilience } = setup();
  assert.equal(resilience.isConnectionError(connectionTimeout()), true);
  assert.equal(resilience.isConnectionError(new Error("timeout exceeded when trying to connect")), true);
  assert.equal(resilience.isConnectionError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), true);
  assert.equal(resilience.isConnectionError(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" })), true);
  assert.equal(resilience.isConnectionError(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" })), false);
  assert.equal(resilience.isConnectionError(new Error("syntax error at or near")), false);
  assert.equal(resilience.isConnectionError(undefined), false);
});

test("warn lines are rate limited per key", () => {
  const { resilience } = setup();
  let clock = 0;
  const lines = [];
  const warn = resilience.rateLimitedWarn(1000, () => clock, (line) => lines.push(line));
  warn("read", "a");
  warn("read", "b");
  warn("refresh", "c");
  clock = 1500;
  warn("read", "d");
  assert.deepEqual(lines, ["a", "c", "d"]);
});

test("sslmode aliases of verify-full are spelled out and everything else is left alone", () => {
  const { normalizeSslMode } = loader({})("lib/db/index.ts");
  const url = "postgresql://user:p%40ss@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  const normalized = normalizeSslMode(url);
  assert.match(normalized, /sslmode=verify-full/);
  // pg 8 maps sslmode=require onto the verify-full code path, so this is the config it already used.
  const before = parse(url.replace("sslmode=require", "sslmode=verify-full"));
  const after = parse(normalized);
  assert.equal(after.password, before.password);
  assert.equal(after.host, before.host);
  assert.equal(after.database, before.database);
  assert.equal(after.channel_binding, "require");
  assert.deepEqual(after.ssl, before.ssl);
  for (const mode of ["prefer", "verify-ca"]) assert.match(normalizeSslMode(url.replace("sslmode=require", `sslmode=${mode}`)), /sslmode=verify-full/);
  for (const keep of [
    "postgresql://u:p@localhost/db",
    "postgresql://u:p@localhost/db?sslmode=disable",
    "postgresql://u:p@localhost/db?sslmode=no-verify",
    "postgresql://u:p@localhost/db?sslmode=verify-full",
    "postgresql://u:p@host/db?uselibpqcompat=true&sslmode=require",
    "not a url",
  ]) assert.equal(normalizeSslMode(keep), keep);
});
