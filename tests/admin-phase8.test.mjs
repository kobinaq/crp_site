import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./helpers.mjs";

const load = loader();
const { recordsHref, detailHref } = load("lib/admin/return.ts");
const { cycleLabel, languageLabel, trackLabel } = load("lib/admin/labels.ts");
const { relativeWhen } = load("lib/admin/time.ts");

const query = {
  list: "applicants",
  q: "ayat",
  status: "submitted",
  track: "in_person",
  language: "en",
  cycle: "",
  age: "",
  queue: "mine",
  attention: "",
  page: 2,
};

test("a detail page can return to the same filters, search, and page", () => {
  assert.equal(
    recordsHref(query),
    "/admin/records?list=applicants&q=ayat&status=submitted&track=in_person&language=en&queue=mine&page=2",
  );
  assert.equal(
    detailHref("/admin/records/applicants/abc", query),
    "/admin/records/applicants/abc?q=ayat&status=submitted&track=in_person&language=en&queue=mine&page=2",
  );
  assert.equal(
    detailHref("/admin/records/applicants/abc", { ...query, q: "", status: "", track: "", language: "", queue: "", page: 1 }),
    "/admin/records/applicants/abc",
  );
});

test("cycle zero stays unlabeled, and track and language read as words", () => {
  assert.equal(cycleLabel(0), null);
  assert.equal(cycleLabel(-1), null);
  assert.equal(cycleLabel(2), "Review round 2");
  assert.equal(trackLabel("in_person"), "In person");
  assert.equal(trackLabel("online"), "Online");
  assert.equal(languageLabel("en"), "English");
  assert.equal(languageLabel("fr"), "French");
});

test("a relative date keeps the full UTC stamp for hover", () => {
  const now = Date.UTC(2026, 9, 23, 12, 0);
  assert.deepEqual(relativeWhen("2026-10-23 11:58", now), { label: "2 minutes ago", title: "2026-10-23 11:58 UTC" });
  assert.equal(relativeWhen("2026-10-22 12:00", now)?.label, "Yesterday");
  assert.equal(relativeWhen("not a date"), null);
});
