# Phase 2 design

Base is the Opus sketch at `/tmp/arena-admin-phase2/candidate-opus/`. The judge scored Opus 29 and Grok 25. I agree. The grant-typed writers and the English digest are the invariants a later change is most likely to skip.

## Grafts from the Grok sketch

- `planChange` counts enabled admins under a row lock and refuses a change that would leave zero. Self-targeting stays refused when another admin exists. The count is the rule. The self check is only the choice that an admin does not edit their own account.
- The `ADMIN_EMAILS` insert writes `staff.bootstrap` with a null actor in the same transaction. It still only inserts.

## Trims

- `activity.read` is admin only. Editors keep publish history on the copy desk. The activity page would otherwise show role changes and export filters to editors.
- Invite links stay at 15 minutes. `issueSignInLink` is unchanged. A failed mail is fixed by sending the invite again.
- Applicant detail is a read in the records module. It uses the safe column list plus `application_events`. It does not call `applicantDetail`. Date of birth is on the detail page and not in the CSV.
- `videoask_link`, `identity_link_opened_at`, and `identity_event_at` stay out of exports.
- Review actions are not in this phase.

## Kept from the base

- `admin_events` holds staff changes and CSV exports. Publishes stay in `copy_revisions`.
- `users.manage` and `records.export` are admin only. Lists use `dashboard.read`.
- Stale stays `translationState`. Bulk review posts the cells the editor saw, with the revision and an English digest.
- One column list per intake table. Screen columns are a subset. The query does not join documents, tokens, or jobs.
