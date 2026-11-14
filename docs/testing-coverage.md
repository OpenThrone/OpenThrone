# Testing and coverage inventory (issue #24, part 1)

What covers the critical player flows and admin operations today, what a
production cutover would fly blind on, and the minimum additions before
cutover. Produced 2026-10-14 on `cloudflare-platform-modernization` by
enumerating the tree (`find src scripts -name '*.test.ts*'`) and reading the
suites named below. Companion documents: the API tiers
([api-route-classification.md](./api-route-classification.md)), the deploy
runbook ([operations.md](./operations.md)), the realtime pilot
([realtime-pilot.md](./realtime-pilot.md)).

Three coverage layers exist today, plus the manual checklist:

1. **Automated unit/route tests** — 171 `*.test.ts(x)` files (section 2). All
   run against a mocked Prisma client (`bunfig.toml` preloads
   `__mocks__/setup.prisma-mock.ts`); the only suite that touches a real
   database is opt-in (`src/lib/postgres-rate-limiter.pg.test.ts:1-9`, skipped
   unless `RATE_LIMIT_TEST_DATABASE_URL` is set).
2. **`scripts/smoke-deploy.ts`** — 10 unauthenticated HTTP checks against a
   deployed Worker (`scripts/smoke-deploy.ts:109-201`): `home`,
   `account-login`, `account-register`, `messaging`, `battle-users`,
   `custom-404`, `api-config`, `auth-session-anonymous`, `locales-asset`,
   `cron-turns-unauthenticated-refused`. No check authenticates; no check
   performs a write.
3. **Manual cutover smoke checklist** —
   [operations.md:130](./operations.md): `/` and `/account/login` render;
   register/login with Turnstile; recruit/train/bank/armory round-trip; attack
   + spy against a seeded player; turn accrual after the next `*/30` tick;
   password-reset email arrives; admin panel loads; unknown URL renders 404.
4. **CI** — `.forgejo/workflows/cloudflare-ci.yaml` is a draft gate, inert
   until a Forgejo runner is registered (file header, lines 1–8): nothing runs
   the suites or the smoke automatically on push today.

## 1. Coverage matrix — critical flows

Legend: **A** = automated unit/route tests (suites named), **S** =
smoke-deploy check, **M** = manual cutover checklist item, **GAP** = no
coverage in that layer. Route-level tests mock the guards (`withApiGuard`,
`withAuth`, idempotency) and drive the real handler against mock Prisma —
e.g. [src/\_\_tests\_\_/pages/api/bank/deposit.api.test.ts:13-23](../src/__tests__/pages/api/bank/deposit.api.test.ts)
— so they pin route logic, not guard wiring or SQL.

