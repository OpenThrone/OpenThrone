# API contract

The documented contract for existing and future endpoints under `src/pages/api`
(issue #20, part 2 of 3). This describes what handlers **actually do today**
(cited), names the target conventions, and flags divergences honestly. Route
inventory and per-route auth classification live in
[api-route-classification.md](./api-route-classification.md); v1 path aliases
live in [api-v1-compat-matrix.md](./api-v1-compat-matrix.md).

Two middleware wrappers dominate the surface (76 files each, 22 files use
neither — see the classification counting method):

- [`withApiGuard`](../src/middleware/apiGuard.ts) — the newer, richer guard
  (admin/permission elevation, API tokens, zod query/body schemas, rate-limit
  profiles).
- [`withAuth`](../src/middleware/auth.ts) — the legacy session wrapper
  (anonymous override, vacation allowance, `game_write` rate profile).

Anything extracted to Workers must preserve this contract byte-for-byte:
**same URLs, methods, status codes, response bodies (field order irrelevant),
error messages, and side effects.**

---

## 1. Authentication modes

### 1.1 NextAuth session (the default)

Both wrappers resolve the session the same way —
`getServerSession(req, res, authOptions)` at
[apiGuard.ts:144](../src/middleware/apiGuard.ts) and
[auth.ts:34-38](../src/middleware/auth.ts). The session is then attached to the
request as `req.session` ([apiGuard.ts:145](../src/middleware/apiGuard.ts),
[auth.ts:104](../src/middleware/auth.ts)); handlers read
`req.session.user.id`. The shared request type is `AuthenticatedRequest`
([src/types/api.d.ts](../src/types/api.d.ts)).

Divergence in ID handling: `withAuth` **normalizes and validates** the session
user id once — `Number(...)`, rejecting non-safe-integer/non-positive ids with
401 ([auth.ts:73-77](../src/middleware/auth.ts)) — while `withApiGuard`
handlers each coerce per-use (`Number(req.session?.user?.id)`, e.g.
[attack/[id].ts:38-41](../src/pages/api/attack/[id].ts)). Same wire behavior for
healthy sessions; the legacy wrapper is stricter about malformed ones.

### 1.2 Bearer API token (scoped)

Exactly **one** route accepts Bearer tokens today:
`GET /api/utilities/getConstants` via
[getConstants.ts:20-25](../src/pages/api/utilities/getConstants.ts)
(`authMode: 'optional'`, `allowApiToken: true`, `requiredScopes:
['constants:read']`).

Mechanics, all in the guard ([apiGuard.ts:169-198](../src/middleware/apiGuard.ts)):

- Tokens are only consulted when there is **no session**; a session always
  wins.
- `ApiTokenService.verifyToken` checks revocation, expiry, a peppered password
  hash, and that every required scope is present; each outcome writes an audit
  row and returns 401 (`token_revoked` / `token_expired` / `token_invalid`) or
  403 (`insufficient_scope`) — see
  [ApiToken.service.ts:140-168](../src/services/ApiToken.service.ts).
- On success the guard maps the caller to actor `{ type: 'api_client' |
  'service_token', clientId, tokenId, scopes }`
  ([apiGuard.ts:190-197](../src/middleware/apiGuard.ts)); successful
  verification also updates `lastUsedAt`/`lastIpHash` in a transaction
  ([ApiToken.service.ts:170-201](../src/services/ApiToken.service.ts)).
- Token verification failure is surfaced as `{ message: 'Forbidden' }` for
  403 reasons and `{ message: 'Unauthorized' }` otherwise
  ([apiGuard.ts:183-188](../src/middleware/apiGuard.ts)) — note the key is
  `message`, not `error` (§4).

### 1.3 Admin and permission (staff elevation)

`withApiGuard` options, not `withAuth`:

- `authMode: 'admin'` — requires a session and `isAdmin(userId)`
  ([apiGuard.ts:248-259](../src/middleware/apiGuard.ts)); 401 without a
  session, 403 for a non-admin.
- `authMode: 'permission'` and/or `requiredAnyPermissions` /
  `requiredAllPermissions` — staff permission checks via
  `hasAnyPermission`/`hasAllPermissions`
  ([apiGuard.ts:260-287](../src/middleware/apiGuard.ts)).
- **Impersonated sessions never elevate**: an impersonation session on an
  admin/permission route (or one with permission requirements attached) gets
  403 before any check runs ([apiGuard.ts:152-160](../src/middleware/apiGuard.ts)).
- **Restricted accounts never act with staff privileges**: a BANNED/SUSPENDED
  session admitted via `allowRestrictedAccount` is still refused staff routes
  with 401 ([apiGuard.ts:238-246](../src/middleware/apiGuard.ts)).

Example: `POST /api/admin/grantPermission` uses
`authMode: 'admin'` + `rateLimitProfile: 'admin'` + a zod body schema
([grantPermission.ts:18-23](../src/pages/api/admin/grantPermission.ts)).

### 1.4 Task secret (machine cron)

`/api/cronJobs/*` handlers authenticate the `Authorization` header against
`TASK_SECRET` with `timingSafeEqual`, gated additionally by a feature flag
(`DO_DAILY_UPDATES === 'true'`); failure is 401
`{ message: 'Unauthorized or Disabled Task' }`
([daily.ts:15-38](../src/pages/api/cronJobs/daily.ts)). On Workers these are
driven by the `worker.ts` `scheduled()` fan-out, which supplies the secret
(see [scheduled-jobs.md](./scheduled-jobs.md)). The guard itself is configured
`authMode: 'none'` there — the secret check is in-handler.
`/api/general/resetGame` uses the same raw `TASK_SECRET` pattern
([resetGame.ts](../src/pages/api/general/resetGame.ts)), and
`/api/general/revalidate` checks `REVALIDATION_SECRET`
([revalidate.ts](../src/pages/api/general/revalidate.ts)).

### 1.5 Account-status gating (applies to every session mode)

Both wrappers block sessions whose account status is not allowed:

- Guard: 401 unless the route opted into `allowRestrictedAccount`, in which
  case BANNED/SUSPENDED sessions pass and the handler receives
  `context.accountRestriction` to limit them to their own data
  ([apiGuard.ts:224-246](../src/middleware/apiGuard.ts); the appeals route is
  the deliberate user — [appeals/index.ts:66-67](../src/pages/api/appeals/index.ts)).
- `withAuth`: 401 unless `allowVacation` and the blocking status is VACATION
  ([auth.ts:78-87](../src/middleware/auth.ts)).

---

## 2. Authorization patterns

1. **Route-level mode** (guard `authMode`/permission options) decides *who may
   call* — see §1. Nothing in-handler should re-implement role checks.
2. **Object-level ownership** is in-handler: handlers compare
   `req.session.user.id` against path/query ids and return 403/404 (e.g.
   alliance bank history membership checks) or scope the Prisma `where` to the
   caller (bank history — [history.ts:183-185](../src/pages/api/bank/history.ts)).
3. **Staff-target protection**: admin routes re-check
   `checkStaffTargetAction` inside the write transaction so a demotion between
   read and write cannot be raced
   ([grantPermission.ts:47-57](../src/pages/api/admin/grantPermission.ts) and
   again at [83-90](../src/pages/api/admin/grantPermission.ts)).
4. **401 vs 403 convention**: 401 = not authenticated (no session, malformed
   id, restricted account, bad/expired token, wrong task secret); 403 =
   authenticated but not permitted (non-admin on admin route, missing
   permission, impersonation elevation, insufficient scope). Both wrappers
   follow this consistently.

---

## 3. Request validation conventions (as practiced)

**Common to everything**: validation is [zod](https://zod.dev) `safeParse`,
and failures return the flattened `fieldErrors` under a `details` key. Domain
validation (amounts, capacities) lives in services, not routes.

Three practiced variants:

1. **Guard-declared schemas (target)** — `querySchema`/`bodySchema` guard
   options are `safeParse`d before the handler runs; failure is **422**
   `{ message: 'Invalid query parameters' | 'Invalid request body', details }`
   ([apiGuard.ts:296-313](../src/middleware/apiGuard.ts)). Body schemas are
   only evaluated for POST/PUT/PATCH
   ([apiGuard.ts:304-307](../src/middleware/apiGuard.ts)); parsed values are
   handed to the handler via `context.query`/`context.body`
   ([apiGuard.ts:315-325](../src/middleware/apiGuard.ts)).
2. **In-handler schemas on `withAuth` routes (legacy, divergent)** — e.g.
   bank history returns **400** `{ error: 'Invalid query parameters', details }`
   ([history.ts:34-40](../src/pages/api/bank/history.ts)) and messaging POST
   returns 400 `{ message: 'Invalid request body', details }`
   ([messages/index.ts:41-47](../src/pages/api/messages/index.ts)). Same zod
   machinery, but status 400 (not 422) and inconsistent error key.
3. **Service-level schemas (domain validation)** — e.g. bank amounts are
   coerced with `parseBigInt` and validated `z.bigint().positive()` inside
   `Bank.service.ts` ([Bank.service.ts:24-32](../src/services/Bank.service.ts)),
   throwing domain errors that routes map to 400
   ([deposit.ts:38-40](../src/pages/api/bank/deposit.ts)).

**Target for new endpoints**: variant 1 (guard options, 422, `message`+`details`).
Do not "fix" legacy variants opportunistically — that is a wire-format change
and must be its own decision.

BigInt inputs cross the wire as strings (`"123n"` or `"1,234"`); the shared
coercion helpers are `parseBigInt`/`stringifyObj` in
[src/utils/jsonHelpers.ts](../src/utils/jsonHelpers.ts) (re-exported as
`stringifyObj` from [src/utils/numberFormatting.ts:82](../src/utils/numberFormatting.ts)).

---

## 4. Error response shape

### 4.1 Target (canonical) shape

The guard's shape is the canonical one for new endpoints:

```jsonc
// plain rejection
{ "message": "Unauthorized" }                    // 401
{ "message": "Forbidden" }                       // 403
{ "message": "Method not allowed" }              // 405 (+ Allow header)
{ "message": "Too many requests" }               // 429
// validation
{ "message": "Invalid request body", "details": { "amount": ["..."] } }  // 422
// runtime blocks
{ "message": "<reason>", "code": "FEATURE_DISABLED" | "MAINTENANCE" | "CONFIG_UNAVAILABLE" }  // 503
// unhandled handler throw (caught by the guard)
{ "message": "Internal server error", "requestId": "<uuid>" }            // 500
```

Sources: [apiGuard.ts:129-132](../src/middleware/apiGuard.ts) (405),
[134-142](../src/middleware/apiGuard.ts) (429),
[200-222](../src/middleware/apiGuard.ts) (503 codes; `Retry-After: 5` on
maintenance), [296-313](../src/middleware/apiGuard.ts) (422),
[326-337](../src/middleware/apiGuard.ts) (500 + `requestId`).

### 4.2 Legacy handler shapes (documented divergences)

Handlers predate the guard shape and use three families, sometimes mixed
within one file (counts from `grep "json({ error|message|status"` over
`src/pages/api`, 2026-10-14: `{ error: ... }` ×374, `{ message: ... }` ×72,
`{ status: ... }` ×33):

| Family | Example | Where |
| --- | --- | --- |
| `{ error: string }` | `{ error: 'User not found' }` 404; `{ error: error.message }` 400 | bank reads [getDeposits.ts:20,44](../src/pages/api/bank/getDeposits.ts), [history.ts:210](../src/pages/api/bank/history.ts) |
| `{ message, data }` success + `{ error }` failure | bank deposit/withdraw | [deposit.ts:35-40](../src/pages/api/bank/deposit.ts) |
| `{ status: 'failed', message }` / `{ status: bool, error }` | attack 400/500, admin grant | [attack/[id].ts:34-36,83-87](../src/pages/api/attack/[id].ts), [grantPermission.ts:117-121](../src/pages/api/admin/grantPermission.ts) |
| `{ error, code }` vs `{ message, code }` **inside one wrapper** | `withAuth` uses `message` for FEATURE_DISABLED but `error` for MAINTENANCE/CONFIG_UNAVAILABLE | [auth.ts:45](../src/middleware/auth.ts) vs [auth.ts:55,58-61](../src/middleware/auth.ts) |
| `{ error, message }` together | idempotency replay 409 | [idempotency.ts:57-61](../src/middleware/idempotency.ts) |

**Extraction rule**: a handler's existing error shape is part of its contract.
Preserve it verbatim; the canonical shape applies to *new* endpoints only.
The bank slice (§7) keeps `{ error }`/`{ message, data }` exactly for this
reason.

### 4.3 Success shapes

No single convention; each endpoint's body is its own contract. Recurring
patterns: bare domain object or array (`messages` GET returns rooms directly,
[messages/index.ts:33](../src/pages/api/messages/index.ts)); `{ message, data }`
(bank writes, [deposit.ts:37](../src/pages/api/bank/deposit.ts));
`{ status: '<text>' }` (admin grant, [grantPermission.ts:79,114](../src/pages/api/admin/grantPermission.ts));
paginated `{ rows, total, totalPages, currentPage, limit }`
([history.ts:202-208](../src/pages/api/bank/history.ts)). BigInt-bearing
payloads are stringified with `stringifyObj` (BigInt → `"123n"`, Date → ISO)
before `res.json`.

---

## 5. HTTP status conventions

Observed usage across `src/pages/api` (grep of `res.status(N)`, 2026-10-14):
200 ×173, 201 ×12, 400 ×165, 401 ×104, 403 ×23, 404 ×24, 405 ×81, 409 ×6,
422 ×3, 429 ×2, 500 ×96, 503 ×7; five `res.json(...)` calls without an explicit
status (implicit 200).

Rules as practiced:

- **405**: guard sets `Allow` and returns `{ message: 'Method not allowed' }`
  ([apiGuard.ts:129-132](../src/middleware/apiGuard.ts)); `withAuth` routes
  hand-roll it — bank history ends the response with **no body**
  ([history.ts:30-32](../src/pages/api/bank/history.ts)), messaging likewise
  ([messages/index.ts:115](../src/pages/api/messages/index.ts)).
- **400 vs 422**: in-handler legacy validation uses 400 (§3); guard validation
  uses 422. Domain rule violations from services also surface as 400
  (bank: [deposit.ts:39](../src/pages/api/bank/deposit.ts)).
- **409**: conflict/replay — idempotency duplicates
  ([idempotency.ts:57-61](../src/middleware/idempotency.ts)), chat-room
  conflicts ([messages/index.ts:105-110](../src/pages/api/messages/index.ts)).
- **201 vs 200**: creation vs re-use of a resource
  ([messages/index.ts:98](../src/pages/api/messages/index.ts)).
- **429**: rate limit (§6). Bodies differ by wrapper (`message` in the guard,
  `error` in `withAuth`, [auth.ts:101](../src/middleware/auth.ts)).
- **500**: reserved for unexpected throws; the guard logs with `requestId` and
  returns `{ message: 'Internal server error', requestId }`
  ([apiGuard.ts:327-337](../src/middleware/apiGuard.ts)); legacy handlers
  return assorted shapes (§4.2).
- **503**: feature flag / maintenance / config-store unavailability, always
  with a `code` (§4.1) and `Retry-After: 5` for maintenance
  ([apiGuard.ts:211-216](../src/middleware/apiGuard.ts)).

---

## 6. Rate limiting

Profiles are declared per route; the limiter is Postgres-backed (fixed window
over the current + previous bucket, consumed atomically via
`INSERT ... ON CONFLICT` — [postgres-rate-limiter.ts:31-40](../src/lib/postgres-rate-limiter.ts)).

Guard profiles ([apiGuard.ts:28-46](../src/middleware/apiGuard.ts)), keyed
`${profile}:${clientIp}`:

| Profile | Window | Max | Key |
| --- | --- | --- | --- |
| `auth` | 60 s | 12 | ip |
| `password_reset` | 60 s | 6 | ip |
| `attack` | 60 s | 20 | ip |
| `spy` | 60 s | 20 | ip |
| `bank` | 60 s | 15 | ip |
| `admin` | 60 s | 30 | ip |

`withAuth` has one profile, `game_write`: 30/60 s keyed by **user id** when
signed in (URL hopping cannot reset it) else ip
([auth.ts:91-102](../src/middleware/auth.ts)).

Client IP resolution is shared (`resolveClientIp`,
[src/utils/ipUtils.ts:131](../src/utils/ipUtils.ts)). On 429 the guard returns
`{ message: 'Too many requests' }` ([apiGuard.ts:139-141](../src/middleware/apiGuard.ts)).

**Idempotency (economy mutations)**: bank deposit/withdraw, attack, spy and
friend transfer additionally require an `Idempotency-Key` header
(`enforceIdempotency`, [idempotency.ts:24-67](../src/middleware/idempotency.ts)):
missing key → 400 `{ error: 'Missing Idempotency-Key header' }`; replay within
the 120 s TTL → 409 `{ error: 'Duplicate request', message: 'This idempotency
key has already been used for this action' }` (detected by a unique-hash insert
into `anti_abuse_shadow`, [idempotency.ts:37-49](../src/middleware/idempotency.ts)).

---

## 7. Versioning (`/api/v1`)

`/api/v1/*` are **pure delegation wrappers** re-exporting the legacy handler —
zero logic of their own ([v1/bank/deposit.ts](../src/pages/api/v1/bank/deposit.ts)).
A versioned path grants nothing: auth, validation and response behavior are
inherited from the target handler
([api-v1-compat-matrix.md](./api-v1-compat-matrix.md)). Eight wrappers exist
today (attack, spy, bank ×2, alliances/bank ×2, account reset/verify); no
in-app consumer references `/api/v1` (classification, "Client usage").

Rules for extraction: keep both paths serving the same handler; never let a
v1 wrapper and its legacy target diverge; retiring a wrapper is a deliberate,
announced contract change, not a refactor side effect.

---

## 8. Telemetry and logging

- **Logger** ([src/utils/logger.ts](../src/utils/logger.ts)): levels
  ERROR/WARN/INFO/DEBUG/TRACE gated by `LOG_LEVEL` (server) /
  `NEXT_PUBLIC_LOG_LEVEL` (client) ([logger.ts:22-28](../src/utils/logger.ts));
  `logError`/`logWarn`/`logInfo`/`logDebug` ([logger.ts:123-140](../src/utils/logger.ts)).
  Handlers log failures with context objects (`logError('Error getting user
  chat rooms', { userId, error })`,
  [messages/index.ts:35](../src/pages/api/messages/index.ts)); noisy
  request-path logging is `logDebug`
  ([attack/[id].ts:43-45](../src/pages/api/attack/[id].ts)). Tests/CLIs can
  capture entries with `captureLogs` ([logger.ts:173](../src/utils/logger.ts)).
- **Request id**: the guard echoes an incoming `x-request-id` or mints a
  `randomUUID`, sets the `X-Request-Id` response header, and includes it in
  500 bodies and error logs ([apiGuard.ts:116-118](../src/middleware/apiGuard.ts),
  [327-336](../src/middleware/apiGuard.ts)). `withAuth` has no request-id
  machinery.
- **Security headers** (guard only): `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, plus HSTS in
  production ([apiGuard.ts:119-127](../src/middleware/apiGuard.ts)).
- **Audit log**: staff and economy-relevant actions go through
  `logAction`/`logActionStrict` with actor id, action tag, ip and details,
  optionally inside the same transaction as the write
  ([src/utils/auditLogger.ts:12,49](../src/utils/auditLogger.ts); attack audit
  at [attack/[id].ts:72-73](../src/pages/api/attack/[id].ts); transactional
  audit at [grantPermission.ts:83-112](../src/pages/api/admin/grantPermission.ts)).
- **Realtime emissions**: side effects of some mutations go through the lazy
  realtime facade (`emitToUser` etc., [src/lib/realtime.ts](../src/lib/realtime.ts));
  on Workers with sockets disabled the facade is a no-op but the calls must be
  preserved. Bank deposit/withdraw have **no** realtime emission today —
  their only side effects are the balance update and the `bank_history` row.

---

## 9. The vertical-slice pattern (bank, issue #20 part 3)

Target shape for every extracted domain, demonstrated by the bank slice:

- **Route** = parse (guard options / in-handler zod) → authorize (wrapper) →
  call service → shape the identical response. No Prisma, no arithmetic, no
  condition-building in routes
  ([deposit.ts](../src/pages/api/bank/deposit.ts) is the reference).
- **Service** ([src/services/Bank.service.ts](../src/services/Bank.service.ts))
  owns validation schemas, `SELECT ... FOR UPDATE` row locking, conditional
  (`WHERE balance >= amount`) debits, `bank_history` writes, and response
  coercion (`stringifyObj(sanitizeUserForResponse(...))`,
  [Bank.service.ts:129](../src/services/Bank.service.ts)).
- **Parity is checked by tests**: route-level tests invoke the exported
  handler with mocked middleware/Prisma and assert exact status + body
  (pattern: [src/__tests__/pages/api/bank/](../src/__tests__/pages/api/bank/));
  service tests assert transactional semantics
  ([src/services/__tests__/Bank.service.test.ts](../src/services/__tests__/Bank.service.test.ts),
  plus the pre-existing [bankAndSpyRules.test.ts](../src/services/__tests__/bankAndSpyRules.test.ts)).
