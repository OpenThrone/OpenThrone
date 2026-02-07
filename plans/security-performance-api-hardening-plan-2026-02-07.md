# OpenThrone Security & Performance Hardening Plan

Date: 2026-02-07
Scope reviewed: `src/models`, `src/services`, `prisma/schema.prisma`, `src/utils`, `src/pages/api`
Runtime context: PM2 process `OTDev`, alpha environment `https://alpha.openthrone.dev`

## 1) Current-State Findings (from code audit)

### Critical
- Unauthenticated battle simulation endpoint allows arbitrary heavy payload processing via `POST /api/attack/test` (`src/pages/api/attack/test.ts`).
- Sensitive git metadata endpoint has no auth guard: `GET /api/general/git-info` (`src/pages/api/general/git-info.ts`).
- Static bypass credential exists for constants export: `xtoken === 'openthrone-gsheets'` in `src/pages/api/utilities/getConstants.ts`.
- Admin takeover password path bypasses user password in login flow (`src/pages/api/auth/[...nextauth].ts`, `src/services/Auth.service.ts`).

### High
- Auth pattern is inconsistent across API routes (mixed `withAuth`, `getSession`, `getServerSession`, ad hoc checks), increasing drift and bypass risk.
- API auth surface uses session cookies/JWT only; no first-class API token model for REST clients.
- Password/email reset codes are short plaintext verifier codes and are not consumed atomically after successful reset (`src/services/Auth.service.ts`, `src/services/Account.service.ts`).
- `src/utils/authorization.ts` uses `prisma` without import; indicates quality drift in auth helpers.
- `UserBattleUpgrade` has `@@unique([userId, type])` while code handles multiple levels (`src/services/Battle.service.ts`), indicating schema/logic mismatch.

### Medium
- Multiple endpoints return raw error messages/details to clients, increasing information leakage.
- Rate limiting exists but is in-memory and not uniformly applied; multi-instance PM2 scaling will bypass per-process limiter state.
- Combat/stat reads over JSON payloads in `attack_log.stats` create expensive scans for filtering/analytics.
- `updateUserUnits` deletes all units then recreates, amplifying write cost and lock contention during battles/spies.

## 2) Target Architecture

### Security baseline
- Standardized API entry stack: `withApiGuard({ authMode, rateLimitProfile, schema, csrf, scope })`.
- One auth system for APIs:
  - Browser: NextAuth session/JWT.
  - External REST clients: hashed API tokens + scoped permissions.
- Secrets: all long-lived secrets in env/secret manager, no static bypass constants.
- Auditability: every privileged write route emits structured `AuditLog` with actor, route, scope, and correlation ID.

### Performance baseline
- Hot combat/spy paths transaction-safe and contention-minimized.
- Structured and indexed fields for analytics/search (avoid repeated JSON-path scans).
- DB query shape budgets per endpoint (max query count + max p95 latency targets).

## 3) REST API + API Token Rollout Plan

## Phase 0: Freeze & inventory (1-2 days)
- Build endpoint inventory with auth mode and risk classification.
- Disable or restrict exposed diagnostic/test routes in production (`attack/test`, `general/git-info`, debug routes).
- Remove static token bypasses (`xtoken`) and replace with scoped service token check.

Deliverables
- `docs/api-surface-inventory.json`
- emergency patch PR for high-risk public endpoints

## Phase 1: API token domain model (2-3 days)
- Add Prisma models:
  - `ApiClient` (owner user/system, name, status, createdAt, lastUsedAt).
  - `ApiToken` (id, clientId, tokenPrefix, tokenHash[argon2id], scopes[], expiresAt, revokedAt, lastUsedAt, lastIpHash).
  - `ApiTokenAudit` (tokenId, action, route, method, statusCode, ipHash, uaHash, createdAt).
- Store only hash + short prefix; never store raw token after creation.
- Token format: `otk_<env>_<prefix>_<secret>`.
- Scope model examples: `battle:read`, `battle:write`, `spy:write`, `admin:read`, `cron:execute`.

Deliverables
- Prisma migration + seed for internal service tokens.
- Token issuance/revocation service with one-time display.

## Phase 2: Unified API guard (3-5 days)
- Implement `withApiGuard` middleware:
  - method allowlist enforcement
  - zod validation normalization
  - auth resolution: session OR bearer API token
  - scope enforcement
  - consistent 401/403/429/422/500 response shape
  - request ID + structured logging + audit hooks