| Flow | A: automated suites | S: smoke-deploy | M: manual checklist | Verdict |
| --- | --- | --- | --- | --- |
| **Auth — register** | Schema only: `RegisterSchema` (`src/lib/validation.test.ts`). No test loads the route (`src/pages/api/auth/register/route.ts`; grep for `auth/register` in tests: zero hits) | `account-register` asserts `GET /account/register` 200 (page render only) — [smoke-deploy.ts:133-136](../scripts/smoke-deploy.ts) | "register/login with Turnstile" | **GAP at the endpoint**: account creation + Turnstile verification untested; only the page load and the schema are pinned |
| **Auth — login** | NextAuth `authorize` driven end-to-end with mock Prisma: credential hardening + TOTP (`src/__tests__/pages/api/auth/credentials.security.test.ts`, imports `speakeasy`), status gate + malformed hash (`auth/login-status-gate.test.ts`), client IP → authorize (`auth/nextauth-client-ip.test.ts`), login telemetry (`LoginTelemetry.service.test.ts`), disabled-login (`disabledLogin.test.ts`, `loginPolicy.test.ts`), session revalidation after DB replacement (`src/lib/sessionAccount.test.ts`, `.status.test.ts`), `UserSessionService.test.ts` | `account-login` (page 200), `auth-session-anonymous` (unauthenticated session = `{}`) — [smoke-deploy.ts:127-130](../scripts/smoke-deploy.ts), [177-178](../scripts/smoke-deploy.ts) | "register/login with Turnstile" | **Best-covered auth path**; but no automated login against a deployed Worker |
| **Auth — 2FA** | Enrollment (`TwoFactor.service.test.ts`), disable requires proof of account holder (`account/disable-2fa.api.test.ts`), privileged-2FA policy (`src/utils/securityPolicies.test.ts`), TOTP verification at login (inside `credentials.security.test.ts`) | none | none (enrollment is a staff-runbook procedure, operations.md:47-71) | Covered at unit level; no deployed-Worker check |
| **Auth — password reset** | Service level only: delivery (`AuthPasswordReset.test.ts`), code-attempt limits (`AccountResetAttempts.test.ts`) | none | "password-reset email arrives" | **GAP at the routes**: the guard-`none` emailed-token trio `account/forget`/`reset`/`verify`/`passChange` ([api-route-classification.md:40](./api-route-classification.md)) has no route test (grep `auth/reset\|passChange` in tests: zero hits); real mail delivery is manual only |
| **Recruit** | Route tests: target selection (`recruit/autoRecruitTargets.api.test.ts`), `handleRecruitment` validation (`recruit/handleRecruitment.api.test.ts`), recruit link (`recruit/recruitLink.api.test.ts`) — 3 of 9 routes in `src/pages/api/recruit/`. Service: history transaction ordering (`Recruitment.service.test.ts`), session-ID guards (`recruitmentGuards.test.ts`), sim rounding (`src/sim/externalRecruitment.test.ts`) | none | "recruit/train/bank/armory round-trip" | Unit coverage partial (6 routes untested: `startSession`, `endSession`, `verifySession`, `listSessions`, `getRecruitHistory`, `getRandomUser`); no deployed check |
| **Train** | Service gates only: `training.security.test.ts` (fort gate, F-07), `UserUnitsService.test.ts`. Routes `/api/training/{train,untrain,convert}` untested (grep `api/training` in tests: only the service test) | none | "recruit/train/bank/armory round-trip" | **GAP at the routes**; gold/units mutation wiring untested |
| **Bank deposit/withdraw/history** | Route tests for all four endpoints, marked "(parity)": `bank/deposit.api.test.ts`, `bank/withdraw.api.test.ts`, `bank/getDeposits.api.test.ts`, `bank/history.api.test.ts`. Service: `Bank.service.test.ts` (`depositGold`), `src/utils/bankLimits.test.ts`. Alliance bank: withdraw rules (`bankAndSpyRules.test.ts`), lock ordering (`allianceBank.lockOrder.test.ts`), history route (`alliances/bankHistory.api.test.ts`, ALL-03). Idempotency middleware itself: `src/middleware/idempotency.test.ts` (but mocked inside the route tests) | none | "recruit/train/bank/armory round-trip" | **Best-covered economy flow** at unit level; still no deployed-Worker or real-SQL exercise |
| **Attack** | Combat math + utils: `src/app/attack.test.ts` (battle simulation), `attackFunctions.test.ts`, `attackFunctions.goldPillage.test.ts`, `AttackService.attackLogGold.test.ts`, `AttackService.goldTransfer.test.ts`, `battleOutcome.test.ts`, `casualtySystem.test.ts`, `combatDominance.test.ts`, `formationBuilder.test.ts`, era eligibility (`src/utils/eraParticipation.test.ts`). Service: persistence + replay + self-target guards (`AttackService.test.ts`), log redaction (`Battle.redaction.test.ts`), log ACL (`AttackLogAccess.service.test.ts`), log ACL route (`attack/attackAccess.api.test.ts`, ATK-01) | none (only `/battle/users` list page) | "attack + spy against a seeded player" | **Service/math well covered; the `POST /api/attack/[id]` handler itself is not** (rate profile, Idempotency-Key, notification emission untested at route level) |
| **Spy / infiltration** | Route: `spy.api.test.ts` (drives `spy/[id]` with mocked guards). Missions: `spyFunctions.test.ts`, `spyFunctions.v5.test.ts` (gates/commitment), `src/app/spy.test.ts`, `infiltrate.test.ts`, `assassinate.test.ts`, `src/sim/spyBehavior.test.ts`, spy/sentry parity (`UserServices.parity.test.ts`), spy+bank rules (`bankAndSpyRules.test.ts`) | none | "attack + spy against a seeded player" | Well covered at unit level; defense notification (`spyDefenseNotification`) reaches the defender on both transports: payload-to-toast in `gameEventAlerts.test.ts`, mailbox delivery in `realtime.test.ts` and `ChatRoomDO.test.ts` |
| **Messaging — read (HTTP)** | Service: unread receipts, participants (MSG-01), ATTACK_LOG_SHARE, reply scope (`Messaging.service.test.ts`); room authorization concurrency (`chatRoomGuards.test.ts`). Route: participant removal only (`messages/removeParticipant.api.test.ts`, MSG-03) | `messaging` asserts `GET /messaging` 200 (page shell) — [smoke-deploy.ts:138-142](../scripts/smoke-deploy.ts) | none | **GAP**: `GET /api/messages` and `GET /api/messages/[chatRoomId]` have no route tests; on Workers read is the *only* messaging path by default |
| **Messaging — realtime send** | DO pilot stack: `chatDoCore.test.ts`, `ChatRoomDO.test.ts` (upgrade + authorization + restarted-instance), `workerDoRouter.test.ts`, `realtimeTicket.test.ts`, `realtimeTransport.test.ts`, `realtimeDoClient.test.ts`, `realtime.test.ts` (facade), `realtime/ticket.api.test.ts`. Socket.IO twin (Node runtime): `socket.test.ts` (jest integration), `socket.joinRoom/evict/accountGuard.test.ts` | none | none | Pilot components individually tested; `/api/realtime/send` + `/api/realtime/read` route handlers have no direct tests (only reached via `ChatRoomDO.test.ts` with the service binding mocked). **Product gap, not just test gap**: production stays `NEXT_PUBLIC_DISABLE_SOCKET=true` pending the pilot decision ([realtime-pilot.md:582-583](./realtime-pilot.md)) |
| **Alliance management** (create/join/requests accept-reject/wars/update) | **None.** No test imports `Alliance.service` (grep: zero hits); of the 13 routes in `src/pages/api/alliances/` only alliance-bank pieces are tested (see bank row) and `admin-game-alliances.api.test.ts` pins the *admin* alliance query validation. Eviction side effects covered (`socket.evict.test.ts`, `chatRoomGuards.test.ts`) | none | none | **GAP — entirely manual**: creation, join, membership requests, wars have zero automated coverage and no checklist item |
| **Admin — era start/reset** | `admin-hardening.api.test.ts` ADM-01 ("era start is admin-only", drives `admin/start-era`), TASK_SECRET `resetGame` route (`general/resetGame.api.test.ts`), era settings/participation (`eraStartSettings.test.ts`, `currentEraParticipants.test.ts`), cron concurrency (`cronJob.concurrency.test.ts`) | `cron-turns-unauthenticated-refused` (401/403/405 on `/api/cronJobs/turns`) — [smoke-deploy.ts:188-200](../scripts/smoke-deploy.ts) | "admin panel loads"; "turn accrual after the next `*/30` tick" | Authorization well pinned; actual era-reset execution on the deployed Worker is manual only |
| **Admin — user editing** | `admin-users.api.test.ts` (`admin/users/[userId]`), plus the ADM hardening battery: ADM-02 (reset/close revoke access), ADM-03 (user export admin-only + audited), ADM-04 (staff email takeover / admin-on-admin edits blocked), ADM-05 (staff cannot lock out admins), ADM-06 (impersonation never reaches staff), ADM-07 (audit rows indexed), sensitive chat reads — all in `admin-hardening.api.test.ts` | none | "admin panel loads" | Strong unit coverage; no deployed-Worker check |
| **Admin — API tokens** | Service only: `ApiToken.service.test.ts` (issue/verify/revoke). Routes `admin/api-tokens/*` and the only Bearer route `utilities/getConstants` have no route tests | none | none | **GAP at the routes** — this is the only programmatic (non-session) API surface |
| **Admin — bots** | `admin-bots.api.test.ts` (provision/status/run-now registry validation), decision engine (`BotDecisionEngine.test.ts`), manifests/personas (`botUsers/config.test.ts`, `constants.test.ts`) | none | none | Unit covered; provisioning against a real DB is manual (`scripts/seed-bots.ts`, operations.md:37) |

