import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./helpers.mjs";

const model = loader()("lib/contact/model.ts");

const now = new Date("2026-01-01T00:00:00.000Z");
const later = new Date("2026-02-01T00:00:00.000Z");
const unread = { status: "new", readAt: null };
const read = { status: "read", readAt: now };

function effect(state, verb, expected, at = now) {
  return model.applyContactVerb(state, verb, expected, at);
}

test("mark read stamps once, and a repeat writes nothing even when expected is stale", () => {
  const stamped = effect(unread, "markRead", "new", now);
  assert.equal(stamped.kind, "write");
  assert.equal(stamped.readAtWrite, "set-once");
  assert.equal(stamped.next.status, "read");
  assert.equal(stamped.next.readAt.getTime(), now.getTime());
  assert.equal(effect(read, "markRead", "new", later).kind, "same");
  assert.equal(effect(read, "markRead", "read", later).kind, "same");
  assert.equal(effect(unread, "markRead", "read", now).kind, "conflict");
  assert.equal(effect({ status: "archived", readAt: null }, "markRead", "archived", now).kind, "illegal");
  assert.equal(effect({ status: "spam", readAt: now }, "markRead", "spam", later).kind, "illegal");
});

test("archive and spam move between each other and leave read_at untouched", () => {
  const archived = effect(unread, "archive", "new", now);
  assert.equal(archived.kind, "write");
  assert.equal(archived.readAtWrite, "leave");
  assert.equal(archived.next.status, "archived");
  assert.equal(archived.next.readAt, null);

  const fromRead = effect(read, "archive", "read", later);
  assert.equal(fromRead.kind, "write");
  assert.equal(fromRead.next.status, "archived");
  assert.equal(fromRead.next.readAt, now);

  assert.equal(effect(archived.next, "archive", "new", later).kind, "same");
  assert.equal(effect(archived.next, "archive", "archived", later).kind, "same");
  assert.equal(effect(unread, "archive", "read", now).kind, "conflict");

  const spammed = effect(read, "markSpam", "read", later);
  assert.equal(spammed.kind, "write");
  assert.equal(spammed.readAtWrite, "leave");
  assert.equal(spammed.next.status, "spam");
  assert.equal(spammed.next.readAt, now);
  assert.equal(effect(spammed.next, "markSpam", "read", later).kind, "same");

  const spamFromArchive = effect(archived.next, "markSpam", "archived", now);
  assert.equal(spamFromArchive.kind, "write");
  assert.equal(spamFromArchive.next.status, "spam");
  assert.equal(spamFromArchive.next.readAt, null);

  const archiveFromSpam = effect(spammed.next, "archive", "spam", later);
  assert.equal(archiveFromSpam.kind, "write");
  assert.equal(archiveFromSpam.readAtWrite, "leave");
  assert.equal(archiveFromSpam.next.status, "archived");
  assert.equal(archiveFromSpam.next.readAt, now);
  assert.equal(effect({ status: "spam", readAt: null }, "archive", "new", now).kind, "conflict");
});

test("restore returns an unread row to new and a read row to read", () => {
  const archived = effect(unread, "archive", "new").next;
  const back = effect(archived, "restore", "archived", later);
  assert.equal(back.kind, "write");
  assert.equal(back.readAtWrite, "leave");
  assert.equal(back.next.status, "new");
  assert.equal(back.next.readAt, null);

  const spammed = effect(read, "markSpam", "read", later).next;
  const restored = effect(spammed, "restore", "spam", later);
  assert.equal(restored.kind, "write");
  assert.equal(restored.next.status, "read");
  assert.equal(restored.next.readAt, now);
  assert.equal(effect(restored.next, "restore", "spam", later).kind, "same");
  assert.equal(effect(unread, "restore", "archived", now).kind, "same");
  assert.equal(effect(archived, "restore", "spam", later).kind, "conflict");
});

test("each status offers only the verbs that would write", () => {
  const archived = effect(unread, "archive", "new").next;
  const spammed = effect(read, "markSpam", "read").next;
  assert.deepEqual(model.verbsFor(unread), ["markRead", "archive", "markSpam"]);
  assert.deepEqual(model.verbsFor(read), ["archive", "markSpam"]);
  assert.deepEqual(model.verbsFor(archived), ["markSpam", "restore"]);
  assert.deepEqual(model.verbsFor(spammed), ["archive", "restore"]);
  assert.equal(model.verbNeedsConfirm("markSpam"), true);
  assert.equal(model.verbNeedsConfirm("archive"), false);
});

