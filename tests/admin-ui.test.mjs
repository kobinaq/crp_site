import assert from "node:assert/strict";
import test from "node:test";
import { installDom, setControlValue } from "./dom.mjs";
import { loader } from "./helpers.mjs";

installDom();
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;

const load = loader({
  "next/link": {
    __esModule: true,
    default(props) {
      return React.createElement("a", { href: props.href }, props.children);
    },
  },
  "next/navigation": {
    __esModule: true,
    redirect() {
      throw new Error("redirect");
    },
    useRouter() {
      return { refresh() {}, push() {}, replace() {} };
    },
  },
  "@/app/admin/(console)/records/applicants/[id]/actions": {
    async previewDecisionAction({ applicantId }) {
      return { result: "ready", subject: applicantId, html: `<p>${applicantId}</p>` };
    },
    async confirmDecisionAction() {
      return null;
    },
    async saveReviewAction() {
      return { result: "saved" };
    },
    async assignReviewAction() {
      return { result: "saved" };
    },
  },
});

function text(id) {
  const element = document.getElementById(id);
  assert.ok(element, id);
  return element.value;
}

function cell(locale, value) {
  return { locale, revision: 1, value, draft: null, override: false, state: { kind: locale === "en" ? "source" : "current" } };
}

function copyRow(key, english, french) {
  return {
    catalog: "page",
    key,
    section: "nav",
    english,
    digest: "digest",
    cells: [cell("en", english), cell("fr", french)],
  };
}

function copyProps(selected, query) {
  return {
    catalog: "page",
    scopeAll: false,
    query,
    needsReview: false,
    reviewCount: 0,
    rows: [copyRow("nav.about", "About", "À propos"), copyRow("nav.programs", "Programs", "Programmes")],
    selected,
    history: {},
  };
}

