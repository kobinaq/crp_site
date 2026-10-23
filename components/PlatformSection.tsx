"use client";

import Image from "next/image";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { DisplayWordmark } from "./DisplayWordmark";
import { PlatformGlobe } from "./platform/PlatformGlobe";
import { PinIcon } from "./platform/PinIcon";
import { ComingSoonBadge } from "./platform/ComingSoonBadge";
import { pinGroupIds, type PinGroup } from "@/lib/pins";
import { useCopy } from "./LanguageProvider";
import { MOBILE_GLOBE_YAW, useIsMobile } from "@/lib/useIsMobile";

const SWEEP_DURATION = 13; // seconds for one left-to-right pass (half previous speed)
const BTN_RADIUS = 24;

const BTN =
  "inline-flex h-[79px] items-center gap-[10px] whitespace-nowrap rounded-[24px] pl-6 pr-7 text-[18px] font-semibold uppercase tracking-[0.04em]";

function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const x2 = x + w;
  const y2 = y + h;
  const n = (value: number) => value.toFixed(2);
  const rad = n(rr);
  return `path("M${n(x + rr)},${n(y)} H${n(x2 - rr)} A${rad} ${rad} 0 0 1 ${n(x2)},${n(y + rr)} V${n(y2 - rr)} A${rad} ${rad} 0 0 1 ${n(x2 - rr)},${n(y2)} H${n(x + rr)} A${rad} ${rad} 0 0 1 ${n(x)},${n(y2 - rr)} V${n(y + rr)} A${rad} ${rad} 0 0 1 ${n(x + rr)},${n(y)} Z")`;
}

function limeSweepClip(x: number, width: number, height: number) {
  if (x <= 0) return "inset(0 100% 0 0)";
  if (x >= width) return "none";
  return roundedRectPath(0, 0, x, height, BTN_RADIUS);
}

type TabBox = {
  left: number;
  width: number;
  height: number;
  leftN: number;
  rightN: number;
};

function TabButton({
  group,
  index,
  active,
  mode,
  onSelect,
  sweep,
  rowWidth,
  box,
  label,
}: {
  group: PinGroup;
  index: number;
  active: boolean;
  mode: "auto" | "manual";
  onSelect: (group: PinGroup) => void;
  sweep: MotionValue<number>;
  rowWidth: number;
  box: TabBox | undefined;
  label: string;
}) {
  const left = box?.left ?? 0;
  const width = box?.width ?? 1;
  const height = box?.height ?? 56;

  const sweepClip = useTransform(sweep, (v) =>
    limeSweepClip(v * rowWidth - left, width, height),
  );

  const lime = (
    <span className="inline-flex items-center gap-2.5 mix-blend-hard-light [text-shadow:0_0_4px_rgba(0,0,0,0.25)]">
      <PinIcon group={group} className="h-4 w-4" />
      {label}
    </span>
  );

  return (
    <button
      type="button"
      role="tab"
      data-idx={index}
      aria-selected={active}
      onClick={() => onSelect(group)}
      className={`${BTN} relative overflow-hidden bg-black text-white`}
    >
      <span className="relative z-[1] inline-flex items-center gap-2.5">
        {lime}
      </span>
      {mode === "manual" ? (
        active ? (
          <span
            aria-hidden
            className={`${BTN} pointer-events-none absolute inset-0 z-[2] bg-lime text-black`}
          >
            {lime}
          </span>
        ) : null
      ) : (
        <motion.div
          aria-hidden
          style={{ clipPath: sweepClip, WebkitClipPath: sweepClip }}
          className={`${BTN} pointer-events-none absolute inset-0 z-[2] bg-lime text-black`}
        >
          {lime}
        </motion.div>
      )}
    </button>
  );
}

function GroupTabs({
  activeGroup,
  mode,
  inView,
  onSelect,
  onSweepActive,
  onClear,
  groupsLabel,
  groupLabels,
}: {
  activeGroup: PinGroup;
  mode: "auto" | "manual";
  inView: boolean;
  onSelect: (group: PinGroup) => void;
  onSweepActive: (group: PinGroup) => void;
  onClear: () => void;
  groupsLabel: string;
  groupLabels: Record<PinGroup, string>;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const metricsRef = useRef<TabBox[]>([]);
  const lastIdx = useRef(-1);
  const leftSection = useRef(false);
  const onClearRef = useRef(onClear);
  const sweep = useMotionValue(0);
  const reduce = useReducedMotion();
  const [rowWidth, setRowWidth] = useState(1);
  const [boxes, setBoxes] = useState<TabBox[]>([]);

  // Ref copy of onClear for the document listeners below, set in an effect not during render.
  useEffect(() => {
    onClearRef.current = onClear;
  }, [onClear]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const btns = Array.from(
        row.querySelectorAll<HTMLElement>("[data-idx]"),
      );
      const w = row.offsetWidth || 1;
      const next = btns.map((b) => ({
        left: b.offsetLeft,
        width: b.offsetWidth,
        height: b.offsetHeight,
        leftN: b.offsetLeft / w,
        rightN: (b.offsetLeft + b.offsetWidth) / w,
      }));
      metricsRef.current = next;
      setBoxes(next);
      setRowWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (mode !== "auto" || reduce === true) return;
    lastIdx.current = -1;
    const controls = animate(sweep, [0, 1], {
      duration: SWEEP_DURATION,
      ease: "linear",
      repeat: Infinity,
      repeatType: "loop",
    });
    return () => controls.stop();
  }, [mode, reduce, sweep]);

  useEffect(() => {
    if (mode !== "auto") return;
    if (!inView) {
      leftSection.current = true;
      return;
    }
    if (!leftSection.current) return;
    leftSection.current = false;
    lastIdx.current = -1;
    sweep.set(0);
  }, [inView, mode, sweep]);

  useEffect(() => {
    if (mode !== "manual") return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rowRef.current?.contains(target)) return;
      onClearRef.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClearRef.current();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mode]);

  useMotionValueEvent(sweep, "change", (v) => {
    if (mode !== "auto") return;
    const m = metricsRef.current;
    if (!m.length) return;
    let idx = 0;
    for (let i = 0; i < m.length; i++) if (m[i].leftN <= v) idx = i;
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      onSweepActive(pinGroupIds[idx]);
    }
  });

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label={groupsLabel}
      className="relative inline-flex items-stretch"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {pinGroupIds.map((group, index) => (
        <TabButton
          key={group}
          group={group}
          index={index}
          active={group === activeGroup}
          mode={mode}
          onSelect={onSelect}
          sweep={sweep}
          rowWidth={rowWidth}
          box={boxes[index]}
          label={groupLabels[group]}
        />
      ))}
    </div>
  );
}

