import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./helpers.mjs";

const KEYS = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_DRIVE_ID", "GRAPH_ITEM_ID"];
const load = loader();

function clearGraphEnv() {
  for (const key of KEYS) delete process.env[key];
}

test("graph config is absent until every value is set", () => {
  clearGraphEnv();
  const graph = load("lib/graph-workbook.ts");
  assert.equal(graph.graphConfigFromEnv(), null);
  process.env.GRAPH_TENANT_ID = "climaterefugeepavilion.com";
  assert.throws(() => graph.graphConfigFromEnv(), /GRAPH_CLIENT_ID/);
  clearGraphEnv();
});

test("graph workbook reads a sheet and patches the changed row on close", async () => {
  clearGraphEnv();
  process.env.GRAPH_TENANT_ID = "climaterefugeepavilion.com";
  process.env.GRAPH_CLIENT_ID = "client";
  process.env.GRAPH_CLIENT_SECRET = "secret";
  process.env.GRAPH_DRIVE_ID = "b!drive";
  process.env.GRAPH_ITEM_ID = "item";
  const graph = load("lib/graph-workbook.ts");
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? String(init.body) : "", headers: new Headers(init?.headers) });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/oauth2/v2.0/token")) {
      const params = new URLSearchParams(String(init?.body ?? ""));
      assert.equal(params.get("grant_type"), "client_credentials");
      assert.equal(params.get("client_secret"), "secret");
      return json({ access_token: "tok", expires_in: 3600 });
    }
    const headers = new Headers(init?.headers);
    if (url.includes("/workbook/createSession")) {
      assert.equal(headers.get("authorization"), "Bearer tok");
      return json({ id: "sess" });
    }
    assert.equal(headers.get("workbook-session-id"), "sess");
    if (url.includes("/usedRange")) return json({ values: [["id", "reviewDecision"], ["", "accept"]] });
    if (url.includes("/range(address=")) return json({ address: "A2:B2" });
    if (url.includes("/closeSession")) return new Response(null, { status: 204 });
    return new Response(`unexpected ${url}`, { status: 500 });
  };

  try {
    const opened = await graph.openGraphWorkbook(graph.graphConfigFromEnv());
    const table = await opened.workbook.readTable("Applicants");
    assert.deepEqual(table.headers, ["id", "reviewDecision"]);
    assert.equal(table.rows[0].values[1], "accept");
    await opened.workbook.writeRow("Applicants", 0, ["keep", "accept"]);
    const reread = await opened.workbook.readTable("Applicants");
    assert.equal(reread.rows[0].values[0], "keep");
    await opened.close();
  } finally {
    globalThis.fetch = realFetch;
    clearGraphEnv();
  }

  const patch = calls.find((call) => call.url.includes("/range(address="));
  assert.ok(patch, calls.map((call) => call.url).join("\n"));
  assert.equal(patch.method, "PATCH");
  assert.match(patch.url, /\/worksheets\/Applicants\/range\(address='A2:B2'\)/);
  assert.match(patch.url, /drives\/b!drive\/items\/item/);
  assert.deepEqual(JSON.parse(patch.body), { values: [["keep", "accept"]] });
  assert.ok(calls.some((call) => call.url.includes("/closeSession")));
});

test("applicant text that looks like a formula is written to the workbook as plain text", () => {
  const graph = load("lib/graph-workbook.ts");
  for (const value of ["=HYPERLINK(\"https://evil.example\",\"x\")", "+233 24 000 0000", "-1+1", "@SUM(A1)", "  =1+1"]) {
    assert.equal(graph.workbookText(value), `'${value}`, value);
  }
  for (const value of ["Ada", "accept", "", "a=b", 5, -5, true]) {
    assert.equal(graph.workbookText(value), value, String(value));
  }
});

test("a missing Graph worksheet is reported as a missing table", async () => {
  const graph = load("lib/graph-workbook.ts");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/oauth2/v2.0/token")) return json({ access_token: "tok", expires_in: 3600 });
    if (url.includes("/createSession")) return json({ id: "sess" });
    if (url.includes("/closeSession")) return new Response(null, { status: 204 });
    return new Response("missing", { status: 404 });
  };
  try {
    const opened = await graph.openGraphWorkbook({
      tenantId: "climaterefugeepavilion.com",
      clientId: "client",
      clientSecret: "secret",
      driveId: "drive",
      itemId: "item",
    });
    await assert.rejects(() => opened.workbook.readTable("Applicants"), /Workbook is missing table Applicants/);
    await opened.close();
  } finally {
    globalThis.fetch = realFetch;
  }
});
