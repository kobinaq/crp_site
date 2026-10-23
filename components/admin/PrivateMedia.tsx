"use client";

import { useState } from "react";
import { Button } from "@/components/admin/Button";
import { staffMediaPath, type AnswerView, type DocumentView } from "@/lib/holdings";

type ClipView = Extract<AnswerView, { readonly kind: "clip" }>;

type Player = {
  identity: string;
  src: string | null;
  failed: boolean;
};

type DocumentState = {
  identity: string;
  src: string | null;
};

function blankPlayer(identity: string): Player {
  return { identity, src: null, failed: false };
}

// Nothing is requested until staff press the button. The stream route checks
// the staff session cookie, so the address carries no access code.
export function PrivateMedia({ applicantId, view }: { applicantId: string; view: ClipView }) {
  const identity = `${applicantId}:${view.questionId}:${view.medium}`;
  const [player, setPlayer] = useState(() => blankPlayer(identity));
  if (player.identity !== identity) setPlayer(blankPlayer(identity));
  const shown = player.identity === identity ? player : blankPlayer(identity);

  function open() {
    const src = staffMediaPath(applicantId, "answer", view.questionId);
    setPlayer((current) => current.identity === identity ? { ...current, src, failed: false } : current);
  }

  function onError() {
    setPlayer((current) => current.identity === identity && current.src ? { ...current, src: null, failed: true } : current);
  }

  if (shown.failed) return <p className="mt-3 text-sm">Playback failed</p>;
  const label = view.medium === "video" ? "Play video" : "Play audio";
  return (
    <div className="mt-3">
      {shown.src ? null : <Button variant="outline" type="button" onClick={() => open()}>{label}</Button>}
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

  function open() {
    const src = staffMediaPath(applicantId, "document", view.documentId);
    setDocumentState((current) => current.identity === identity ? { ...current, src } : current);
  }

  const image = view.contentType.startsWith("image/");
  return (
    <div className="mt-4">
      <Button variant="outline" type="button" onClick={() => open()}>{`Show document ${view.kind}`}</Button>
      {shown.src && image ? (
        // The image optimizer would request this stream without the staff cookie.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="mt-3 max-w-full" referrerPolicy="no-referrer" src={shown.src} />
      ) : null}
      {shown.src && !image ? <iframe className="mt-3 h-96 w-full" referrerPolicy="no-referrer" src={shown.src} title={view.kind} /> : null}
    </div>
  );
}
