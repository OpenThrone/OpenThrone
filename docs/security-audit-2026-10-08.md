# Exploit hardening review — 2026-10-08

Scope: Forgejo issues #15, #16 and #17; previously uncommitted fixes; follow-up review of adjacent authentication, authorization, economy and messaging paths. This records source/test verification, not an assertion that the application has no undiscovered vulnerabilities. No production database changes or cleanup were performed.

## Findings addressed

| Area | Server-side enforcement |
| --- | --- |
| Purchase and training gates (#15) | Fortification, structure, unit level, race and inventory checks occur with locked account reads; malformed quantities and unknown units are rejected. |
| Conversion and mercenary economy | Conversion uses price differences and bounded refunds; ordinary training/untraining/conversion cannot spend mercenary stacks; dismissal uses the discounted hire basis. |
| Battle upgrade inventory | Ownership key includes level; purchasing one tier preserves other tiers. The included migration must precede deployment of this code. |
| Concurrent gold and points | Locked account updates protect repairs, proficiency allocations, recruitment and purchases; bank operations share consistent lock order; cron payouts use relative increments and locked rereads. Wounded healing is enabled at 35% daily. |
| Login and 2FA | Server-controlled captcha policy, trusted peer IP resolution, password-gated status disclosure, bounded credentials/TOTP failures and TOTP replay prevention. Disabling 2FA requires fresh credentials. |
| Session restrictions | Both API guard families reject blocked accounts; only narrowly opted-in vacation/appeal paths accept relevant restrictions. Existing sockets revalidate identity and restrictions before packets. |
| Vacation | Locked state/quota checks, closure of null or future-dated vacation rows, and no ACTIVE override of a newer ban, suspension or closure. |
| Password/email recovery | Cryptographically random hashed tokens, expiry, account attempt budgets and atomic one-use consumption. Email-change requests belong to the session owner. SMTP certificate validation is enabled and debug output disabled. |
| Admin takeover and lockout | Staff rank checks, administrator/self targeting protections, revoked role/grant history retained, staff email takeover protection, impersonation restrictions at issue/redemption/guard, serializable last-administrator protection. |
| Auditing | Sensitive changes are audited transactionally or fail closed before disclosure/action; lower-risk actions use best-effort audit. Historical audit target filtering includes legacy JSON details. Chat and multi-account reads require audit success. |
| Battle intelligence | Shared ownership/direct/alliance ACL checks and server-side redaction on API and SSR paths; simulations are administrator-only. |
| Recruitment and social | Signed-in reward recipient, self-recruit rejection, locked per-pair and total limits, private relationship graphs, no hard-coded privileged user IDs for private stats, serialized gold-request cooldown. |
| Messaging | Membership required for history/live rooms; removal evicts all sessions. Room locks serialize sends and membership removal; replies/read receipts/reactions cannot reference inaccessible messages. |
| API abuse | Stable profile buckets prevent URL/query quota rotation; shared account-based mutation budget covers economy, repair, vacation and recruit rewards. Public lookups retain legitimate anonymous use with limits and bounded inputs. |
| Avatar storage | Server-generated content-based names and validated image extensions prevent client filename traversal. |

## Deployment and retained decisions

- Apply `prisma/migrations/20261008120000_battle_upgrade_unique_per_level/migration.sql` before serving the new battle-upgrade code; regenerate Prisma client through the normal deployment process.
- Previously issued plaintext email-change codes are rejected; users must request a fresh code.
- Proxy configuration must follow the trusted-proxy section of `docs/operations.md`, including stripping client-supplied Cloudflare headers when using a non-Cloudflare proxy.
- SENTRY upgrade progression (#18) is an overrestrictive availability bug, not a demonstrated gate bypass. Its game-design mapping remains deferred.
- Recruit-link owner rewards and new-player spy protection remain game-policy decisions. Current reward behavior is preserved with abuse limits.
- Cron endpoints require the scheduler secret; repeated authorized invocations still lack a period idempotency ledger. This is an operational retry concern, not an unauthenticated payout path.
- Historical production activity/rewards (#11) require separately reviewed remediation. This patch does not alter production records.

## Validation

Focused regression suites cover each newly demonstrated gap. Final aggregate test, type-check and lint results are recorded in the task handoff. PostgreSQL rate-limiter integration tests are opt-in and must use a disposable database; mock-based transaction tests establish application lock/check ordering but do not substitute for a deployment migration check.