Cross-cutting suites not tied to one flow: guard behavior
(`__tests__/middleware/apiGuard.restricted.test.ts`, `auth.restricted.test.ts`),
cron boundary (`workerCron.test.ts`), rate limiting
(`postgres-rate-limiter.test.ts` + opt-in `.pg.test.ts`), mailer facade
(`mailer.test.ts`), password hashing (`passwordHash.test.ts`, `.sidecar.test.ts`),
avatar storage, CORS, login policy, audit logger sinks.

## 2. Automated suite count

Counted 2026-10-14 with
`find src scripts -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l`:

- **171 test files total** — 164 under `src/`, 7 under `scripts/`.
- **168 run under `bun run test`** (`bun test` with
  `--path-ignore-patterns='**/{socket,SidebarShared,app-shell}.test.*'`,
  `package.json:28`); **3 require jsdom** and run only under
  `bun run test:jest`: `src/lib/socket.test.ts`,
  `src/components/sidebar/SidebarShared.test.tsx`,
  `src/__tests__/app-shell.test.tsx` (jest.config.js:
  `jest-environment-jsdom`, 30% global coverage thresholds).
- 1 of the 168 is **opt-in**: `src/lib/postgres-rate-limiter.pg.test.ts`
  self-skips without `RATE_LIMIT_TEST_DATABASE_URL`.

