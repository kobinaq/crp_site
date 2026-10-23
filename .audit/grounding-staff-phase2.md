# Staff auth constraints for members and user management

Source: staff walkthrough, checked against `lib/staff/roles.ts`, `lib/staff/users.ts`, `lib/staff/auth.ts`, and `lib/db/schema.ts`.

`USER_ROLES` is `admin`, `editor`, `reviewer`. Capabilities are `dashboard.read`, `copy.edit`, `copy.publish`. `can` is false for any other role string. The comment in `roles.ts` says phase 2 adds `member` with none of those three. `users.role` is text with no check constraint.

`crp_staff` is httpOnly, SameSite lax, path `/admin`, 12 hours. The raw value is an opaque session id. The database stores `hashToken` (unsalted SHA-256), not an `APP_SECRET` signature. `readStaff` reloads `users.role` and `disabled_at` on every request. A role that fails `can(role, "dashboard.read")` is not staff, even if the hash is presented as `crp_staff`.

`resolveSignIn` inserts `role: "admin"` only for an email on `ADMIN_EMAILS`, and only when no row exists. It never promotes, demotes, or re-enables. An existing row without `dashboard.read` cannot sign in here. Do not send a member through `issueSignInLink` or `redeemSignInLink`. Those tables have no audience column. A member link posted to `/admin/confirm` would be spent and would create no session.

`user_sessions` is shared storage. A member reader that accepts any unexpired hash would accept a staff session. The member cookie needs its own name and a path that is not `/admin` and not `/`, so it is not sent to applicant routes or to `/admin`.

`staffSameOrigin` refuses a mutation when both `Sec-Fetch-Site` and `Origin` are missing. Page gates and action gates disagree today. `requireStaff` sends a weak role to `/admin?denied=1`. `assertStaffAction` sends both a missing session and a weak role to `/admin/sign-in`.

There is no staff management screen. Editor and reviewer are still a SQL update. Disable is `users.disabled_at`. Sign-out deletes only the presented session hash.