async function render(node) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return {
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test("switching a copy entry shows that entry and keeps an unsaved edit on it", async () => {
  load("lib/copy/draftState.ts").clearCopyDrafts();
  const { CopyDesk } = load("components/admin/CopyDesk.tsx");
  const about = copyRow("nav.about", "About", "À propos");
  const programs = copyRow("nav.programs", "Programs", "Programmes");
  const view = await render(React.createElement(CopyDesk, copyProps(about, "")));
  try {
    assert.equal(text("page-nav.about-en"), "About");
    assert.equal(text("page-nav.about-fr"), "À propos");
    await view.rerender(React.createElement(CopyDesk, copyProps(programs, "")));
    assert.equal(text("page-nav.programs-en"), "Programs");
    assert.equal(text("page-nav.programs-fr"), "Programmes");
    await act(async () => {
      setControlValue(document.getElementById("page-nav.programs-en"), "Programs draft");
    });
    await view.rerender(React.createElement(CopyDesk, copyProps(about, "")));
    assert.equal(text("page-nav.about-en"), "About");
    assert.equal(text("page-nav.about-fr"), "À propos");
    await view.rerender(React.createElement(CopyDesk, copyProps(programs, "")));
    assert.equal(text("page-nav.programs-en"), "Programs draft");
    const published = {
      ...programs,
      cells: programs.cells.map((item) => item.locale === "en" ? { ...item, revision: 2, value: "Programs live" } : item),
    };
    await view.rerender(React.createElement(CopyDesk, copyProps(published, "")));
    assert.equal(text("page-nav.programs-en"), "Programs live");
  } finally {
    await view.unmount();
  }
});

test("a saved draft matches the server and does not warn on leaving", async () => {
  load("lib/copy/draftState.ts").clearCopyDrafts();
  const { CopyDesk } = load("components/admin/CopyDesk.tsx");
  const programs = copyRow("nav.programs", "Programs", "Programmes");
  const link = document.createElement("a");
  link.href = "/admin";
  link.textContent = "Desk";
  document.body.appendChild(link);
  const view = await render(React.createElement(CopyDesk, copyProps(programs, "")));
  const original = window.confirm;
  let asked = 0;
  window.confirm = () => {
    asked += 1;
    return false;
  };
  try {
    await act(async () => {
      setControlValue(document.getElementById("page-nav.programs-en"), "Programs draft");
    });
    link.click();
    assert.equal(asked, 1);
    const saved = {
      ...programs,
      cells: programs.cells.map((item) => item.locale === "en" ? { ...item, draft: "Programs draft" } : item),
    };
    await view.rerender(React.createElement(CopyDesk, copyProps(saved, "")));
    assert.equal(text("page-nav.programs-en"), "Programs draft");
    asked = 0;
    link.click();
    assert.equal(asked, 0);
  } finally {
    window.confirm = original;
    link.remove();
    await view.unmount();
  }
});

test("the copy filter shows the query from the page address", async () => {
  const { CopyDesk } = load("components/admin/CopyDesk.tsx");
  const about = copyRow("nav.about", "About", "À propos");
  const view = await render(React.createElement(CopyDesk, copyProps(about, "alpha")));
  try {
    assert.equal(text("copy-filter"), "alpha");
    await view.rerender(React.createElement(CopyDesk, copyProps(about, "beta")));
    assert.equal(text("copy-filter"), "beta");
  } finally {
    await view.unmount();
  }
});

function clip(questionId) {
  return { kind: "clip", questionId, position: 1, title: "Intro", medium: "video", transcript: "", playback: "ready" };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("a play started for one applicant does not block or fill the next applicant", async () => {
  const { PrivateMedia } = load("components/admin/PrivateMedia.tsx");
  const original = global.fetch;
  const pending = [];
  global.fetch = (url) => new Promise((resolve) => {
    const id = String(url).match(/applicants\/([^/]+)\/open/)[1];
    pending.push(() => resolve({
      ok: true,
      json: async () => ({ url: `/admin/records/applicants/${id}/stream/tok.en` }),
    }));
  });
  const media = await render(React.createElement(PrivateMedia, { applicantId: "applicant-a", view: clip("intro") }));
  try {
    await act(async () => { document.querySelector("button").click(); });
    await media.rerender(React.createElement(PrivateMedia, { applicantId: "applicant-b", view: clip("intro") }));
    await act(async () => { document.querySelector("button").click(); });
    assert.equal(pending.length, 2);
    await act(async () => { pending[0](); });
    await settle();
    assert.equal(document.querySelector("video"), null);
    await act(async () => { pending[1](); });
    await settle();
    assert.match(document.querySelector("video").src, /applicant-b/);
    assert.doesNotMatch(document.querySelector("video").src, /applicant-a/);
  } finally {
    global.fetch = original;
    await media.unmount();
  }
});

test("the media player and document card drop the previous applicant", async () => {
  const { PrivateMedia, DocumentReveal } = load("components/admin/PrivateMedia.tsx");
  const original = global.fetch;
  let applicant = "applicant-a";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ url: `/admin/records/applicants/${applicant}/stream/tok.en` }),
  });
  const media = await render(React.createElement(PrivateMedia, { applicantId: applicant, view: clip("intro") }));
  const documentView = await render(React.createElement(DocumentReveal, {
    applicantId: applicant,
    view: { documentId: "passport", kind: "passport", contentType: "image/png" },
  }));
  try {
    await act(async () => { document.querySelectorAll("button")[0].click(); });
    await settle();
    assert.match(document.querySelector("video").getAttribute("src") ?? document.querySelector("video").src, /applicant-a/);
    await act(async () => { [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Show document")).click(); });
    await settle();
    assert.match(document.querySelector("img").src, /applicant-a/);
    applicant = "applicant-b";
    await media.rerender(React.createElement(PrivateMedia, { applicantId: applicant, view: clip("intro") }));
    await documentView.rerender(React.createElement(DocumentReveal, {
      applicantId: applicant,
      view: { documentId: "passport", kind: "passport", contentType: "image/png" },
    }));
    assert.equal(document.querySelector("video"), null);
    assert.equal(document.querySelector("img"), null);
    await act(async () => { [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Play video")).click(); });
    await settle();
    assert.match(document.querySelector("video").src, /applicant-b/);
    assert.doesNotMatch(document.querySelector("video").src, /applicant-a/);
  } finally {
    global.fetch = original;
    await media.unmount();
    await documentView.unmount();
  }
});

function applicantReview(id, score, assigneeId) {
  return {
    id,
    fullName: id,
    email: `${id}@example.com`,
    dob: "2000-01-01",
    age: 26,
    track: "onsite",
    phone: "",
    nationality: "",
    basedIn: "",
    skills: "",
    canTravel: "yes",
    hasValidPassport: "yes",
    language: "en",
    status: "submitted",
    statusLabel: "Submitted",
    reviewCycle: 1,
    createdAt: "2026-01-01",
    videoAsk: "complete",
    round1CompletedAt: "",
    identity: "clear",
    identityCheckedAt: "",
    reviewDecision: "",
    reviewNotes: "",
    reviewer: "",
    reviewDate: "",
    interviewOutcome: "",
    interviewNotes: "",
    interviewDate: "",
    docsStatus: "",
    onlineOfferedAt: "",
    version: 1,
    assignedStaff: { id: assigneeId, name: assigneeId, email: `${assigneeId}@example.com` },
    positions: [{
      authorId: "viewer",
      authorName: "Viewer",
      scores: { commitment: score, context: score, contribution: score },
      recommendation: "advance",
      updatedAt: "2026-01-02",
    }],
    notes: [],
    conflicts: [],
    offeredMoves: [{ field: "reviewDecision", value: "accept", to: "accepted" }],
    prevHref: null,
    nextHref: null,
    events: [],
    answers: [],
    documents: [],
  };
}

test("review fields, notes, and the email preview belong to the applicant on screen", async () => {
  const { ReviewEditor } = load("components/admin/ReviewEditor.tsx");
  const { DecisionPanel } = load("components/admin/DecisionPanel.tsx");
  const reviewers = [{ id: "ada", name: "Ada", email: "ada@example.com" }, { id: "bea", name: "Bea", email: "bea@example.com" }];
  const editor = await render(React.createElement(ReviewEditor, {
    review: applicantReview("applicant-a", 2, "ada"),
    canWrite: true,
    canAssign: true,
    reviewers,
    viewerId: "viewer",
    noteId: "note-a",
  }));
  const decision = await render(React.createElement(DecisionPanel, {
    review: applicantReview("applicant-a", 2, "ada"),
    queue: "",
    canConfirm: true,
    decisionId: "decision-a",
    statusLabel: { accepted: "Accepted" },
  }));
  try {
    assert.equal(document.querySelector("input[name=score-commitment]").value, "2");
    assert.equal(document.querySelector("input[name=assigneeId]").value, "ada");
    await act(async () => { setControlValue(document.querySelector("textarea[name=note]"), "note for A"); });
    await act(async () => { [...document.querySelectorAll("button")].find((button) => button.textContent === "Preview").click(); });
    await settle();
    assert.match(document.querySelector("iframe").srcdoc, /applicant-a/);
    await editor.rerender(React.createElement(ReviewEditor, {
      review: applicantReview("applicant-b", 5, "bea"),
      canWrite: true,
      canAssign: true,
      reviewers,
      viewerId: "viewer",
      noteId: "note-b",
    }));
    await decision.rerender(React.createElement(DecisionPanel, {
      review: applicantReview("applicant-b", 5, "bea"),
      queue: "",
      canConfirm: true,
      decisionId: "decision-b",
      statusLabel: { accepted: "Accepted" },
    }));
    assert.equal(document.querySelector("input[name=score-commitment]").value, "5");
    assert.equal(document.querySelector("textarea[name=note]").value, "");
    assert.equal(document.querySelector("input[name=assigneeId]").value, "bea");
    assert.equal(document.querySelector("iframe"), null);
  } finally {
    await editor.unmount();
    await decision.unmount();
  }
});

test("a desk note and assignee do not carry to the next record", async () => {
  const { DeskView } = load("components/admin/DeskView.tsx");
  const action = async () => ({ result: "saved" });
  function detail(id, assigneeId) {
    return {
      desk: "nomination",
      recordId: id,
      heading: id,
      status: "new",
      statusLabel: "New",
      assignee: { id: assigneeId, name: assigneeId, email: `${assigneeId}@example.com` },
      moves: [{ to: "reviewing", label: "Reviewing" }],
      canNote: true,
      canAssign: true,
      assignees: [
        { id: "ada", name: "Ada", email: "ada@example.com" },
        { id: "bea", name: "Bea", email: "bea@example.com" },
      ],
      notes: [],
      fields: [{ label: "Email", value: `${id}@example.com` }],
    };
  }
  const view = await render(React.createElement(DeskView, {
    detail: detail("record-a", "ada"),
    noteId: "note-a",
    noteAction: action,
    moveAction: action,
    assignAction: action,
  }));
  try {
    await act(async () => { setControlValue(document.querySelector("textarea[name=body]"), "note for A"); });
    assert.equal(document.querySelector("input[name=assigneeId]").value, "ada");
    await view.rerender(React.createElement(DeskView, {
      detail: detail("record-b", "bea"),
      noteId: "note-b",
      noteAction: action,
      moveAction: action,
      assignAction: action,
    }));
    assert.equal(document.querySelector("textarea[name=body]").value, "");
    assert.equal(document.querySelector("input[name=assigneeId]").value, "bea");
  } finally {
    await view.unmount();
  }
});

test("record filters show the address, and a select follows a new value from the keyboard", async () => {
  const { RecordsView } = load("components/admin/RecordsView.tsx");
  const { AdminSelect } = load("components/admin/AdminSelect.tsx");
  function pageData(q, status) {
    return {
      list: "nominations",
      title: "Nominations",
      headers: ["Name"],
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
      filters: { list: "nominations", q, status, track: "", language: "", cycle: "", age: "", queue: "", attention: "", page: 1 },
      statusOptions: [["new", "New"], ["closed", "Closed"]],
      weeks: [],
    };
  }
  const records = await render(React.createElement(RecordsView, { data: pageData("alpha", "new"), exportable: false, canConfirm: false }));
  const options = [
    { value: "reviewer", label: "reviewer" },
    { value: "editor", label: "editor" },
    { value: "admin", label: "admin" },
  ];
  const select = await render(React.createElement(AdminSelect, { id: "role-select", name: "role", defaultValue: "reviewer", options }));
  try {
    assert.equal(document.querySelector("input[name=q]").value, "alpha");
    assert.equal(document.querySelector("input[name=status]").value, "new");
    await records.rerender(React.createElement(RecordsView, { data: pageData("beta", ""), exportable: false, canConfirm: false }));
    assert.equal(document.querySelector("input[name=q]").value, "beta");
    assert.equal(document.querySelector("input[name=status]").value, "");
    assert.equal(document.querySelector("input[name=role]").value, "reviewer");
    await select.rerender(React.createElement(AdminSelect, { id: "role-select", name: "role", defaultValue: "admin", options }));
    assert.equal(document.querySelector("input[name=role]").value, "admin");
    await act(async () => { document.getElementById("role-select").click(); });
    const list = document.querySelector("[role=listbox]");
    list.focus();
    await act(async () => {
      list.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      list.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    assert.equal(document.querySelector("input[name=role]").value, "editor");
    assert.equal(document.querySelector("[role=listbox]"), null);
    await act(async () => { document.getElementById("role-select").click(); });
    const openList = document.querySelector("[role=listbox]");
    openList.focus();
    await act(async () => {
      openList.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(document.querySelector("[role=listbox]"), null);
    assert.equal(document.activeElement, document.getElementById("role-select"));
    await act(async () => { document.getElementById("role-select").click(); });
    const tabList = document.querySelector("[role=listbox]");
    tabList.focus();
    await act(async () => {
      tabList.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    assert.equal(document.querySelector("[role=listbox]"), null);
    assert.equal(document.activeElement, document.getElementById("role-select"));
  } finally {
    await records.unmount();
    await select.unmount();
  }
});
