"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { ContentPoster } from "./ContentPoster";
import { contentPosters, type PosterKind } from "@/lib/content";
import { trail } from "@/lib/fonts";
import { useCopy } from "./LanguageProvider";

const HOVER_PLAYBACK_RATE = 0.28;

type Orientation = "vertical" | "horizontal" | "window";

function wrapLoop(value: number, period: number) {
  if (period <= 0) return value;
  return ((value % period) + period) % period;
}

function reducedMotionPreferred() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function PosterTitle({ kind }: { kind: PosterKind }) {
  switch (kind) {
    case "phone":
      return (
        <div className="absolute left-[47px] top-[114px] flex w-[309px] -translate-y-1/2 items-baseline justify-center gap-[9px] text-center uppercase leading-[0.9] text-white [text-shadow:0_0_4.5px_rgba(0,0,0,0.25)]">
          <span className="text-[29px] font-semibold tracking-[0.04em]">My</span>
          <span className={`${trail.className} text-[72px] tracking-[0.04em]`}>
            Phone
          </span>
          <span className="text-[29px] font-semibold tracking-[0.04em]">,</span>
        </div>
      );
    case "getup":
      return (
        <div className="absolute left-[26px] top-[114px] flex -translate-y-1/2 items-baseline gap-3 whitespace-nowrap uppercase leading-[0.9] text-white [text-shadow:0_0_6px_rgba(0,0,0,0.25)]">
          <span className={`${trail.className} text-[94px] tracking-[0.04em]`}>
            Get
          </span>
          <span className="text-[38px] font-semibold tracking-[0.04em]">
            up &amp; go?
          </span>
        </div>
      );
    case "wish":
      return (
        <div className="absolute inset-0 leading-[0.9] text-white">
          <p className="absolute left-[calc(50%-79px)] top-[10px] text-[93px] font-normal tracking-[-0.04em]">
            wish
          </p>
          <p className="absolute left-[calc(50%-14px)] top-[75px] text-[93px] font-normal tracking-[-0.04em]">
            knew
          </p>
          <p
            className={`${trail.className} absolute left-[105px] top-[19px] -translate-x-1/2 -scale-y-100 rotate-180 text-[180px] tracking-[0.04em] [text-shadow:0_0_11px_rgba(0,0,0,0.25)]`}
          >
            I
          </p>
        </div>
      );
    case "chicken":
      return (
        <div className="absolute inset-0 text-white [text-shadow:0_0_9px_rgba(0,0,0,0.25)]">
          <p className="absolute left-[76px] top-[59px] text-[69px] font-medium leading-[0.72] tracking-[-0.04em]">
            Chicken
          </p>
          <p className="absolute left-[153px] top-[107px] text-[69px] font-medium leading-[0.72] tracking-[-0.04em]">
            Duck
          </p>
          <p className="absolute left-[136px] top-[137px] -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] text-[43px] font-semibold uppercase leading-[0.9] tracking-[0.04em]">
            Or
          </p>
        </div>
      );
    case "taste":
      return (
        <div className="absolute left-1/2 top-[59px] flex w-[147px] -translate-x-1/2 flex-col items-center gap-1 text-center text-white">
          <p className="text-[59px] font-extralight leading-[0.72] tracking-[-0.04em] [text-shadow:0_0_5px_rgba(0,0,0,0.25)]">
            taste
          </p>
          <div className="flex flex-col items-center uppercase leading-[0.9]">
            <p className="text-[20px] font-semibold tracking-[0.04em] [text-shadow:0_0_3px_rgba(0,0,0,0.25)]">
              Of
            </p>
            <p
              className={`${trail.className} text-[55px] tracking-[0.04em] [text-shadow:0_0_3.5px_rgba(0,0,0,0.25)]`}
            >
              Home
            </p>
          </div>
        </div>
      );
    case "cash":
      return (
        <div className="absolute left-[101px] top-[48px] flex w-[149px] flex-col items-start uppercase leading-[0.9] tracking-[0.04em] text-white [text-shadow:0_0_8px_rgba(0,0,0,0.25)]">
          <p className="text-[52px] font-semibold">Ca$h</p>
          <p className={`${trail.className} -mb-2 text-[52px]`}>Or</p>
          <p className="text-[52px] font-semibold">Card</p>
        </div>
      );
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function PosterList({
  copyIndex,
  orientation,
}: {
  copyIndex: number;
  orientation: Orientation;
}) {
  const copy = useCopy();
  // Desktop column opens on "I wish I knew" (Figma 2308:298); the mobile row keeps the list order.
  const start =
    orientation === "vertical"
      ? Math.max(0, contentPosters.findIndex((p) => p.kind === "wish"))
      : 0;
  const posters = [...contentPosters.slice(start), ...contentPosters.slice(0, start)];
  return (
    <>
      {posters.map((poster) => (
        <ContentPoster
          key={`${copyIndex}-${poster.kind}`}
          image={poster.image}
          orientation={orientation}
          topic={copy.content.topics[poster.kind]}
          comingSoon={copy.content.comingSoon}
        >
          <PosterTitle kind={poster.kind} />
        </ContentPoster>
      ))}
    </>
  );
}

export function PosterMarquee({
  orientation = "vertical",
}: {
  orientation?: Orientation;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [dragging, setDragging] = useState(false);

  const horizontal = orientation !== "vertical";
  const hoveringRef = useRef(false);
  const draggingRef = useRef(false);
  const inViewRef = useRef(true);
  const loopSizeRef = useRef(0);
  const lastPointerRef = useRef(0);

  // Ref copy of inView so the auto-scroll sync can read it without being re-created.
  useEffect(() => {
    inViewRef.current = inView;
  }, [inView]);

  const syncAutoScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const freeze =
      reducedMotionPreferred() || draggingRef.current || !inViewRef.current;

    for (const anim of track.getAnimations()) {
      if (anim.playState !== "running" && !freeze) anim.play();
      anim.playbackRate = freeze
        ? 0
        : hoveringRef.current
          ? HOVER_PLAYBACK_RATE
          : 1;
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setInView(entry.isIntersecting);
      },
      { threshold: 0.15 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    const firstCopy = track?.firstElementChild;
    if (!(firstCopy instanceof HTMLElement)) return;

    const measure = () => {
      loopSizeRef.current = horizontal
        ? firstCopy.offsetWidth
        : firstCopy.offsetHeight;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(firstCopy);
    return () => observer.disconnect();
  }, [horizontal]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const frame = requestAnimationFrame(() => syncAutoScroll());
    track.addEventListener("animationstart", syncAutoScroll);
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("animationstart", syncAutoScroll);
    };
  }, [dragging, inView, syncAutoScroll]);

  useEffect(() => {
    if (!dragging) return;
    const { body } = document;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "grabbing";
    body.style.userSelect = "none";
    return () => {
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
    };
  }, [dragging]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (reducedMotionPreferred() && event.pointerType === "touch") return;

    event.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    lastPointerRef.current = horizontal ? event.clientX : event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    syncAutoScroll();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;

    const position = horizontal ? event.clientX : event.clientY;
    const dy = position - lastPointerRef.current;
    lastPointerRef.current = position;

    if (reducedMotionPreferred()) {
      const root = rootRef.current;
      if (root) {
        if (horizontal) root.scrollLeft -= dy;
        else root.scrollTop -= dy;
      }
      return;
    }

    const period = loopSizeRef.current;
    if (period <= 0) return;
    // Seek the same loop auto-scroll uses, so dragging either way keeps both copies in view.
    for (const animation of trackRef.current?.getAnimations() ?? []) {
      const duration = animation.effect?.getTiming().duration;
      if (typeof duration !== "number" || duration <= 0) continue;
      const currentTime = Number(animation.currentTime ?? 0);
      animation.currentTime = wrapLoop(
        currentTime - (dy / period) * duration,
        duration,
      );
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    hoveringRef.current = event.currentTarget.matches(":hover");
    syncAutoScroll();
  };

  return (
    <div
      ref={rootRef}
      data-poster-marquee
      className={`h-full overflow-hidden select-none [&_img]:pointer-events-none motion-reduce:no-scrollbar ${
        horizontal
          ? // Browser keeps vertical panning so the page still scrolls; we take horizontal drags.
            "w-full touch-pan-y motion-reduce:overflow-x-auto motion-reduce:touch-pan-x"
          : "touch-none motion-reduce:overflow-y-auto motion-reduce:touch-pan-y"
      } ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onPointerEnter={() => {
        hoveringRef.current = true;
        syncAutoScroll();
      }}
      onPointerLeave={() => {
        if (draggingRef.current) return;
        hoveringRef.current = false;
        syncAutoScroll();
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      <div
        ref={trackRef}
        data-poster-track
        className={`flex will-change-transform motion-reduce:animate-none ${
          horizontal
            ? "h-full w-max flex-row animate-poster-scroll-x"
            : "w-full flex-col animate-poster-scroll"
        }`}
      >
        <div className={`flex shrink-0 ${horizontal ? "flex-row" : "flex-col"}`}>
          <PosterList copyIndex={0} orientation={orientation} />
        </div>
        <div
          aria-hidden
          className={`flex shrink-0 motion-reduce:hidden ${
            horizontal ? "flex-row" : "flex-col"
          }`}
        >
          <PosterList copyIndex={1} orientation={orientation} />
        </div>
      </div>
    </div>
  );
}