Roughly what they pin, by area:

| Area | Files | What they pin |
| --- | --- | --- |
| `src/services/**` (+ `__tests__`) | 40 | Domain logic against mock Prisma: bank, attack persistence/replay, messaging, recruitment, 2FA, API tokens, sessions, moderation/audit, locks |
| `src/__tests__/pages/api/**` | 35 | Route handlers with guards mocked: auth (3), account (5), admin (5), bank (4), recruit (3), general (3), social (2), attack/spy/battle/messages/alliances/appeals/realtime/utilities/stats (1 each) |
| `src/utils` | 28 | Pure helpers: combat math, spy missions, bank limits, era participation, IP resolution, login policy, formatting |
| `src/sim` (+ `personas`) | 22 | Era simulation engine, balance gates, persona policies |
| `src/lib` (+ `__tests__`) | 18 | Infra: rate limiter, mailer, argon2 hashing, session validation, socket guards, realtime facade/ticket/transport/client, workerCron, workerDoRouter, register schema |
| `scripts/**` | 7 | The smoke registry/evaluators themselves (`smoke-deploy.test.ts`), `db-migrate` CLI guards, dev-seed safety, era import/export/simulation CLIs, balance report parsing |
| `src/app` | 4 | Battle simulations: attack, spy, infiltrate, assassinate |
| `src/botUsers/__tests__` | 3 | Bot decision engine, manifests, persona constants |
| Remaining (`middleware` 3, `durable-objects` 2, `constants` 2, `components` 3, `models` 1, `styles` 1, `src/__tests__` root 1) | 13 | Idempotency + restricted-account guards, DO core/adapter, runtime settings, units table, UI helpers, UserModel, visual language, app shell |

The load-bearing caveat: **every suite except the opt-in pg limiter test runs
against `__mocks__/setup.prisma-mock.ts`**, so no automated test executes real
SQL against Postgres. The real database path (Hyperdrive → cloudflared →
PgBouncer → Postgres, [operations.md:138-149](./operations.md)) is exercised
only by the live preview deployment and the manual checklist.

## 3. Prioritized gap list (what production would fly blind on)

1. **No authenticated end-to-end check ever runs against a deployed Worker.**
   All 10 smoke checks are unauthenticated (anonymous session, page shells,
   one refusal check); every write flow is covered only by mock-Prisma unit
   tests plus the manual checklist. A failure that only manifests through the
   real request path — Hyperdrive pooling, NextAuth cookie/session handling on
   Workers, Turbopack/webpack chunk regressions on authenticated pages —
   would pass CI-style checks and smoke alike. The current `/api/config`
   outage on the LAN database path is exactly the class of failure smoke
   detects only by luck (it is the single DB-backed smoke target).
2. **CI is inert.** `.forgejo/workflows/cloudflare-ci.yaml` is a draft with no
   runner (file header): today nothing forces the 171 suites or the smoke to
   run on push — the suites run only when someone remembers locally.
3. **Alliance management has zero automated coverage** (create, join,
   membership requests, wars, update — 13 routes, no service test, no smoke,
   no checklist item). A regression ships silently.
