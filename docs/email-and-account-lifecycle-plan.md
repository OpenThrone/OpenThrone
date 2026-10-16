# Email broadcast, inactivity lifecycle and identity retention — plan

Recorded 2026-10-11. Implementation lands uncommitted on `attack-revert` alongside the in-progress era-reset work.

## Decisions (owner-approved 2026-10-11)

- **Pseudonyms:** forgotten/expired accounts are renamed to random `Adjective_Noun_12345` names (unique, collision-retried). The original display name is reserved by keyed hash so nobody can re-register it.
- **Email-hash retention:** only sanctioned accounts (active BANNED/SUSPENDED at ban or deletion time) keep a keyed email hash as a re-registration block — permanent for permanent bans, until `end_date` for timed sanctions. Clean deletions keep a hash for 30 days (anti-churn), then it is purged. Bans write the hash at ban time, not only on deletion.
- **Inactivity expiry:** same as forget-me — scrub PII, rename to pseudonym, mark CLOSED. The `users` row and all game history remain so foreign keys never break. Logging in during the grace period cancels the deletion.

## Current state (verified)

- Email: nodemailer SMTP duplicated in `Auth.service.ts` and `Account.service.ts`; synchronous sends inside requests; English-only inline bodies; no queue, unsubscribe, bounce handling or registration email verification.
- Deletion: `AccountService.forgetAccount` pseudonymizes as `deleted-user-<id>` and stores a SHA-256 email hash for 365 days for **every** user. `getAntiAbuseHash` falls back to a hard-coded salt when `ANTI_ABUSE_SALT` is unset and does not normalize addresses.
- Bans: `AccountStatusHistory` rows only; `account-action.ts` does not record an email hash, so banned players can re-register with a new address. Banned users keep plaintext email in `users` (needed for appeals; acceptable).
- `AntiAbuseShadow` is shared with request idempotency keys.
- News: `blog_posts` (`kind` NEWS/BLOG/CHANGELOG) managed in `/home/admin/content`. In-game mass messaging exists at `/home/admin/mass-messaging`.
- No notification preferences, privacy policy or terms pages.

## Workstreams

### 1. Foundation (schema + shared utilities)

- `EmailPreference` (per user): `newsEmails`, `announcementEmails`, `accountEmails` (transactional security mail always sends), `unsubscribedAllAt`.
- `EmailOutbox`: queued messages (category, recipient user, locale, subject/body snapshot, status, attempts, nextAttemptAt, sentAt, lastError, campaignId) processed by a worker with `FOR UPDATE SKIP LOCKED`.
- `EmailCampaign`: admin broadcast/news/inactivity send records (audience filter, counts, createdBy, status) for history and audit.
- `EmailSuppression`: keyed hash of addresses that hard-bounced, complained or unsubscribed globally.
- `AccountInactivityNotice`: per user `warnedAt`, `reminderAt`, `scheduledDeletionAt`, `cancelledAt`, `completedAt`.
- `IdentityBlock` (separate from `AntiAbuseShadow` idempotency use): `kind` EMAIL/DISPLAY_NAME, keyed `hash`, `reason`, `sourceUserId`, `expiresAt` (null = permanent).
- Utilities: HMAC-SHA256 hashing with a required server secret (`IDENTITY_HASH_SECRET`, falling back to `ANTI_ABUSE_SALT`; refuse to run in production without one), email normalization (lowercase, trim, strip `+tag`, ignore dots for gmail/googlemail); pseudonym generator; signed unsubscribe tokens (HMAC, user + category, no expiry, rotatable).

### 2. Email delivery infrastructure

