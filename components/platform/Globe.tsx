"use client";

import { useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  RepeatWrapping,
  Vector3,
  type Group,
} from "three";
import { pins, type Pin, type PinGroup } from "@/lib/pins";
import { GlobePin } from "./GlobePin";

const SPIN_RAD_PER_SEC = (Math.PI * 2) / 60;
const PITCH_LIMIT = Math.PI / 3;
const RADIUS = 1;
const PIN_RADIUS = 1.02;

type GlobeProps = {
  visibleGroups: readonly PinGroup[];
  emphasis: PinGroup | null;
  pins?: readonly Pin[];
  /** Fired once the earth texture is up and pins have been projected once. */
  onReady?: () => void;
};

// Pin id -> its wrapper div, shared by the DOM pin layer and the projector in the canvas.
type PinElMap = Map<string, HTMLDivElement>;

function latLngToPosition(lat: number, lng: number, radius: number): Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// The texture paints the ocean flat magenta, so this blends a lighter pink gradient over the sea.
const EARTH_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const EARTH_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec3 vN;
void main() {
  vec4 tex = texture2D(map, vUv);
  // Ocean pixels are blue-heavy (b > g) and land is yellow-green (g > b): a cheap sea/land mask.
  float oceanMask = smoothstep(-0.05, 0.15, tex.b - tex.g);
  float light = clamp(vN.y * 0.6 - vN.x * 0.3 + 0.5, 0.0, 1.0);
  vec3 deepSea = vec3(0.80, 0.30, 0.56);
  vec3 lightSea = vec3(0.99, 0.72, 0.86);
  vec3 seaGradient = mix(deepSea, lightSea, light);
  vec3 finalColor = mix(tex.rgb, seaGradient, oceanMask);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

function GlobeScene({
  visiblePins,
  pinElsRef,
  onProjected,
}: {
  visiblePins: readonly Pin[];
  pinElsRef: RefObject<PinElMap>;
  onProjected: () => void;
}) {
  const groupRef = useRef<Group>(null);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const projected = useRef(false);
  const reduceMotion = useReducedMotion();
  const { camera, size } = useThree();
  const colorMap = useTexture("/textures/earth-tinted.png", (texture) => {
    // Sampled raw and written straight out, so GLSL needs no sRGB decode/encode.
    texture.colorSpace = NoColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = 16;
  });
  const earthUniforms = useMemo(() => ({ map: { value: colorMap } }), [colorMap]);

  // Each pin's fixed spot on the sphere, before the globe's own rotation.
  const pinBasePositions = useMemo(() => {
    const map = new Map<string, Vector3>();
    for (const pin of visiblePins) {
      map.set(pin.id, latLngToPosition(pin.lat, pin.lng, PIN_RADIUS));
    }
    return map;
  }, [visiblePins]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const dx = event.clientX - last.current.x;
      const dy = event.clientY - last.current.y;
      last.current = { x: event.clientX, y: event.clientY };
      if (event.pointerType === "touch") {
        // Horizontal drag only on touch so vertical gestures still scroll.
        if (Math.abs(dx) >= Math.abs(dy)) {
          yaw.current += dx * 0.005;
        }
        return;
      }
      yaw.current += dx * 0.005;
      const nextPitch = pitch.current + dy * 0.005;
      pitch.current = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, nextPitch));
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const widthHalf = size.width / 2;
  const heightHalf = size.height / 2;
  const worldPos = useMemo(() => new Vector3(), []);

  useFrame((_, delta) => {
    if (!dragging.current && !reduceMotion) {
      yaw.current += delta * SPIN_RAD_PER_SEC;
    }
    const group = groupRef.current;
    if (!group) return;
    group.rotation.y = yaw.current;
    group.rotation.x = pitch.current;
    group.updateMatrixWorld();

    // Project each visible pin onto the 2D overlay, hiding it once it turns to the far side.
    const els = pinElsRef.current;
    if (!els) return;
    let positioned = 0;
    for (const pin of visiblePins) {
      const el = els.get(pin.id);
      const base = pinBasePositions.get(pin.id);
      if (!el || !base) continue;
      worldPos.copy(base).applyMatrix4(group.matrixWorld);
      // Camera sits on +Z facing a centred sphere, so world-space z > 0 means the point faces us.
      if (worldPos.z <= 0) {
        el.style.display = "none";
        el.style.visibility = "hidden";
        positioned += 1;
        continue;
      }
      el.style.display = "";
      el.style.visibility = "visible";
      const ndc = worldPos.clone().project(camera);
      const x = ndc.x * widthHalf + widthHalf;
      const y = -(ndc.y * heightHalf) + heightHalf;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      positioned += 1;
    }

    if (
      !projected.current &&
      (visiblePins.length === 0 || positioned === visiblePins.length)
    ) {
      projected.current = true;
      queueMicrotask(onProjected);
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={(event) => {
        event.stopPropagation();
        dragging.current = true;
        last.current = { x: event.clientX, y: event.clientY };
      }}
    >
      <mesh>
        <sphereGeometry args={[RADIUS, 96, 96]} />
        {/* Custom shader so the ocean can be a gradient, and to skip r3f's tone mapping. */}
        <shaderMaterial
          uniforms={earthUniforms}
          vertexShader={EARTH_VERT}
          fragmentShader={EARTH_FRAG}
        />
      </mesh>
    </group>
  );
}

// Pins are plain DOM over the canvas; the projector moves them so each tracks its own lat/lng.
function PinLayer({
  visiblePins,
  emphasis,
  pinElsRef,
  revealed,
}: {
  visiblePins: readonly Pin[];
  emphasis: PinGroup | null;
  pinElsRef: RefObject<PinElMap>;
  revealed: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-visible transition-opacity duration-300 ease-out"
      style={{ opacity: revealed ? 1 : 0 }}
      aria-hidden={!revealed}
    >
      {visiblePins.map((pin) => (
        <GlobePin
          key={pin.id}
          pin={pin}
          emphasized={emphasis === null || pin.group === emphasis}
          ref={(el) => {
            if (el) pinElsRef.current.set(pin.id, el);
            else pinElsRef.current.delete(pin.id);
          }}
        />
      ))}
    </div>
  );
}

export default function Globe({
  visibleGroups,
  emphasis,
  pins: source = pins,
  onReady,
}: GlobeProps) {
  const pinElsRef = useRef<PinElMap>(new Map());
  const [pinsReady, setPinsReady] = useState(false);
  const readySent = useRef(false);
  const visiblePins = useMemo(
    () => source.filter((pin) => visibleGroups.includes(pin.group)),
    [source, visibleGroups],
  );

  const handleProjected = () => {
    setPinsReady(true);
    if (readySent.current) return;
    readySent.current = true;
    onReady?.();
  };

  return (
    // Parent PlatformGlobe owns GlobeShell so the static underlay shares the same frame.
    <div className="absolute inset-[-16%]">
      <Canvas
        camera={{ position: [0, 0, 4.3], fov: 32 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ touchAction: "pan-y", overflow: "visible" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={null}>
          <GlobeScene
            visiblePins={visiblePins}
            pinElsRef={pinElsRef}
            onProjected={handleProjected}
          />
        </Suspense>
      </Canvas>
      <PinLayer
        visiblePins={visiblePins}
        emphasis={emphasis}
        pinElsRef={pinElsRef}
        revealed={pinsReady}
      />
    </div>
  );
}