4. **Password-reset route chain untested** (`forget` → emailed token →
   `verify`/`passChange`): service delivery and attempt-limiting are tested,
   but the guard-`none` route wiring — the exact token-verification surface an
   attacker hits — is not, and real mail delivery is only ever checked
   manually.
5. **Economy write routes never run with the real idempotency + guard stack.**
   Route tests mock `withApiGuard` and `enforceIdempotency`
   (deposit.api.test.ts:13-23); the middleware is tested in isolation. The
   composition (replayed `Idempotency-Key` under a fresh Hyperdrive
   connection) — flagged as a pre-cutover requirement in
   [api-route-classification.md:168](./api-route-classification.md) — has no
   test anywhere.
6. **Attack route handler untested** (`POST /api/attack/[id]`): combat math and
   service persistence/replay are covered, but the highest-traffic mutation's
   own wiring (rate profile, idempotency, notification emission) is not.
7. **Training routes untested** (`train`/`untrain`/`convert`) — service fort
   gate only; a gold/units mutation path with no route-level pin.
8. **Messaging HTTP reads untested** (`GET /api/messages`,
   `GET /api/messages/[chatRoomId]`) — on the default Workers build
   (`NEXT_PUBLIC_DISABLE_SOCKET=true`) HTTP read is the *only* messaging
   capability, yet it has no route test and no smoke beyond the page shell.
9. **Admin API-token routes untested** (`admin/api-tokens/*`,
   `utilities/getConstants`) — the only Bearer-token surface; service logic
   only.
10. **Realtime send on production is a known product hole, not covered by
    tests either**: the DO pilot is preview-scoped and `/api/realtime/send`/
    `read` have no direct route tests ([realtime-pilot.md:582-583](./realtime-pilot.md),
    §7).
11. **Register endpoint untested** — only the page 200 (smoke) and the zod
    schema (unit) are pinned; Turnstile verification + account creation is
    exercised solely by hand.
12. **Recruit route coverage is 3 of 9**; session start/end/verify flow only in
    the manual round-trip.

## 4. Minimum additions before production

Strictly the flows that MUST get coverage, and of what kind:

1. **An authenticated smoke pass (new script or `--authenticated` mode of
   `smoke-deploy.ts`), run after every preview and production deploy.** It must
   log in with a seeded account and verify at minimum: bank deposit → history
   → withdraw (DB-visible gold delta), one recruit/train action, one attack
   and one spy against a seeded target, messaging room read over HTTP, and one
   admin endpoint touch as staff. This closes gaps 1, 5, 6 (composition-level)
   and is the single highest-value addition — the manual checklist becomes the
   fallback, not the only net.
2. **Route tests for the password-reset emailed-token chain** (`forget`,
   `verify`, `passChange`): happy path plus expired/replayed/foreign token
   rejections. Gate for production because it is a guard-`none` auth surface.
3. **Route tests for alliance create + join** (authorization, duplicate/State
   guards, gold cost if any). If the team decides alliances are not launch
   scope, say so in operations.md instead — but do not cut over with the
   feature silently untested.
4. **Route test for `POST /api/attack/[id]`** (self-target guard surfaces at
   the route, `Idempotency-Key` replay, rate-profile rejection) and for
   `/api/training/train` (fort gate + gold spend). Both are high-frequency
   player writes whose wiring is currently pinned nowhere.
5. **A cron tick check in the authenticated smoke or a follow-up script**:
   after a `*/30` trigger on preview, assert turn accrual — automating the
   existing manual checklist item that guards the whole game loop.
6. **Register the Forgejo runner and activate `cloudflare-ci.yaml`** so verify →
   build → smoke actually gates promotion; the suites already exist, they are
   simply not enforced. (Deployment/pipeline work belongs to issue #22; listed
   here because unenforced coverage does not protect a cutover.)
7. **Decide and record the production messaging posture before cutover**
   (socketless read-only vs. DO pilot): if read-only, add the two HTTP message
   read routes to gap 1's smoke; if the pilot, add `/api/realtime/send` +
   `/read` route tests. Shipping either posture without its test is the gap.

Recommended but not blocking: remaining recruit routes (gap 12), admin
api-token routes (gap 9), register endpoint test (gap 11). Everything else in
section 3 is adequately mitigated by the existing unit depth plus item 1.