- One `Email.service.ts` owning the transport; Auth/Account services reuse it.
- Outbox enqueue API; worker in `src/server/` started by the custom server (pattern: `eraResetWorker`) plus a standalone script; throttle (configurable per-minute rate via runtime settings), retries with backoff, permanent-failure marking.
- Every non-transactional email: `List-Unsubscribe` (https + mailto) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058, required by Gmail/Yahoo for bulk senders), footer with manage-preferences link and operator name.
- Localized templates (en/es/de) with plain-text + simple HTML layout.
- Public `/email/unsubscribe` page and one-click POST endpoint that need no login.
- Settings page section "Email notifications" with toggles.
- Recipient filter: skip suppressed hashes, closed/anonymized accounts (`@deleted.local`), banned users for marketing categories, users who opted out.

### 3. Identity retention and anti-evasion

- Shared `AccountAnonymization.service.ts` used by forget-me, admin close and inactivity expiry: scrub email/password/2FA/bio/avatar, assign pseudonym, revoke sessions/API tokens/password resets, close status, write `IdentityBlock` entries per the retention policy, write audit log.
- Bans/suspensions in `account-action.ts` record the email `IdentityBlock` (expiry = sanction end); lifting a ban removes it.
- Registration and email change check `IdentityBlock` for both email and display name; generic error message (no ban disclosure).
- Daily cleanup purges expired blocks; migrate existing `AntiAbuseShadow` deletion rows into `IdentityBlock` where possible.

### 4. Admin features

- **Email broadcast:** extend `/home/admin/mass-messaging` with channel selection (in-game, email, both); audience: all, specific users, active within N days; preview and "send test to me"; recipient count before confirm; queued through outbox; campaign history with sent/failed/skipped counts. Permission: `SEND_MASS_MESSAGES`; email to all or active-within-N-days audiences requires ADMINISTRATOR; explicit user-ID audiences retain the broadcast permission requirement. Confirmed sends carry a client UUID idempotency key, rejected on reuse for 10 minutes.
- **Inactive users:** new `/home/admin/inactive-users` listing users whose `last_active` is older than 365 days (excluding staff, already-closed and anonymized), with last-active date, notice status, scheduled deletion date; bulk/individual "send inactivity notice"; the email states the account waits 180 days, logging in keeps it, and links to the right-to-be-forgotten page. Optional reminder 30 days before deletion. Daily sweep anonymizes accounts whose deletion date passed without a login, behind a runtime setting (off by default, with dry-run counts in the UI).
- **Inactivity safety:** Only deliverable, enqueued notice recipients receive a deadline; undeliverable users are reported without creating a notice. Process candidates in ascending ID order, in transactions of at most 250 users, keeping one campaign DRAFT until every chunk is enqueued. When `account.inactivity.remindersEnabled` is enabled, deletion requires an enqueued reminder at least seven days old; send a missing due reminder and defer deletion. When reminders are disabled, anonymize on the initial 180-day deadline (subject to the auto-anonymize gate).
- **News email:** "Also send by email" option when publishing a NEWS post in `/home/admin/content`; ADMINISTRATOR only, with eligible NEWS recipient count in a confirmation modal; only to users with `newsEmails` enabled; idempotent per post (no double-send on re-publish).
- All actions audit-logged with `logActionStrict`.

### 5. Additions beyond the original request

- Right-to-be-forgotten link target: a public `/account/delete-request` page (login, then the existing settings forget flow) so links in inactivity mail work.
- Self-service data export (JSON) in settings, reusing the admin export shape minus staff-only fields.
- Email verification at registration and before bulk mail eligibility (unverified addresses only receive transactional mail). *Deferred to a follow-up issue; tracked here.*
- Bounce/complaint ingestion (SMTP provider webhook or mailbox) into `EmailSuppression`. *Deferred; suppression table and manual admin entry ship now.*
- Privacy policy and terms pages describing retention (pseudonymization, hash retention periods, inactivity timeline) and registration consent. *Content requires owner/legal review; deferred.*
- Mail volume and failure counters on the admin overview.

## Rollout

1. Apply migration; set `IDENTITY_HASH_SECRET` in each environment before enabling.
2. Enable outbox worker; send test campaign to staff.
3. Enable inactivity notices; run sweep in dry-run for at least one cycle before enabling deletions.
