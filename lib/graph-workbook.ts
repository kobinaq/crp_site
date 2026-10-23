import type { Cell } from "@/lib/excel-rows";
import type { ReviewWorkbook, TableSnapshot } from "@/lib/excel-sync";

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveId: string;
  itemId: string;
};

const GRAPH_KEYS = [
  "GRAPH_TENANT_ID",
  "GRAPH_CLIENT_ID",
  "GRAPH_CLIENT_SECRET",
  "GRAPH_DRIVE_ID",
  "GRAPH_ITEM_ID",
] as const;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function field(parsed: unknown, key: string): unknown {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  return Object.fromEntries(Object.entries(parsed))[key];
}

function textField(parsed: unknown, key: string): string {
  const value = field(parsed, key);
  return typeof value === "string" ? value : "";
}

// All five values select SharePoint. All five absent leaves the Google Sheets
// path, or a skip, to the caller. A partial set is a broken deploy.
export function graphConfigFromEnv(): GraphConfig | null {
  const values = GRAPH_KEYS.map((key) => process.env[key]?.trim() ?? "");
  if (values.every((value) => value === "")) return null;
  if (values.some((value) => value === "")) {
    throw new Error(`Graph workbook sync requires ${GRAPH_KEYS.join(", ")}`);
  }
  const [tenantId, clientId, clientSecret, driveId, itemId] = values;
  return { tenantId, clientId, clientSecret, driveId, itemId };
}

function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cellValue(value: unknown): Cell {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value == null) return "";
  return "";
}

// Excel treats a written string that starts with = + - or @ as a formula, so
// applicant text such as "=HYPERLINK(...)" would run in reviewers' workbook.
// A leading apostrophe stores it as plain text; Excel hides the apostrophe and
// reads it back without it, so a later rewrite guards it again.
export function workbookText(value: Cell): Cell {
  if (typeof value !== "string") return value;
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function pad(values: Cell[], length: number): Cell[] {
  const copy = values.slice(0, length);
  while (copy.length < length) copy.push("");
  return copy;
}

function workbookBase(config: GraphConfig): string {
  const driveId = encodeURIComponent(config.driveId);
  const itemId = encodeURIComponent(config.itemId);
  return `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`;
}

async function accessToken(config: GraphConfig): Promise<string> {
  const cacheKey = `${config.tenantId}\n${config.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph token ${res.status}: ${text.slice(0, 200)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Graph token response was not JSON");
  }
  const token = textField(parsed, "access_token");
  const rawExpires = field(parsed, "expires_in");
  const expiresIn = typeof rawExpires === "number" ? rawExpires : Number(rawExpires ?? 3600);
  if (!token) throw new Error("Graph token response had no access_token");
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + Math.max(30, (Number.isFinite(expiresIn) ? expiresIn : 3600) - 60) * 1000 });
  return token;
}

async function graphFetch(url: string, token: string, sessionId: string | null, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (sessionId) headers.set("workbook-session-id", sessionId);
  if (init?.body) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph ${res.status} ${new URL(url).pathname}: ${text.slice(0, 200)}`);
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw new Error(`Graph response was not JSON ${new URL(url).pathname}`);
  }
}

function worksheetUrl(base: string, name: string): string {
  return `${base}/workbook/worksheets/${encodeURIComponent(name)}`;
}

function blocks(rows: Map<number, Cell[]>): { start: number; values: Cell[][] }[] {
  const indexes = [...rows.keys()].sort((a, b) => a - b);
  const grouped: { start: number; values: Cell[][] }[] = [];
  for (const index of indexes) {
    const values = rows.get(index) ?? [];
    const last = grouped[grouped.length - 1];
    if (last && last.start + last.values.length === index) last.values.push(values);
    else grouped.push({ start: index, values: [values] });
  }
  return grouped;
}

export async function openGraphWorkbook(config: GraphConfig): Promise<{ workbook: ReviewWorkbook; close: () => Promise<void> }> {
  const token = await accessToken(config);
  const base = workbookBase(config);
  const opened = await graphFetch(`${base}/workbook/createSession`, token, null, {
    method: "POST",
    body: JSON.stringify({ persistChanges: true }),
  });
  const sessionId = textField(opened, "id");
  if (!sessionId) throw new Error("Graph workbook session had no id");

  const pending = new Map<string, Map<number, Cell[]>>();
  const rowCounts = new Map<string, number>();

  function queue(name: string, index: number, values: Cell[]) {
    const rows = pending.get(name) ?? new Map<number, Cell[]>();
    rows.set(index, values);
    pending.set(name, rows);
  }

  async function readTable(name: string): Promise<TableSnapshot> {
    let data: unknown;
    try {
      data = await graphFetch(`${worksheetUrl(base, name)}/usedRange(valuesOnly=true)`, token, sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("Graph 404") || message.startsWith("Graph 400")) {
        throw new Error(`Workbook is missing table ${name}`);
      }
      throw err;
    }
    const grid = field(data, "values");
    if (!Array.isArray(grid) || !Array.isArray(grid[0]) || grid[0].length === 0) {
      throw new Error(`Workbook is missing table ${name}`);
    }
    const headers = grid[0].map((value) => {
      if (typeof value === "string") return value.trim();
      const cell = cellValue(value);
      return cell === "" ? "" : String(cell);
    });
    if (headers.some((header) => header === "")) throw new Error(`Workbook is missing table ${name}`);
    const rows = grid.slice(1).map((row, index) => ({
      index,
      values: pad(Array.isArray(row) ? row.map(cellValue) : [], headers.length),
    }));
    const overlay = pending.get(name);
    if (overlay) {
      for (const [index, values] of overlay) {
        while (rows.length < index) rows.push({ index: rows.length, values: headers.map(() => "") });
        const next = { index, values: pad(values, headers.length) };
        if (rows.length === index) rows.push(next);
        else rows[index] = next;
      }
    }
    rowCounts.set(name, rows.length);
    return { headers, rows };
  }

  function writeRow(name: string, index: number, values: Cell[]): Promise<void> {
    queue(name, index, values);
    return Promise.resolve();
  }

  function addRow(name: string, values: Cell[]): Promise<void> {
    const index = rowCounts.get(name) ?? 0;
    rowCounts.set(name, index + 1);
    queue(name, index, values);
    return Promise.resolve();
  }

  return {
    workbook: { readTable, writeRow, addRow },
    close: async () => {
      try {
        for (const [name, rows] of pending) {
          for (const block of blocks(rows)) {
            const width = block.values.reduce((max, row) => Math.max(max, row.length), 1);
            const height = block.values.length;
            const start = block.start + 2;
            const end = start + height - 1;
            const address = `A${start}:${columnName(width)}${end}`;
            const values = block.values.map((row) => pad(row, width).map((value) => workbookText(value ?? "")));
            await graphFetch(`${worksheetUrl(base, name)}/range(address='${address}')`, token, sessionId, {
              method: "PATCH",
              body: JSON.stringify({ values }),
            });
          }
        }
      } finally {
        pending.clear();
        await graphFetch(`${base}/workbook/closeSession`, token, sessionId, { method: "POST" }).catch(() => undefined);
      }
    },
  };
}
