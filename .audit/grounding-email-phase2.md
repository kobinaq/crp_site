# Email, rate limit, Turnstile, and analytics constraints

Source: email walkthrough, checked against the `deliverEmail` header in `lib/email.ts`.

`deliverEmail` is called by the job worker and by the staff sign-in action. Staff calls it in the request, with the token hash as the Resend idempotency key, because a magic link cannot wait for the minute cron. A member sign-in link follows that path. A moderation notice can wait, so it is a job committed with the story row, rendered in the member's locale before insert, and sent by the worker.

Acknowledgement mail is `en`/`fr`/`es`/`pt` from `lib/translations/acknowledgement-emails.json`, with published overrides loaded by `loadEmailSources` before any applicant transaction. Application mail is `en`/`fr`/`es` only. Member mail uses the acknowledgement catalog. Staff sign-in HTML is one English paragraph and is the wrong template to copy.

`rateLimit(scope, identifier, limit, seconds)` stores an HMAC of the identifier. Staff sign-in is 20 per IP and 5 per email per hour. Public forms run Turnstile, then parse, then rate limit. `verifyTurnstile` returns true when `TURNSTILE_SECRET_KEY` is unset. The widget renders nothing when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset. Do not change that config. Previews use Cloudflare's test keys as env values. There is no in-repo branch on those keys. `withinLimits` is not exported. A member action calls `rateLimit` with new scope strings.

`PostHogProvider` wraps every page. Capture waits for consent. `disable_session_recording` is true. `dropAdminEvents` drops `/admin` only. A member account page on a public path is captured after consent unless a new scrubber drops it. `scrubUrl` strips non-`utm_*` query parameters from absolute URLs, so a token in a query string is removed and a token in the path is not. Do not call `identify`.

`redeemSignInLink` spends the token on the first POST. Applicant resume links stay valid until expiry because mail scanners open them. A member link that is a GET has to survive a scanner. The staff confirm page is a POST on purpose.

A skipped send outside production returns `devLink`. A production skip does not. The uniform reply is "If this address can sign in, a link is on its way." Do not add `ADMIN_EMAILS` or new member env vars to `assertBackendConfig`.
