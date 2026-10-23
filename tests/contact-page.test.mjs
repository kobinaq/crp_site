import assert from "node:assert/strict";
import test from "node:test";
import { hookHarness, loader, nodes } from "./helpers.mjs";

const copy = {
  contactPage: {
    title: "Contact us",
    email: "email@gmail.com",
    address: "Office address",
    phone: "Phone",
    emailLabel: "Email",
    addressLabel: "Address",
    phoneLabel: "Phone",
    name: "Name",
    organization: "Organization",
    emailField: "Email",
    mobile: "Mobile",
    message: "Message",
    send: "Send",
    sent: "We've received your message.",
    invalid: "Check the fields and try again.",
    turnstile: "The check did not complete. Try again.",
    rateLimited: "You've sent several messages. Try again later.",
    failed: "The message did not send. Try again.",
  },
};

function page(action) {
  const hooks = hookHarness();
  hooks.react.useMemo = (fn) => fn();
  const Turnstile = () => null;
  const { ContactPage } = loader({
    react: hooks.react,
    "@/lib/fonts": { trail: { className: "font" } },
    "@/lib/actions": { submitContact: action },
    "../LanguageProvider": { useCopy: () => copy, useLanguage: () => ({ locale: "fr" }) },
    "../apply/CountryDropdown": { CountryDropdown: () => null },
    "../Turnstile": { Turnstile, TURNSTILE_SITE_KEY: "" },
  })("components/contact/ContactPage.tsx");
  const find = (tree, predicate) => nodes(tree).find(predicate);
  const render = () => hooks.render(() => ContactPage());
  return { Turnstile, find, render };
}

function fill(find, tree) {
  find(tree, (node) => node.props?.name === "name").props.onChange({ target: { value: "Ada" } });
  find(tree, (node) => node.props?.name === "email").props.onChange({ target: { value: "ada@example.com" } });
  find(tree, (node) => node.props?.name === "mobile").props.onChange({ target: { value: "5551234567" } });
  find(tree, (node) => node.props?.name === "message").props.onChange({ target: { value: "Hello there" } });
}

test("the contact form posts the message and keeps the published address", async () => {
  const calls = [];
  let result = { ok: false, reason: "turnstile" };
  const { Turnstile, find, render } = page(async (input) => {
    calls.push(input);
    return result;
  });
  let tree = render();
  const honeypot = find(tree, (node) => node.props?.name === "company_website");
  assert.equal(honeypot.props.tabIndex, -1);
  assert.equal(honeypot.props.autoComplete, "off");
  assert.equal(honeypot.props["aria-hidden"], true);
  assert.equal(honeypot.props.children, undefined);
  assert.ok(nodes(tree).some((node) => String(node.props?.href || "").startsWith("mailto:email@gmail.com")));

  fill(find, tree);
  tree = render();
  const widgetKey = find(tree, (node) => node.type === Turnstile).key;
  await find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = render();
  assert.equal(calls[0].message, "Hello there");
  assert.equal(calls[0].dial, "+1");
  assert.equal(calls[0].nationalNumber, "5551234567");
  assert.equal(calls[0].locale, "fr");
  assert.equal(calls[0].company_website, "");
  assert.notEqual(find(tree, (node) => node.type === Turnstile).key, widgetKey);
  assert.equal(find(tree, (node) => node.props?.role === "alert").props.children, copy.contactPage.turnstile);

  result = { ok: true };
  find(tree, (node) => node.type === Turnstile).props.onToken("fresh");
  tree = render();
  await find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = render();
  assert.equal(find(tree, (node) => node.props?.role === "status").props.children, copy.contactPage.sent);
  assert.equal(find(tree, (node) => node.type === "form"), undefined);
  assert.ok(nodes(tree).some((node) => String(node.props?.href || "").startsWith("mailto:email@gmail.com")));
});

test("a thrown submit shows the failure line and remounts Turnstile", async () => {
  const { Turnstile, find, render } = page(async () => {
    throw new Error("database unavailable");
  });
  let tree = render();
  fill(find, tree);
  tree = render();
  const widgetKey = find(tree, (node) => node.type === Turnstile).key;
  await find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = render();
  assert.equal(find(tree, (node) => node.props?.role === "alert").props.children, copy.contactPage.failed);
  assert.notEqual(find(tree, (node) => node.type === Turnstile).key, widgetKey);
});