- Move routes progressively by domain (account, battle, spy, admin, alliances, social).

Deliverables
- `src/middleware/apiGuard.ts`
- `src/types/api-auth.ts` actor typing (`session_user | api_client | service_token`)

## Phase 3: RESTful contract hardening (4-7 days)
- Normalize endpoint semantics:
  - Use resource-style URLs + method semantics.
  - Introduce API version prefix for token clients (`/api/v1/...`) while keeping compatibility wrappers.
- Introduce idempotency for mutation endpoints prone to retries (`attack`, `spy`, `bank transfer`, `alliance bank`).
- Add anti-replay nonce for high-risk token-auth endpoints.

Deliverables
- `/api/v1` routes for combat + account + alliances critical paths
- compatibility matrix doc

## Phase 4: Abuse prevention & transport controls (2-4 days)
- Replace process-local rate limiters with Redis-backed limiter for PM2 multi-process correctness.
- Add route-level limit profiles (auth, password reset, spy, attack, admin).
- Harden CORS policy and preflight handling by environment; block wildcard in production.
- Set strict security headers (CSP tuned for current app, HSTS, X-Content-Type-Options, Referrer-Policy).

Deliverables
- `src/middleware/rateLimitRedis.ts`
- per-route limiter config map

## Phase 5: Data/DB performance remediation (5-8 days)
- Combat tables:
  - add/verify indexes for frequent predicates (`attacker_id`, `defender_id`, `type`, `timestamp`).
  - add derived columns for frequently queried stats currently in JSON (e.g. `pillaged_gold`, `attacker_losses_total`, `defender_losses_total`).
- Unit write path:
  - replace delete+recreate with delta upserts by `(userId,type,level,isMercenary)`.
- Add pagination guards and max limits for list endpoints.

Deliverables
- Prisma migrations for indexes + derived columns
- Attack/Spy write path refactor PR

## Phase 6: Auth/account hardening (3-5 days)
- Remove `ADMIN_TAKE_OVER_PASSWORD` login bypass; replace with explicit admin impersonation flow + audit.
- Password reset:
  - use long random token (>=128 bits), store hash, TTL index semantics, single-use atomic consumption.
  - generic success response for reset-request to reduce account enumeration.
- 2FA enforcement controls for admin/moderator accounts.

Deliverables
- auth hardening PR + migration for reset token redesign

## 4) Endpoint Migration Priority

1. `admin/*`, `general/resetGame`, `cronJobs/*`, `battle/*`, `spy/*`
2. `bank/*`, `alliances/bank/*`, `social/friends/*/transfer`
3. account management and messaging
4. low-risk read APIs

## 5) Specific Code Corrections to Include Early
- Fix `src/utils/authorization.ts` missing `prisma` import and add unit tests.
- Remove raw `session` object echoes in error responses.
- Ensure all 405 responses include `Allow` header.
- Replace fragile `e instanceof prisma.PrismaClientKnownRequestError` with Prisma error class import in `src/services/Battle.service.ts`.
- Correct assassinate history check type mismatch in `src/services/AttackValidationService.ts` (`INTEL` vs assassination type policy).

## 6) Acceptance Criteria (Security)
- No unauthenticated debug/test/admin endpoints reachable in production.
- 100% mutation endpoints behind unified guard and scoped auth.
- API tokens can be issued, rotated, revoked, and scoped, with full audit trail.
- Replay/rate-limit controls active for attack/spy/bank/admin routes.
- Secret scanning + CI checks block hardcoded bypass tokens/secrets.

## 7) Acceptance Criteria (Performance)
- p95 API latency on battle/spy write endpoints reduced by >=25% under load test baseline.
- DB query count per attack/spy request reduced and documented.
- No full-table scans for top 10 hot endpoints in query plan review.
- PM2 multi-instance rate limit behavior is consistent.

## 8) Execution Tracker
- [x] Phase 0 complete
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Phase 4 complete
- [x] Phase 5 complete
- [x] Phase 6 complete

## 9) Completion Note (2026-02-07)
- Hardening plan marked complete.
- Redis-backed rate limit storage was intentionally deferred by product decision and moved to:
  - `docs/redis-rate-limit-implementation-plan-2026-02-07.md`
- Current limiter remains in-memory until Redis follow-up is executed.