test("assignment repeats when the assignee is already the goal, including a stale expected id", () => {
  assert.equal(model.applyAssign("a", "a", "a").kind, "same");
  assert.equal(model.applyAssign("b", "a", "b").kind, "same");
  assert.equal(model.applyAssign(null, "a", null).kind, "same");
  assert.equal(model.applyAssign("a", "b", "c").kind, "conflict");
  const moved = model.applyAssign("a", "a", "b");
  assert.equal(moved.kind, "write");
  assert.equal(moved.assigneeId, "b");
  const cleared = model.applyAssign("a", "a", null);
  assert.equal(cleared.kind, "write");
  assert.equal(cleared.assigneeId, null);
});

test("a stored status and read_at pair outside the desk state is rejected", () => {
  assert.equal(model.deskStateOf("new", now), null);
  assert.equal(model.deskStateOf("read", null), null);
  assert.equal(model.deskStateOf("nope", null), null);
  assert.deepEqual(model.deskStateOf("new", null), { status: "new", readAt: null });
  assert.equal(model.deskStateOf("archived", null).status, "archived");
  assert.equal(model.deskStateOf("spam", now).readAt, now);
});

test("public fields reject a short name, a long body, an unknown dial, and a short national number", () => {
  const dials = ["+1", "+44"];
  assert.equal(model.parseContactName("A"), null);
  assert.equal(model.parseContactName("  A "), null);
  assert.equal(model.parseContactName("Ada"), "Ada");
  assert.equal(model.parseContactName("x".repeat(201)), null);
  assert.equal(model.parseContactName("x".repeat(200)).length, 200);

  assert.equal(model.parseContactBody("hi"), null);
  assert.equal(model.parseContactBody("y".repeat(4001)), null);
  assert.equal(model.parseContactBody("  hello "), "hello");
  assert.equal(model.parseContactBody("y".repeat(4000)).length, 4000);

  // Code points, the way Postgres char_length counts, not UTF-16 units.
  const astral = "\u{1F600}";
  assert.equal(model.charLength(astral), 1);
  assert.equal(model.charLength("e\u0301"), 2);
  assert.equal(model.parseContactName(astral), null);
  assert.equal(model.parseContactName(` ${astral} `), null);
  assert.equal(model.parseContactName(astral + astral), astral + astral);
  assert.equal(model.parseContactName(astral.repeat(200)), astral.repeat(200));
  assert.equal(model.parseContactName(astral.repeat(201)), null);
  assert.equal(model.parseContactName("Ada\u0000"), null);
  assert.equal(model.parseContactBody(astral.repeat(4000)), astral.repeat(4000));
  assert.equal(model.parseContactBody(astral.repeat(4001)), null);
  assert.equal(model.parseContactBody(astral.repeat(2)), null);
  assert.equal(model.parseContactBody(astral.repeat(3)), astral.repeat(3));
  assert.deepEqual(model.parseOrganization(astral.repeat(200)), { ok: true, value: astral.repeat(200) });
  assert.equal(model.parseOrganization(astral.repeat(201)).ok, false);
  assert.equal(model.parseNoteBody(astral.repeat(4000)), astral.repeat(4000));
  assert.equal(model.parseNoteBody(astral.repeat(4001)), null);

  assert.equal(model.parseDial("+999", dials), null);
  assert.equal(model.parseDial("1", dials), null);
  assert.equal(model.parseDial("+12345", ["+12345"]), null);
  assert.equal(model.parseDial("+1", dials), "+1");

  assert.equal(model.parseNational("12345"), null);
  assert.equal(model.parseNational("12-345"), null);
  assert.equal(model.parseNational("1".repeat(16)), null);
  assert.equal(model.parseNational("555-123-4567"), "5551234567");
  assert.equal(model.formatPhone(model.parseDial("+1", dials), model.parseNational("555-123-4567")), "+1 5551234567");
  assert.match("+1 5551234567", new RegExp(model.storedPhonePattern()));

  assert.deepEqual(model.parseOrganization("  "), { ok: true, value: null });
  assert.deepEqual(model.parseOrganization(null), { ok: true, value: null });
  assert.deepEqual(model.parseOrganization("Harbor"), { ok: true, value: "Harbor" });
  assert.equal(model.parseOrganization("x".repeat(201)).ok, false);
  assert.equal(model.parseOrganization(12).ok, false);
});

test("a filled honeypot is any present value other than a blank string", () => {
  assert.equal(model.honeypotFilled(null), false);
  assert.equal(model.honeypotFilled({}), false);
  assert.equal(model.honeypotFilled({ company_website: "" }), false);
  assert.equal(model.honeypotFilled({ company_website: "   " }), false);
  assert.equal(model.honeypotFilled({ company_website: "http://spam.example" }), true);
  assert.equal(model.honeypotFilled({ company_website: ["x"] }), true);
  assert.equal(model.turnstileTokenOf({ turnstileToken: "tok" }), "tok");
  assert.equal(model.turnstileTokenOf({ turnstileToken: 1 }), undefined);
});
