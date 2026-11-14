# API route classification

Inventory of every route handler under `src/pages/api` for the Workers
extraction plan (issue #20, part 1 of 3). Supersedes
[api-surface-inventory.json](./api-surface-inventory.json) as a *coverage*
document — that file is a security-hardening snapshot of ~20 selected
endpoints dated 2026-02-07, not a full route inventory, and at least one of its
claims is stale (see [corrections](#inventory-corrections) below).

## Counting method

Counts were produced from the tree, not from any generated file:

```sh
find src/pages/api -type f | wc -l                                # 174
find src/pages/api -type f | sed 's|src/pages/api/||' \
  | awk -F/ '{if (NF==1) print "(root)"; else print $1}' | sort | uniq -c
```

Auth modes were classified by grepping each file for its wrapper
(`withApiGuard` from [src/middleware/apiGuard.ts](../src/middleware/apiGuard.ts)
— 76 files, `withAuth` from [src/middleware/auth.ts](../src/middleware/auth.ts)
— 76 files, neither — 22 files, of which 8 are `v1/` delegation wrappers) and
for the guard options actually set (`authMode`, `allowApiToken`,
`requiredScopes`) plus direct `TASK_SECRET` checks. The two wrappers both
resolve NextAuth sessions via `getServerSession`
([apiGuard.ts:144](../src/middleware/apiGuard.ts),
[auth.ts:34](../src/middleware/auth.ts)); they differ in admin/permission
elevation and API-token support. Totals: 76 + 76 + 22 = 174.

## Classification

Criticality follows the issue #20 tiers: **critical** = auth or game-economy
writes or admin; **high** = gameplay writes; **medium** = reads/social;
**low** = dev-only/disabled. Mixed groups are tiered by their most sensitive
members and called out in the notes.

| Group | Files | Tier | Auth modes | Notable dependencies |
| --- | --- | --- | --- | --- |
| account/auth (`account/` 19 + `auth/` 2) | 21 | critical | nextauth session (16), guard `none` ×3 (emailed-token flows: `passChange`, `reset`, `verify`), public (NextAuth provider, `register` + Turnstile) | `AccountService`/`AuthService` → mailer facade, Turnstile, Prisma; 2FA trio calls `getServerSession` directly |
| admin (`admin/`) | 46 | critical | guard `admin` ×14 files, guard `permission` ×31, guard `required` ×1 (`impersonate/stop`) | staff permission model, audit logs, API-token issue/revoke, bot provisioning |
| alliances (`alliances/`) | 13 | critical | guard `required` ×2 (alliance bank), nextauth session ×11 | alliance bank = economy writes; Prisma; chat-room eviction via facade on membership removal |
| attack (`attack/`) | 8 | high | guard `required` ×3, guard `none` ×1 (`test` simulator), nextauth session ×4 | `[id]` mutation uses `attack` rate profile + Idempotency-Key + `emitToUser`; `battleTest` is `withAuth` + `isAdmin` ([battleTest.ts:18](../src/pages/api/attack/battleTest.ts)); `fullScaleBattleTest` hardcodes user ids 1/2 ([fullScaleBattleTest.ts:23](../src/pages/api/attack/fullScaleBattleTest.ts)) |
| spy (`spy/`) | 1 | high | guard `required` | `spy` rate profile, Idempotency-Key, `emitToUser` defense notification |
| bank (`bank/`) | 4 | critical | guard `required` ×2 (deposit/withdraw), nextauth session ×2 (reads) | `bank` rate profile, Idempotency-Key, gold transfers |
| armory (`armory/`) | 5 | high | nextauth session | equipment/mercenary mutations via `ArmoryService` |
| training (`training/`) | 3 | high | nextauth session | `train`/`untrain`/`convert` mutate gold and units |
| structures (`structures/`) | 1 | high | nextauth session | `upgrades` spends gold |
| battle (`battle/`) | 2 | medium | nextauth session | upgrade metadata + attack-list filter meta (reads) |
| messaging/chat (`messages/`) | 4 | medium | nextauth session | 2 of 4 files import the realtime facade (see below); UI is read-only over HTTP on Workers |
| social (`social/`) | 13 | medium | nextauth session ×12, guard `required` ×1 (`friends/[friendId]/transfer`) | relationship writes/reads; `transfer` is an economy write (bank profile + Idempotency-Key + `emitToUser`); `gold-requests/` also moves gold |
| recruit (`recruit/`) | 9 | high | nextauth session | recruitment sessions and `handleRecruitment` (gold) |
| reports + appeals (`reports/` 6 + `appeals/` 1) | 7 | medium | guard `permission` ×5, guard `required` ×1 (`create`), guard `optional` + `allowRestrictedAccount` ×1 ([appeals/index.ts:66-67](../src/pages/api/appeals/index.ts)) | moderation intake; appeals admits banned/suspended sessions deliberately |
| content (`blog/` 4 + `announcements` + `advisor-messages`) | 6 | medium | nextauth session ×4 (blog), public ×2 (active banners/messages reads) | `blog/post` broadcasts via facade |
| public stats/config (`stats`, `config`, `community/stats/` 2, `captcha/verify`) | 5 | medium | none | unauthenticated reads and Turnstile verification |
| general (`general/`) | 11 | mixed | guard `none` ×4, nextauth session ×5, `TASK_SECRET` ×1 ([resetGame.ts:10](../src/pages/api/general/resetGame.ts)), `REVALIDATION_SECRET` ×1 ([revalidate.ts:14](../src/pages/api/general/revalidate.ts)), dev-only ×1 | user lookups/leaderboard reads; `resetGame` and `revalidate` are secret-gated ops tools |
| utilities (`utilities/`) | 2 | medium | guard `optional` + `allowApiToken` + scope `constants:read` ×1 ([getConstants.ts:22-24](../src/pages/api/utilities/getConstants.ts)), nextauth session ×1 | the only route that accepts Bearer API tokens |
| cronJobs (`cronJobs/`) | 4 | critical | guard `none` + raw `TASK_SECRET` via `timingSafeEqual` ([daily.ts:9-33](../src/pages/api/cronJobs/daily.ts)) | game-wide state mutation; driven by `worker.ts` `scheduled()` fan-out on Workers |
| debug (`debug/clear-session`) | 1 | low | guard `none`, blocked outside development ([clear-session.ts:21](../src/pages/api/debug/clear-session.ts)) | dev-only |
| v1 wrappers (`v1/`) | 8 | mirrors target | none of their own — each re-exports the legacy handler ([example](../src/pages/api/v1/bank/deposit.ts)) | see [api-v1-compat-matrix.md](./api-v1-compat-matrix.md) |

Total: **174 files** across 21 groups.

## Runtime incompatibilities

A recursive grep of `src/pages/api` for `fs`/`node:fs`, `node:http`/`http`,
and native-module imports (`bcrypt`, `argon2`, `sharp`, `canvas`, `aws-sdk`,
`nodemailer`, …) found **no direct hits in any route file**. The Node-only and
socket-coupled code is reachable only indirectly:

Socket-coupled handlers — six route files import the
[realtime facade](../src/lib/realtime.ts), which lazily `import`s
`@/lib/socket` ([realtime.ts:35](../src/lib/realtime.ts)); that module imports
node `http` ([socket.ts:2](../src/lib/socket.ts)) and the Socket.IO server
([socket.ts:5](../src/lib/socket.ts)). With `NEXT_PUBLIC_DISABLE_SOCKET=true`
the dynamic import never fires, so these handlers already run on Workers — but
any extraction must keep (or replace) these emissions:

| Handler | Facade import | Emit site |
| --- | --- | --- |
| `attack/[id].ts` | [line 5](../src/pages/api/attack) | line 64 (`attackNotification`) |
| `spy/[id].ts` | [line 8](../src/pages/api/spy) | line 132 (`spyDefenseNotification`) |
| `messages/index.ts` | line 6 (`emitToUsers`, `isRealtimeEnabled`) | — |
| `messages/[chatRoomId]/participants/[participantId].ts` | line 4 (`evictUserFromChatRoom`) | — |
| `social/friends/[friendId]/transfer.ts` | line 6 (`emitToUser`) | — |
| `blog/post.ts` | line 5 (`emitToAll`) | — |

One-hop Node-only dependencies through services:

- `nodemailer` loads via a lazy dynamic import in
  [src/lib/mailer.ts:34-37](../src/lib/mailer.ts); it is reachable from every
  account/auth handler that touches `AccountService`
  ([Account.service.ts:6](../src/services/Account.service.ts)) or
  `AuthService` ([Auth.service.ts:4](../src/services/Auth.service.ts)). Same
  facade pattern: safe on Workers when `MAIL_DRIVER` is `http` or `noop`
  (see [operations.md](./operations.md)).
- Node builtins in hot paths — `crypto.randomUUID`
  ([apiGuard.ts:1](../src/middleware/apiGuard.ts)) and `timingSafeEqual` +
  `Buffer` ([daily.ts:1](../src/pages/api/cronJobs/daily.ts),
  [resetGame.ts:1](../src/pages/api/general/resetGame.ts)) — are already
  exercised by the live preview deployment under `nodejs_compat`; not blockers.

Dev-only/disabled handlers (no Workers action needed, candidates for deletion
during extraction): [debug/clear-session.ts](../src/pages/api/debug/clear-session.ts)
and [general/git-info.ts](../src/pages/api/general/git-info.ts) both return
early unless `NODE_ENV === 'development'`; `fullScaleBattleTest` is gated to
hardcoded user ids 1 and 2.

## Client usage

Reference counts come from grepping literal `/api/...` paths in UI code only
(`src/pages`, `src/components`, `src/hooks`, `src/context`, `src/layouts`;
192 references total, grouped by first path segment — dynamic segments and
query strings normalized):

| Domain | UI refs | | Domain | UI refs |
| --- | --- | --- | --- | --- |
| admin | 70 | | reports | 6 |
| social | 24 | | blog | 4 |
| account | 20 | | bank | 4 |
| alliances | 13 | | attack | 3 |
| recruit | 10 | | battle, armory, appeals | 2 each |
| messages | 9 | | stats, spy, config, community, captcha, auth, announcements, advisor-messages | 1 each |
| general | 8 | | | |
| training | 7 | | | |

Domains with **zero** UI references:

- `v1/` — no `/api/v1` reference anywhere in the React app. Per
  [api-v1-compat-matrix.md](./api-v1-compat-matrix.md) these exist for
  external consumers and "a versioned path alone does not grant token
  authentication": they delegate to the session-guarded legacy handlers, and
  the only Bearer-token route today is `utilities/getConstants` (`constants:read`
  scope). Treat v1 as an external contract to preserve or formally retire, not
  as app surface.
- `cronJobs/` — consumed by the `worker.ts` `scheduled()` fan-out
  ([workerCron.ts:35-44](../src/lib/workerCron.ts)) and the external curl
  crontab, plus tests — never by the browser.
- `utilities/` and `debug/` — no in-repo consumer found for `getConstants`;
  `clear-session` is dev tooling.

Everything else is consumed by the React app and must keep its request/response
shapes stable through any extraction.

## Recommended extraction order

Lowest-risk first; each step is independently deployable and observable via
`wrangler tail` and the smoke checklist in
[deploy-rollback.md](./deploy-rollback.md).

1. **Public stateless reads** — `config`, `stats`, `community/stats/*`,
   `announcements`, `advisor-messages`, `captcha/verify`: no auth, no writes,
   trivially portable; fastest signal that routing works.
2. **Session reads** — blog reads, `battle/*`, bank/attack log reads,
   `general/` lookups, `utilities/*`: reads only, so a mistake costs an error
   page, not state.
3. **v1 wrappers** — pure re-export delegation with zero logic; re-point or
   retire them in one commit once their targets are extracted.
4. **cronJobs** — already production-exercised on Workers via the
   `scheduled()` fan-out; extraction formalizes what the preview deployment
   already runs.
5. **Non-economy gameplay writes** — `recruit/*`, social relationship
   endpoints, `messages/*`: writes but low blast radius; surfaces the realtime
   facade decisions early (messaging is the only group needing a websocket
   replacement).
6. **Economy writes** — `bank`, alliance bank, `armory`, `training`,
   `structures`, friend transfer, `gold-requests`: Idempotency-Key +
   transactional semantics under Hyperdrive must be verified before cutover.
7. **attack + spy** — highest-traffic mutations with rate profiles, idempotency
   replay controls, and notification side effects.
8. **admin** — 46 files sharing one consistent guard; mechanically uniform but
   permission semantics and audit logging deserve a dedicated migration window.
9. **account/auth** — NextAuth session machinery, 2FA, Turnstile, and emailed
   token flows are woven through every other group's guard; migrate last, when
   everything it protects is already on the new runtime.

## Inventory corrections

Stale claims in [api-surface-inventory.json](./api-surface-inventory.json)
(2026-02-07) vs. the current tree:

- `/api/attack/test` is listed as "restricted to admin sessions"; it is now a
  stateless public battle simulator on guard `authMode: 'none'` with the
  `attack` rate profile ([test.ts:114-119](../src/pages/api/attack/test.ts)).
- The JSON covers ~20 selected endpoints only; the table above is the complete
  174-file coverage and should be regenerated (same method) before each
  extraction wave.
