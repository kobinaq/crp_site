# Design system constraints for /admin

Source: design-system walkthrough, plus app/globals.css, lib/fonts.ts, proxy.ts, app/robots.ts.

- Tailwind v4. Tokens live in app/globals.css @theme. No tailwind.config.
- Colors: cream #f4f1ea, ink #000000, lime #d2de38, magenta #ec268f, orange #fa8d2e, leaf #6dc06e, pin #3dadff.
- gradient-brand is linear-gradient(100deg, magenta, orange).
- Font is Outfit (400/500/600/700) via --font-outfit on html. Trail Free is display-only. Geist is loaded and unused.
- Desktop breakpoint is desk: at 900px, not md/lg.
- There is no shared Button or Card. Reuse class strings, not Header, Footer, or LanguageDropdown.
- Admin-scale panels already exist off marketing pages: rounded-[32px] bg-white on bg-cream. Marketing blobs (88px/150px) are too large for tables.
- Primary control is a pill: rounded-full gradient-brand uppercase semibold.
- Fields: h-12 rounded-[40px] border border-black/12. Errors text-magenta.
- /admin is a sibling of app/[lang], like app/confirmation. It is not in publicPaths, so proxy sets X-Robots-Tag noindex and does not locale-prefix it. /en/admin 404s.
- robots.ts does not disallow /admin. Noindex today is the root metadata default plus the proxy header. Add /admin to robots.ts disallow so a crawler that ignores the header still stays out. Do not call pageMetadata() from admin pages.
- Root layout wraps /admin in LanguageProvider, ConsentProvider, and PostHogProvider. Do not opt the route out of those providers. Do not link /admin from public nav.
