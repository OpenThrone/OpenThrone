# Privacy self-service: data export and account erasure

Operational notes for issue #14 (owner decision 2026-10-30). This file
describes what the code does; it is not policy text. Legal copy under
`/legal/*` stays with counsel. The same process applies to every player,
wherever they live; there is no region check anywhere.

## Data export (`POST /api/account/export`)

Settings > Your data > Download my data. Needs the password (and an
authenticator code when 2FA is on), allows one download per rolling 24 hours
(`AccountDataExport` log, no content), is audited (`ACCOUNT_DATA_EXPORT`),
and is generated and written in pages by `AccountDataExport.service.ts`.
Banned and suspended players keep access; impersonated sessions are refused.

Included (see `EXPORT_INCLUDED`, also written into the file header): account
and profile, kingdom state, units, items, upgrades, bonus points, eras, status
history (staff-written reasons left out), reset history, battle and spy logs
(viewer-side redaction shared with the in-game reports, opponent names as
shown in game), captives, desertions, forces, messages and chat messages the
player wrote, friends, alliance membership/requests/bank activity/gold
requests/loans, recruit history (only the player's own address), reports the
player filed, own ban appeals, email preferences, Discord link, supporter
membership, payments and consents, gifts bought, sign-in history, and the
newest 5000 activity-log entries, plus the player's own alliance announcements and list, target-call and intel-share notes.

Excluded (see `EXPORT_EXCLUDED`): password hash, 2FA secret, sessions and API
tokens, moderation file, fair-play signals, staff notes and assignments,
reports against the player, messages other players wrote, other players'
private data, card data (never stored), email delivery queue, rate-limit
counters. Battle logs are only kept for 20 days by the daily cleanup, so the
export only contains what still exists. The per-era totals kept from those logs
are included as `eraActivity`.

## Erasure (`/api/account/erasure`, `/account/confirm-erasure`)

request (password + 2FA) -> email link -> confirm page (button press) ->
account deactivated (CLOSED status row, API clients disabled, subscription
renewal stopped) -> 14 days (`ERASURE_GRACE_DAYS`) -> daily job
(`processDueErasures`) runs `AccountAnonymizationService.anonymizeAccount`.
Signing in during the grace period offers "Cancel deletion". Cancelling removes the grace-period CLOSED row, so any ban, suspension, vacation or closure written before it is the latest status again. Discord alerts and attack emails are not queued or delivered while the account is closed; the Discord link and preferences stay. Staff-opened requests also stop subscription renewal. The export pages every history table by id cursor and stops generating when the client disconnects. Unconfirmed
links lapse after 24 hours. Staff accounts are refused (an administrator
closes them). Admins (administrators only) can open a request for a player who
cannot sign in, cancel, or erase early; each needs a written reason and is
audited. Finished request rows keep no free text (reasons live in the audit log) and are pruned after 365 days, export-log rows after
90 (constants in `PrivacyRetention.service.ts`).

### From an inactivity email (no sign-in)

Inactivity and relaunch emails link to `/account/confirm-erasure?notice=<token>`
instead of the sign-in page. The token is an HMAC (same secret as unsubscribe
links, its own prefix) over the user id and the notice's `warnedAt`
(`src/utils/inactivityErasureToken.ts`). Opening the page changes nothing;
pressing Confirm runs `confirmInactivityErasure`, which starts the same grace
period as above (audit `ACCOUNT_ERASURE_CONFIRMED` with `via:
INACTIVITY_NOTICE`), replaces a request still awaiting its emailed
confirmation, and cancels the notice. The link works only while that exact
notice is open, so it dies once used, once the player signs in (which cancels
the notice), or once the sweep erases the account. Staff accounts are refused.
Self-service erasure keeps no veteran record, so a player who uses it gets no
Era 1 Tester claim later.

## Table-by-table inventory

| Data | Result |
| --- | --- |
| users: email, display name, password, 2FA secret, avatar, bio, recruit link | erased/replaced (existing scrub) |
| users: game state, last_active, timestamps | retained, no direct identifier left (rankings, era history) |
| PasswordReset, EmailPreference, DiscordLink/Code/Outbox | deleted |
| EmailOutbox | address, subject and body blanked |
| messages authored, ChatMessage authored | text erased, rows stay |
| messages received from others | retained (the sender's record) |
| LoginEvent | deleted |
| AuditLog (own rows) | IP, IP hash, request id blanked; action rows stay |
| recruit_history (player was recruited) | IP blanked; recruiter rows keep the recruit's IP |
| social | deleted |
| post_read_status, AutoRecruitSession, ChatRoomParticipant/Reaction/ReadStatus, ChatMute | deleted |
| ApiClient / ApiToken / ApiTokenAudit | disabled/revoked, name and hashes cleared |
| AccountDataExport | deleted |
| CheatSignal, ModeratorNote, BanAppeal text, closed Report text filed by the player | deleted, unless a ban/suspension is running: kept until its email-hash block expires, then removed by the daily purge (a permanent ban keeps them) |
| ActivityDay (bot-timing counters) | deleted; links to the player in other accounts' signals (`linkedUserIds`) are removed with the moderation file |
| Report against the player | retained (the reporter's filing) |
| attack_log and ACL | retained, shown under the pseudonym |
| AccountStatusHistory, AccountResetHistory | retained (no free text from the player is copied in) |
| alliance memberships | removed at erasure (#318): the account leaves every alliance — a leader is succeeded by the highest-ranked, longest-standing member and a last remaining leader dissolves the alliance through the regular disband path; borrowed forces return to the reserve; outstanding loans are collected from gold/bank but never forgiven, so the debt record stays with the pseudonymous account |
| alliance announcements, bank history, loans, gold requests, list/target/intel entries | retained under the pseudonym (roster and ledger integrity); the player's OWN free text is blanked (bank `notes`, gold-request and loan `reason`, list/target-call/intel-share `note`); notes other members wrote about the player stay; announcements stay (owner decision) |
| captives, desertions, forces, units, items, upgrades, eras | retained, game data |
| Payment, PaymentRefund, PurchaseConsent, GiftCode, SupporterMembership | retained (accounting/legal); billing cancelled |
| IdentityBlock | retained as hashes, 30-day cooldown or sanction length; display name reserved |
| AccountInactivityNotice | retained (dates only) |
| AccountErasureRequest | retained as completion proof, no free text |
| Stripe customer record, backups, Discord | outside this code: processor deletion and backup expiry are operational steps |

## Erased-account marker and reserved addresses

Erased accounts are identified by `users.anonymizedAt`, which only the
anonymizer sets. The daily moderation purge, the already-erased checks and the
erasure service use it, never an email suffix: admin reset accounts
(`{id}-reset@deleted.local`) are not erased accounts, and players cannot
register or change to any `@deleted.local` address. Accounts erased before the
marker existed carry the exact address the scrub writes
(`{id}-deleted@deleted.local`); the migration that added the column marks them
(time of their `ACCOUNT_ANONYMIZED` audit row, else the migration time), so the
purge treats them like any other erased account. There is no email-based
fallback.

## Billing

Confirming (or staff opening) records `billingStopped` on the request, inside
the same transaction, only when the subscription was still renewing, and then
stops renewal at period end. Because the flag is stored first, a provider
failure or the daily billing sweep stopping renewal still resumes on cancel. Cancelling resumes renewal through the provider when the paid period
is still running; a lapsed subscription is not revived and the player
subscribes again. A subscription the player had already set to end is left as
it was.
