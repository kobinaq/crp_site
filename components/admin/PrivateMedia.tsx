"use client";

import { useRef, useState } from "react";
import { quiet } from "@/components/admin/marks";
import { isStaffStreamPath, type AnswerView, type DocumentView } from "@/lib/holdings";

type ClipView = Extract<AnswerView, { readonly kind: "clip" }>;

type Player = {
  identity: string;
  src: string | null;
  failed: boolean;
  retried: boolean;
};

type DocumentState = {
  identity: string;
  src: string | null;
};

async function openHolding(applicantId: string, slot: "answer" | "document", holdingId: string): Promise<string | null> {
  const response = await fetch(`/admin/records/applicants/${applicantId}/open`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slot, holdingId }),
  });
  const opened = await response.json().catch(() => null);
  const url = opened && typeof opened === "object" && typeof opened.url === "string" ? opened.url : "";
  if (!response.ok || !isStaffStreamPath(applicantId, url)) return null;
  return url;
}

function blankPlayer(identity: string): Player {
  return { identity, src: null, failed: false, retried: false };
}

export function PrivateMedia({ applicantId, view }: { applicantId: string; view: ClipView }) {
  const identity = `${applicantId}:${view.questionId}:${view.medium}`;
  const [player, setPlayer] = useState(() => blankPlayer(identity));
  if (player.identity !== identity) setPlayer(blankPlayer(identity));
  const shown = player.identity === identity ? player : blankPlayer(identity);
  const opening = useRef(false);

  async function open() {
    if (opening.current) return;
    opening.current = true;
    const requested = identity;
    try {
      const url = await openHolding(applicantId, "answer", view.questionId);
      if (!url) return;
      setPlayer((current) => current.identity === requested ? { ...current, src: url, failed: false } : current);
    } finally {
      opening.current = false;
    }
  }

  function onError() {
    if (!shown.src) return;
    const retry = !shown.retried;
    setPlayer((current) => {
      if (current.identity !== identity || !current.src) return current;
      if (current.retried) return { ...current, src: null, failed: true };
      return { ...current, src: null, retried: true };
    });
    if (retry) void open();
  }

  if (shown.failed) return <p className="mt-3 text-sm">Playback failed</p>;
  const label = view.medium === "video" ? "Play video" : "Play audio";
  return (
    <div className="mt-3">
      {shown.src ? null : <button className={quiet} type="button" onClick={() => open()}>{label}</button>}
      {shown.src && view.medium === "video" ? (
        <video ref={bindMedia(shown.src)} controls playsInline preload="none" onError={onError} />
      ) : null}
      {shown.src && view.medium === "audio" ? (
        <audio ref={bindMedia(shown.src)} controls preload="none" onError={onError} />
      ) : null}
    </div>
  );
}

function bindMedia(src: string) {
  return (element: HTMLMediaElement | null) => {
    if (!element || element.dataset.bound === src) return;
    element.setAttribute("referrerpolicy", "no-referrer");
    element.dataset.bound = src;
    element.src = src;
  };
}

function blankDocument(identity: string): DocumentState {
  return { identity, src: null };
}

export function DocumentReveal({ applicantId, view }: { applicantId: string; view: DocumentView }) {
  const identity = `${applicantId}:${view.documentId}`;
  const [documentState, setDocumentState] = useState(() => blankDocument(identity));
  if (documentState.identity !== identity) setDocumentState(blankDocument(identity));
  const shown = documentState.identity === identity ? documentState : blankDocument(identity);
  const opening = useRef(false);

  async function open() {
    if (opening.current) return;
    opening.current = true;
    const requested = identity;
    try {
      const url = await openHolding(applicantId, "document", view.documentId);
      if (!url) return;
      setDocumentState((current) => current.identity === requested ? { ...current, src: url } : current);
    } finally {
      opening.current = false;
    }
  }

  const image = view.contentType.startsWith("image/");
  return (
    <div className="mt-4">
      <button className={quiet} type="button" onClick={() => open()}>{`Show document ${view.kind}`}</button>
      {shown.src && image ? (
        // The image optimizer would request this stream without the staff cookie.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="mt-3 max-w-full" referrerPolicy="no-referrer" src={shown.src} />
      ) : null}
      {shown.src && !image ? <iframe className="mt-3 h-96 w-full" referrerPolicy="no-referrer" src={shown.src} title={view.kind} /> : null}
    </div>
  );
}
