"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { Pin, PinGroup } from "@/lib/pins";
import { GlobeShell } from "./GlobeShell";
import {
  GLOBE_DEFER_MS,
  HOME_GLOBE_WAIT_IMAGES,
  waitForImages,
} from "./globe-defer";

export type PlatformGlobeProps = {
  visibleGroups: readonly PinGroup[];
  emphasis: PinGroup | null;
  pins?: readonly Pin[];
  /** Image path fragments that must finish (or time out) before the live globe mounts. */
  waitForImages?: readonly string[];
  /** Starting spin angle in radians (0 = default framing). */
  initialYaw?: number;
};

function useGlobeReady(imageKeys: readonly string[]): boolean {
  const reduceMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const imageKey = imageKeys.join("\0");

  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, GLOBE_DEFER_MS);

    waitForImages(imageKeys).then(() => {
      if (!cancelled) {
        window.clearTimeout(timeout);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [reduceMotion, imageKey, imageKeys]);

  return reduceMotion ? false : ready;
}

function GlobeStatic({ hidden }: { hidden?: boolean }) {
  return (
    <div
      className="absolute inset-[-16%] transition-opacity duration-500 ease-out"
      style={{ opacity: hidden ? 0 : 1 }}
      aria-hidden={hidden ? true : undefined}
    >
      <Image
        src="/images/platform-globe-static.png"
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 900px) 631px, 300px"
        className="object-contain"
      />
    </div>
  );
}

const Globe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => null,
});

export function PlatformGlobe({
  visibleGroups,
  emphasis,
  pins,
  waitForImages: imageKeys = HOME_GLOBE_WAIT_IMAGES,
  initialYaw,
}: PlatformGlobeProps) {
  const deferReady = useGlobeReady(imageKeys);
  const [live, setLive] = useState(false);

  // Reset when the globe un-defers (adjusting state during render, not in an effect).
  if (!deferReady && live) setLive(false);

  return (
    <GlobeShell>
      <GlobeStatic hidden={live} />
      {deferReady ? (
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-out"
          style={{ opacity: live ? 1 : 0 }}
        >
          <Globe
            visibleGroups={visibleGroups}
            emphasis={emphasis}
            pins={pins}
            initialYaw={initialYaw}
            onReady={() => setLive(true)}
          />
        </div>
      ) : null}
    </GlobeShell>
  );
}
