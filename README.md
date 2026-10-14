# Climate Refugee Pavilion landing page

Next.js (App Router) + Tailwind CSS v4 + Framer Motion, with an interactive
3D globe built on React Three Fiber.

```bash
npm install
npm run dev
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Application verification

Applicants complete one VideoAsk form configured by `VIDEOASK_FORM_URL` and
`VIDEOASK_FORM_ID`. Online applications move straight to review. In-person
applications continue through Didit; approved identity images are copied into
private Vercel Blob storage and can only be streamed through the authenticated
operations document route.

Configure Didit's webhook destination separately in its console, pointing to
`https://<your-domain>/api/webhooks/identity`, and set `DIDIT_WEBHOOK_SECRET`.
The session `callback` is a browser redirect to `/apply/complete`; it is not
the webhook destination. Only authenticated webhook events record approval.

Applicants who submit an email already on file can request a fresh, single-use resume link sent to that mailbox. The public form does not disclose
existing application IDs or grant access to existing verification sessions.

Accepted applicants receive the locale-specific Calendly URL. Register
`/api/webhooks/calendly` with `node scripts/register-calendly-webhook.mjs`; the
script needs `CALENDLY_PERSONAL_ACCESS_TOKEN` and `APP_URL`. Calendly booking
events update `interviewAt` without changing pipeline status.

> **Build-time font fetch:** the `Outfit` body font is loaded via
> `next/font/google`, so `next build` needs network access to
> `fonts.googleapis.com`. In an offline/proxied environment either allow that
> host or self-host the font with `next/font/local`. The display font (`Trail`)
> is already self-hosted from `public/TrailFree-*`.

## Structure

- `app/page.tsx` composes the sections in order: `Header`, `Hero`,
  `PavilionPanel`, `PlatformSection`, `ContentGrid`, `GetInvolved`, `Waitlist`,
  `Sponsors`, `Footer`, plus the floating `GetInvolvedPill`.
- `components/SectionReveal.tsx` wraps content in the shared `whileInView`
  fade/slide. Backdrop layers (wordmarks, gradients, washes) are not animated.
- `components/DisplayWordmark.tsx` renders the large `Trail`-font section
  wordmarks (`Pavilion`, `Platform`, `Content`).
- Design tokens (colors, fonts, the 900px `desk` breakpoint, blob radii, the
  poster-scroll keyframes) live in `app/globals.css` under `@theme`. The shared
  hero/pavilion column width is the `--column-w` custom property.
- Copy and data live in `lib/`: `content.ts` (content posters), `nav.ts`
  (header links), and `pins.ts` (globe pin groups and locations).
- Fonts are declared once in `lib/fonts.ts` (`outfit`, `trail`).

## Platform globe

`components/platform/Globe.tsx` is the interactive 3D globe (React Three
Fiber), loaded through `components/platform/PlatformGlobe.tsx` with
`next/dynamic` (`ssr: false`) so it never runs on the server;
`GlobeLoading` reserves the footprint while the canvas mounts.
