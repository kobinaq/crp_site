"use client";

import { useRef, useState } from "react";
import { quiet } from "@/components/admin/marks";
import { isStaffStreamPath, type AnswerView, type DocumentView } from "@/lib/holdings";

type ClipView = Extract<AnswerView, { readonly kind: "clip" }>;

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

export function PrivateMedia({ applicantId, view }: { applicantId: string; view: ClipView }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const opening = useRef(false);
  const retried = useRef(false);

  async function open() {
    if (opening.current) return;
    opening.current = true;
    try {
      const url = await openHolding(applicantId, "answer", view.questionId);
      if (!url) return;
      setFailed(false);
      setSrc(url);
    } finally {
      opening.current = false;
    }
  }

  function onError() {
    if (!src) return;
    setSrc(null);
    if (retried.current) {
      setFailed(true);
      return;
    }
    retried.current = true;
    void open();
  }

  if (failed) return <p className="mt-3 text-sm">Playback failed</p>;
  const label = view.medium === "video" ? "Play video" : "Play audio";
  return (
    <div className="mt-3">
      {src ? null : <button className={quiet} type="button" onClick={() => open()}>{label}</button>}
      {src && view.medium === "video" ? (
        <video ref={bindMedia(src)} controls playsInline preload="none" onError={onError} />
      ) : null}
      {src && view.medium === "audio" ? (
        <audio ref={bindMedia(src)} controls preload="none" onError={onError} />
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

export function DocumentReveal({ applicantId, view }: { applicantId: string; view: DocumentView }) {
  const [src, setSrc] = useState<string | null>(null);

  async function open() {
    const url = await openHolding(applicantId, "document", view.documentId);
    if (url) setSrc(url);
  }

  const image = view.contentType.startsWith("image/");
  return (
    <div className="mt-4">
      <button className={quiet} type="button" onClick={() => open()}>{`Show document ${view.kind}`}</button>
      {src && image ? <img alt="" className="mt-3 max-w-full" referrerPolicy="no-referrer" src={src} /> : null}
      {src && !image ? <iframe className="mt-3 h-96 w-full" referrerPolicy="no-referrer" src={src} title={view.kind} /> : null}
    </div>
  );
}