function PlatformBackdrop() {
  return (
    // Extend past the section so the wash fills the Content section's top-corner curves.
    <div className="pointer-events-none absolute inset-x-0 top-0 -bottom-[110px] -z-10 overflow-hidden bg-[#ec268f] desk:-bottom-[120px]">
      {/* Desktop: the glow grows with the viewport so wide screens never show its edges. */}
      <div className="absolute left-1/2 top-[calc(50%+0.5px)] h-[1168px] w-[1312px] -translate-x-1/2 -translate-y-1/2 desk:h-[max(1280px,calc(100%+240px))] desk:w-[max(1312px,calc(100vw+240px))]">
        <div className="relative size-full blur-[38px]">
        <Image
          src="/images/platform-wash.png"
          alt=""
          fill
          sizes="(min-width: 1312px) 100vw, 1312px"
          className="object-cover object-bottom"
        />
        </div>
      </div>
    </div>
  );
}

export function PlatformSection() {
  const globeYaw = useIsMobile() ? MOBILE_GLOBE_YAW : 0;
  const copy = useCopy();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.15 });
  const [activeGroup, setActiveGroup] = useState<PinGroup>("beacons");
  const [mode, setMode] = useState<"auto" | "manual">("auto");

  const activeIdx = pinGroupIds.indexOf(activeGroup);
  const visibleGroups: readonly PinGroup[] =
    mode === "manual"
      ? [activeGroup]
      : pinGroupIds.slice(0, Math.max(1, activeIdx + 1));

  return (
    <section
      ref={sectionRef}
      id="platform"
      data-nav-tone="dark"
      className="relative isolate h-[954px] overflow-x-clip pt-0 snap-section desk:h-[805px] desk:overflow-visible desk:pt-0"
    >
      <PlatformBackdrop />

      <div className="relative mx-auto flex h-full w-full max-w-[1200px] flex-col items-center @container">
        <ComingSoonBadge className="absolute top-[32px] right-0 z-40 w-[81px] desk:!hidden" />
        <div className="relative z-20 flex w-full flex-col items-center gap-[11px] px-0 pt-[96px] text-center leading-[0.9] desk:max-w-[955px] desk:gap-0 desk:px-0 desk:pt-[96px]">
          <DisplayWordmark
            kicker={copy.platform.kicker}
            word={copy.platform.word}
            size="platform"
            className="relative z-0 shrink-0"
          />
          <p className="relative z-20 w-[285px] text-[28px] font-normal tracking-[-1.12px] text-white desk:w-auto desk:text-[48px] desk:tracking-[-1.92px]">
            {copy.platform.subtitle}
          </p>
        </div>

        <div className="absolute top-[341px] left-1/2 z-10 size-[474px] -translate-x-1/2 desk:top-[42.5%] desk:size-[631px]">
          <div className="relative size-full">
            <div className="absolute inset-0 desk:top-1/2 desk:left-1/2 desk:size-[75.75%] desk:-translate-x-1/2 desk:-translate-y-1/2">
              <PlatformGlobe
                visibleGroups={visibleGroups}
                emphasis={mode === "manual" ? activeGroup : null}
                initialYaw={globeYaw}
              />
            </div>
            <ComingSoonBadge className="platform-soon-badge !hidden desk:!block" />
            <div className="absolute top-[300px] left-[calc(50%-50cqw)] z-20 w-[100cqw] desk:top-[42.5%] desk:left-1/2 desk:w-max desk:-translate-x-1/2">
              <div className="flex w-full flex-col items-stretch gap-[17px] text-center desk:items-center desk:gap-6">
                <div className="w-full overflow-x-auto no-scrollbar touch-pan-x desk:w-auto desk:overflow-visible">
                  <div className="flex w-max justify-start desk:w-auto desk:justify-center">
                    <GroupTabs
                      activeGroup={activeGroup}
                      mode={mode}
                      inView={inView}
                      groupsLabel={copy.a11y.platformGroups}
                      groupLabels={{
                        beacons: copy.platform.groups.beacons.label,
                        missions: copy.platform.groups.missions.label,
                        ambassadors: copy.platform.groups.ambassadors.label,
                      }}
                      onSelect={(group) => {
                        setMode("manual");
                        setActiveGroup(group);
                      }}
                      onSweepActive={(group) => setActiveGroup(group)}
                      onClear={() => {
                        setMode("auto");
                        setActiveGroup("beacons");
                      }}
                    />
                  </div>
                </div>
                <p className="w-full px-[38px] text-center text-[20px] font-normal leading-[0.9] tracking-[-0.8px] text-white desk:w-[422px] desk:px-0 desk:text-[24px] desk:tracking-[-0.96px]">
                  {copy.platform.groups[activeGroup].blurb}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
