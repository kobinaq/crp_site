# Beacon constraints for published stories

Source: beacon walkthrough, checked against `lib/pins.ts`, `components/PlatformSection.tsx`, `components/platform/Globe.tsx`, and `components/platform/PlatformGlobe.tsx`.

The home page section `id="platform"` is a client component with no props. It renders a globe, three group tabs, a blurb from page copy, and a coming-soon seal. The home page does not pass `pins`, so `Globe` uses the hardcoded `pins` array.

A pin is `{ id, group, city, lat, lng }` plus `kind: "icon"` or `kind: "photo"` with `image`. There is no title, body, locale, or region field. The only beacon pins are `beacon-dublin`, `beacon-antalya`, `beacon-nairobi`, `beacon-sao-paulo`, and `beacon-manila`. Missions and ambassadors are other groups on the same globe. About already passes its own `pins` into the same `PlatformGlobe`. Changing `GlobePin` markup changes About.

`PlatformGlobe` already accepts optional `pins` and forwards them. That is the only existing data slot. `GlobePin` is a button with `aria-label={pin.city}` and a city pill. It does not navigate.

`prefers-reduced-motion` never mounts the live canvas, so no pins render. The static globe image stays. An empty pin list still calls `onReady` and shows a bare globe.

Copy the section actually reads is `platform.subtitle`, `platform.comingSoon`, `platform.groups.*.label`, `platform.groups.*.blurb`, and `a11y.platformGroups`. `pinGroups.beacons.label` and `.blurb` in `lib/pins.ts` are unused.

A failed stories query has to leave this section as it is today, including the five demo beacon pins. A successful query may add story content. It must not restyle the pin, the tabs, the seal, or the section box.
