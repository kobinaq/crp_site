// Resilience helpers for the DB-stored site copy. The copy read is optional
// (the bundled JSON copy is always a valid answer), so a transient connection
// failure should cost one quick retry and a short warning, never an error page
// or a stack trace in the logs.

export class CopyTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "CopyTimeoutError";
  }
}

const CONNECTION_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN",
  // Postgres: connection exceptions and admin/crash shutdowns (e.g. a Neon compute restarting).
  "08000", "08001", "08003", "08004", "08006", "57P01", "57P02", "57P03",
]);

const CONNECTION_MESSAGE = /connection terminated|connection timeout|timeout exceeded when trying to connect|connection error|socket hang up|couldn't connect to compute node|terminating connection|server closed the connection/i;

// True for failures to reach or keep a connection to the database. Query
// errors (bad SQL, statement timeouts, constraint violations) are false: they
// are not fixed by retrying and must stay visible.
export function isConnectionError(err: unknown): boolean {
  for (let current: unknown = err, depth = 0; current && depth < 5; depth++) {
    if (current instanceof CopyTimeoutError) return true;
    const record = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof record.code === "string" && CONNECTION_CODES.has(record.code)) return true;
    if (typeof record.message === "string" && CONNECTION_MESSAGE.test(record.message)) return true;
    current = record.cause;
  }
  return false;
}

// Races work against a timer. The work is not cancelled (pg cannot abort a
// pending connect), so its eventual rejection is swallowed to avoid an
// unhandled rejection; the pool still discards the client on its own timeout.
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  work.catch(() => {});
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CopyTimeoutError(label, ms)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export type RetryOptions = {
  attemptTimeoutMs: number;
  budgetMs: number;
  retryDelayMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// At most two attempts inside a total time budget. Only connection-class
// failures are retried; anything else is rethrown straight away.
export async function queryWithRetry<T>(query: () => Promise<T>, options: RetryOptions): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? realSleep;
  const started = now();
  try {
    return await withTimeout(query(), Math.min(options.attemptTimeoutMs, options.budgetMs), "copy read");
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    const remaining = options.budgetMs - (now() - started) - options.retryDelayMs;
    if (remaining <= 0) throw err;
    await sleep(options.retryDelayMs);
    return withTimeout(query(), Math.min(options.attemptTimeoutMs, remaining), "copy read retry");
  }
}

// Logs a given key at most once per interval per server instance.
export function rateLimitedWarn(intervalMs: number, now: () => number = Date.now, sink: (line: string) => void = (line) => console.warn(line)) {
  const last = new Map<string, number>();
  return (key: string, line: string): void => {
    const at = now();
    const previous = last.get(key);
    if (previous !== undefined && at - previous < intervalMs) return;
    last.set(key, at);
    sink(line);
  };
}

export function shortReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0].slice(0, 120);
}
