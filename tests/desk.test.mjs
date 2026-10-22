import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loader } from "./helpers.mjs";

const load = loader();

function mod(path) {
  return load(path);
}

test("staff grants derive from one table and leave the editor set unchanged", () => {
  const { can, ROLE_CAPABILITIES } = mod("lib/staff/roles.ts");
  assert.deepEqual(ROLE_CAPABILITIES.editor, ["dashboard.read", "copy.edit", "copy.publish"]);
  assert.equal(can("editor", "nominations.read"), false);
  assert.equal(can("editor", "partners.read"), false);
  assert.equal(can("reviewer", "nominations.read"), true);
  assert.equal(can("reviewer", "nominations.note"), true);
  assert.equal(can("reviewer", "nominations.manage"), false);
  assert.equal(can("reviewer", "partners.read"), false);
  assert.equal(can("reviewer", "partners.manage"), false);
  assert.equal(can("admin", "nominations.read"), true);
  assert.equal(can("admin", "nominations.note"), true);
  assert.equal(can("admin", "nominations.manage"), true);
  assert.equal(can("admin", "partners.read"), true);
  assert.equal(can("admin", "partners.manage"), true);
  assert.equal(ROLE_CAPABILITIES.reviewer.includes("dashboard.read"), true);
  assert.equal(ROLE_CAPABILITIES.reviewer.includes("reviews.write"), true);
});

test("status moves follow the desk graph, including undo to new and a same-status no-op", () => {
  const { legalMove, isNominationStatus, isPartnerStatus, statusOptions } = mod("lib/desk/case.ts");
  assert.deepEqual(statusOptions("nomination").map(([id]) => id), ["new", "reviewing", "contacted", "converted", "closed"]);
  assert.deepEqual(statusOptions("partner").map(([id]) => id), ["new", "in_conversation", "committed", "declined", "closed"]);
  assert.equal(isNominationStatus("reviewing"), true);
  assert.equal(isNominationStatus("in_conversation"), false);
  assert.equal(isPartnerStatus("declined"), true);
  assert.equal(isPartnerStatus("reviewing"), false);

  for (const [from, to] of [
    ["new", "reviewing"],
    ["new", "closed"],
    ["reviewing", "contacted"],
    ["reviewing", "closed"],
    ["contacted", "converted"],
    ["contacted", "closed"],
    ["closed", "new"],
    ["converted", "new"],
  ]) {
    assert.equal(legalMove("nomination", from, to), true, `${from} -> ${to}`);
  }
  for (const [from, to] of [
    ["new", "in_conversation"],
    ["new", "declined"],
    ["new", "closed"],
    ["in_conversation", "committed"],
    ["in_conversation", "declined"],
    ["in_conversation", "closed"],
    ["closed", "new"],
    ["committed", "new"],
    ["declined", "new"],
  ]) {
    assert.equal(legalMove("partner", from, to), true, `${from} -> ${to}`);
  }

  assert.equal(legalMove("nomination", "reviewing", "reviewing"), true);
  assert.equal(legalMove("partner", "committed", "committed"), true);
  assert.equal(legalMove("nomination", "converted", "reviewing"), false);
  assert.equal(legalMove("nomination", "closed", "contacted"), false);
  assert.equal(legalMove("nomination", "reviewing", "new"), false);
  assert.equal(legalMove("nomination", "new", "converted"), false);
  assert.equal(legalMove("partner", "committed", "declined"), false);
  assert.equal(legalMove("partner", "declined", "in_conversation"), false);
  assert.equal(legalMove("partner", "new", "committed"), false);
});

test("an open row needs attention unless an enabled manager owns it", () => {
  const { needsAttention } = mod("lib/desk/case.ts");
  const admin = { role: "admin", disabled: false };
  const disabledAdmin = { role: "admin", disabled: true };
  const reviewer = { role: "reviewer", disabled: false };
  const editor = { role: "editor", disabled: false };

  for (const status of ["new", "reviewing", "contacted"]) {
    assert.equal(needsAttention("nomination", status, null), true, status);
    assert.equal(needsAttention("nomination", status, admin), false, status);
    assert.equal(needsAttention("nomination", status, disabledAdmin), true, status);
    assert.equal(needsAttention("nomination", status, reviewer), true, status);
  }
  assert.equal(needsAttention("nomination", "converted", null), false);
  assert.equal(needsAttention("nomination", "closed", admin), false);
  assert.equal(needsAttention("nomination", "missing", null), false);

  for (const status of ["new", "in_conversation"]) {
    assert.equal(needsAttention("partner", status, null), true, status);
    assert.equal(needsAttention("partner", status, admin), false, status);
    assert.equal(needsAttention("partner", status, editor), true, status);
  }
  assert.equal(needsAttention("partner", "committed", null), false);
  assert.equal(needsAttention("partner", "declined", null), false);
  assert.equal(needsAttention("partner", "closed", null), false);
});

test("the desk migration adds case tables and does not alter intake columns", () => {
  const sql = fs.readFileSync("drizzle/0017_desk_cases.sql", "utf8");
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries.find((row) => row.idx === 17);
  assert.equal(entry.tag, "0017_desk_cases");
  assert.equal(entry.when, 1793300000000);
  assert.equal(entry.breakpoints, true);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "desk_cases"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "desk_notes"/);
  assert.match(sql, /desk_cases_status/);
  assert.match(sql, /char_length\("body"\) BETWEEN 1 AND 4000/);
  assert.equal(/alter table "nominations"/i.test(sql), false);
  assert.equal(/alter table "partner_inquiries"/i.test(sql), false);
  assert.equal(/create type/i.test(sql), false);
});
