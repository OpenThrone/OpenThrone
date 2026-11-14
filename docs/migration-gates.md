# Migration gates, SLOs, and cutover readiness (issue #24, part 2)

Synthesis of the existing runbooks into one decision document: the stage
ladder per workload, the quantified GO/NO-GO thresholds, the initial SLOs
(with an honest account of what can and cannot be measured today), incident
response, rollback safety for committed game actions, the final cutover
checklist, and the known-open blockers. Companion documents, all of which
this page defers to rather than duplicates:
[operations](operations.md) (deploy/observe/rollback, one-time setup, LAN
database path), [deploy-rollback](deploy-rollback.md) (rollback drill,
logging conventions, tail patterns), [scheduled-jobs](scheduled-jobs.md)
(per-job ops contract, double-scheduler rules, known gaps),
[database-reliability](database-reliability.md) (migration ownership,
backup/restore drill, timeouts, load-test runbook, incident record),
[realtime-pilot](realtime-pilot.md) (DO pilot spec, expand-or-stop
thresholds), [testing-coverage](testing-coverage.md) (coverage inventory,
must-fix gap list), [api-route-classification](api-route-classification.md)
and [api-contract](api-contract.md) (API program).

**Status: production is NOT deployed.** The only deployed Worker is the
preview (`openthrone-preview`, `wrangler.jsonc:75`). Everything below marked
**[proposed]** has no repo-measured basis or existing owner yet and is an
operator decision; everything else cites a measured baseline, an existing
timeout/threshold in code, or a runbook rule.

## Evidence basis (re-verified 2026-10-14, this document's authoring session)

| Check | Command | Result |
| --- | --- | --- |
| Suite count | `find src scripts -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) \| wc -l` | 171 (164 `src/` + 7 `scripts/`) — matches [testing-coverage.md](testing-coverage.md) §2 |
| Full suite | `bun --no-env-file run test` | **green**: `1656 pass / 3 skip / 0 fail`, 1659 tests across 169 files, 5.2 s (skips = the opt-in pg-limiter tests, testing-coverage.md §2) |
| Type check | `bun --no-env-file run check-types` | **green**: exit 0 |
| Deploy smoke | `bun --no-env-file scripts/smoke-deploy.ts` | **red**: 8/10 — `battle-users` 500, `api-config` timed out at 15 273 ms; exit 1 |
| Load run (gate scale) | `bun --no-env-file scripts/loadtest-preview.ts` (defaults: 30 s × 10 workers, `/`, `/account/login`, `/api/config`) | **red**: overall error rate 12.86% > 1%; `/api/config` 38.57% errors, p95 15 002 ms (pinned at the 15 s request ceiling); `/` and `/account/login` 0 errors, p50 57/73 ms, p95 1 074/1 529 ms. Started 2026-10-14T05:43:06Z |

The smoke and load failures are the recorded preview database-path outage
([database-reliability.md](database-reliability.md), incident record
2026-10-14), still live at authoring time — see
[blockers](#7-known-open-blockers). `battle-users` failing 500 is a new
observation: it is a database-backed SSR page
(`src/pages/battle/users.tsx:1043-1051` queries `prisma.era.findFirst` and
`prisma.users.findMany` in `getServerSideProps`, verified this session), so
it fails with the same infra-owned path; the truly static pages (`/`,
`/account/login`) remained 0-error throughout.

## 1. Staged rollout

One ladder shape for all workloads — **local → preview → internal test →
canary → production** — with workload-specific entry criteria. Two stages do
not exist as separate environments today and must be honestly described:

- **Internal test** = the production Worker (`openthrone`) deployed with
  `NEXT_PUBLIC_DISABLE_LOGIN=true` — staff-only admission: only unrevoked
  ADMINISTRATOR/MODERATOR assignments may enter
  ([scheduled-jobs.md](scheduled-jobs.md), "Disabled login"). The flag is
  build-time inlined, so each toggle requires rebuild + redeploy
  ([operations.md:123](operations.md); scheduled-jobs.md "Disabled login").
- **Canary** = either (a) a Cloudflare gradual version rollout (the
  `wrangler versions` mechanism referenced at
  [operations.md:129](operations.md)) or (b) login-open on the production
  Worker with a fixed close-observation window. Neither has been exercised
  in this repository; **[proposed]** choosing between them is an operator
  decision recorded at cutover time.

Sign-off roles as named by the repo: **release operator** (runs migrations
and the release, [database-reliability.md](database-reliability.md)
"Migration ownership"), **orchestrator** (deploys and runs drills,
[deploy-rollback.md](deploy-rollback.md) "Rollback drill"), **staff
tester** (realtime-pilot.md §7.9 step 2 pattern), **ops review** (the only
named review body, realtime-pilot.md §8.3 "pilot budget agreed in ops
review"). Where no owner is named anywhere, the sign-off is marked
**[proposed: no named owner]**.

Observation periods are **[proposed]** unless anchored: the minimum
meaningful observation for anything cron-adjacent is one full UTC day, since
the four crons fire at `*/30`, 04:00, 04:30, 05:00 UTC
(`wrangler.jsonc:15-22`).

### 1.1 HTTP/SSR Worker (OpenNext)

| Stage | Entry criteria (all required) | Observation | Sign-off |
| --- | --- | --- | --- |
| local | `bun --no-env-file run check-types` exit 0; `bun --no-env-file run test` 0 fail; lint clean on changed files (the CI draft's rule, cloudflare-ci.yaml:75-80); `bun run cloudflare:build` succeeds | n/a (gates are the observation) | engineer |
| preview | `bun run cloudflare:deploy:preview` (package.json:16) succeeded; smoke **10/10** (see §2); 30 s × 10-worker load run **passes** (§2); `wrangler tail --env preview` free of recurring 5xx during a 15-min watch **[proposed]** | ≥ 24 h spanning at least one manual re-deploy; re-run smoke after each redeploy | orchestrator |
| internal test | Production Worker deployed (`cloudflare:deploy:production`, package.json:17) with `NEXT_PUBLIC_DISABLE_LOGIN=true`; production Hyperdrive id real (not the placeholder, wrangler.jsonc:148); secrets verified present (§6); staff can log in and complete the manual cutover checklist flows ([operations.md:130](operations.md)): register/login with Turnstile, recruit/train/bank/armory round-trip, attack + spy vs seeded player, password-reset email, admin panel | ≥ 48 h **[proposed]**, including one full cron day | release operator + one staff tester |
| canary | Internal-test exit plus: rollback drill executed on this code (deploy-rollback.md "Rollback drill" procedure, run on preview against the same build); a `wrangler deployments list` snapshot recorded for last-known-good; gradual rollout or login-open window chosen | 7 days **[proposed]** with daily smoke + tail review | ops review **[proposed: no named owner for this decision]** |
| production | Canary exit plus §6 checklist complete; DNS/routing switched; one full manual cutover smoke (operations.md:130) immediately after switch | first 72 h: smoke + `[scheduled]` tail daily **[proposed]** | release operator |

### 1.2 PostgreSQL via Hyperdrive

| Stage | Entry criteria | Observation | Sign-off |
| --- | --- | --- | --- |
| local | `wrangler dev` against `localConnectionString` (wrangler.jsonc:66); `/api/config` returns 200 locally | n/a | engineer |
| preview | Hyperdrive `openthrone-db-lan` healthy: `/api/config` 200 in smoke; load run's `/api/config` error rate ≤ 1% — **currently blocked by the outage** (§7) | 24 h with two passing load runs ≥ 1 h apart **[proposed]** | orchestrator |
| internal test | `bunx wrangler hyperdrive create openthrone-db-production` done, id in wrangler.jsonc (operations.md:118-119); `db-migrate.ts status --env production` clean, then `apply --env production --confirm-production` (database-reliability.md:21-29, :53-60); **backup/restore drill passed on the production database instance** — the documented drill targets LAN staging (database-reliability.md:62-151); running it against production is **[proposed: operator decision, not yet written up]** | 24 h: zero Hyperdrive origin-TLS errors in tail; smoke's `api-config` green across the window | release operator |
| canary | Staff-only writes through the production Hyperdrive path (bank deposit → history → withdraw with visible gold delta, per the manual checklist) | 48 h **[proposed]** | staff tester + release operator |
| production | Public traffic on the production Hyperdrive path | 7 days **[proposed]**: error rate re-measured with the standard load run against the production URL | ops review **[proposed]** |

### 1.3 Scheduled jobs (Cron Triggers)

Preview deliberately runs **no** cron triggers (`wrangler.jsonc:88-90`;
operations.md:134) — never enable `DO_*` flags on a preview sharing the
production database. The ladder therefore skips preview for firing behavior
and tests locally, then goes straight to the production Worker with flags
off:

| Stage | Entry criteria | Observation | Sign-off |
| --- | --- | --- | --- |
| local | `wrangler dev --test-scheduled` fires all four triggers; endpoints refuse without `TASK_SECRET` (verified in Stage 4, cloudflare-modernization.md stage checklist) | n/a | engineer |
| preview | Fan-out unit boundary green (`src/lib/__tests__/workerCron.test.ts` in the suite); triggers.crons stays `[]` | n/a (by design) | n/a |
| internal test | Production Worker deployed with `DO_TURN_UPDATES`/`DO_DAILY_UPDATES`/`DO_BOT_UPDATES` all **false** (vars, operations.md:122); exactly **one** scheduler for the production database — the external `curl` crontab removed or confirmed absent (scheduled-jobs.md:68-73) | n/a (flags off) | release operator |
| canary (flag-on) | Enable `DO_TURN_UPDATES` (also gates accountStatus, scheduled-jobs.md gap 8) and watch **one full `*/30` tick**: `[scheduled] turn updates (/api/cronJobs/turns) ok` in `wrangler tail --env production --search '[scheduled]'`; then the bank_history double-tick check (§2) returns zero duplicates; then enable `DO_DAILY_UPDATES` before the next 04:00 UTC window and `DO_BOT_UPDATES` after daily's citizen growth | one full UTC day covering all four crons; bank_history check after each first firing | release operator |
| production | Steady state: every tick logs `ok`; a deliberately missed tick self-corrects (turns: next tick; daily: next day — scheduled-jobs.md per-job table) | 7 days **[proposed]**, daily tail of `[scheduled]` lines | ops review **[proposed]** |

### 1.4 Realtime DO pilot (`ChatRoomDO`)

Pilot is implemented on this branch but **pending preview deploy**
([realtime-pilot.md](realtime-pilot.md) header, §8). Production messaging
stays read-only (`NEXT_PUBLIC_DISABLE_SOCKET=true`,
realtime-pilot.md:582-583) until a separate decision.

| Stage | Entry criteria | Observation | Sign-off |
| --- | --- | --- | --- |
| local | Pilot suites green (chatDoCore, ChatRoomDO, workerDoRouter, realtimeTicket, realtimeTransport, realtimeDoClient — listed realtime-pilot.md §7 table); `wrangler dev` WS harness run per §8.2 (`--base-url http://127.0.0.1:8787`) passes: zero fanout shortfall, zero `messageError` | n/a | engineer |
| preview | Deploy with `NEXT_PUBLIC_REALTIME_TRANSPORT=do` in build env + preview vars (§7.9 steps 1-2); a staff account completes live send/receive + unread badge on `/messaging` | WS harness matrix §8.1 (3 runs each, concurrency 5/20/50, off-peak) with all **stop/fix thresholds** green (§2 below) | orchestrator + staff tester |
| internal test | Expand criteria met (§8.3 "expand cautiously": fanout correct at concurrency 50; p95 RTT < 500 ms at concurrency 20; no exceeded-CPU in tail) | 7 days of staff-only use **[proposed]** | ops review (the body the pilot budget names) |
| canary→production | **Open decision, not scheduled** — a separate go decision recorded in operations.md, per testing-coverage.md §4 item 7 (pick read-only vs pilot **before** cutover and ship the matching tests) | — | ops review **[proposed]** |

## 2. GO/NO-GO thresholds

Every number below is testable and carries its source. Run the full battery
at each ladder boundary; any single FAIL is a NO-GO.

| # | Gate | Threshold (testable form) | Source |
| --- | --- | --- | --- |
| G1 | Full test suite | `bun --no-env-file run test` exits 0 with 0 fail (currently 1656 pass / 3 opt-in skip across 169 files) | Existing gate; green this session (evidence table). Suite composition: package.json:28, testing-coverage.md §2 |
| G2 | Type check | `bun --no-env-file run check-types` exits 0 | Existing gate (package.json:26; CI draft cloudflare-ci.yaml:68-69); green this session |
| G3 | Cloudflare build | `bun run cloudflare:build` succeeds (webpack-pinned; do not substitute `next build` — Turbopack 404-chunk bug, cloudflare-modernization.md Stage 2) | Existing gate (package.json:11; cloudflare-ci.yaml:102-103) |
| G4 | Deploy smoke | `bun scripts/smoke-deploy.ts` exits 0 with `OK 10/10` (exit rule smoke-deploy.ts:339-340; the 10 checks :109-201) | Existing gate; **currently 8/10** due to the DB-path outage (evidence table) |
| G5 | Load run, error rate | `bun scripts/loadtest-preview.ts` at the gate scale (defaults: 30 s, 10 workers — loadtest-preview.ts:35-36) exits 0: error rate ≤ **1%** overall **and** per route, zero routes with zero successes | Existing threshold: `MAX_ERROR_RATE = 0.01` (loadtest-preview.ts:43) with failure rules at :259-276 (cited database-reliability.md:236-239); **currently 12.86% / 38.57% on `/api/config`** (evidence table) |
| G6 | Load run, static-page latency | p50 ≤ **150 ms** and p95 ≤ **2 000 ms** for `/` and `/account/login` at the G5 scale | **[proposed]**, justified from measured baselines: p50 57-73 ms and p95 1 074-1 529 ms this session (70 samples/route); p50 62-68 ms, p95 1.2-1.5 s in the 2026-10-14 incident record (database-reliability.md:267-268). p50 target ≈ 2× measured; p95 covers the documented cold-isolate seconds (database-reliability.md:243-245; smoke-deploy.ts:16-19) with 30-86% headroom |
| G7 | Load run, DB-backed latency | `/api/config` p95 ≤ **3 000 ms** at the G5 scale | **[proposed]**, justified: warm 200s measured ~40-50 ms, cold ~2.4 s (database-reliability.md:261-263), ~1.1 s during recovery (:271-272); 3 s bounds the cold path with margin. **Not evaluable until the outage is fixed** — treat as unevaluated, not passed |
| G8 | Cron integrity: zero double-applied ticks | The bank_history window check returns **zero** rows: at most one `ECONOMY` row per user per 30-min window and one `DAILY_RECRUIT` row per user per UTC day (SQL in §5). Only the cron services write these types (verified this session: `CronJob.service.ts:477-485` ECONOMY, `:367-375` DAILY_RECRUIT; the only other `ECONOMY` hit, `Bank.service.ts:321`, is a read filter) | Existing check definition: scheduled-jobs.md:74-77 ("each applied tick writes exactly one row per user") |
| G9 | Cron observability spot-check | After first flag-on tick and after any rollback: `wrangler tail --env production --search '[scheduled]'` across one `*/30` window shows `ok` lines, no `failed:`/`threw` (log grammar: workerCron.ts:120-139 via deploy-rollback.md table) | Existing procedure (deploy-rollback.md:294-297) |
| G10 | WS pilot — correctness (stop/fix) | `bun scripts/loadtest-chat.ts` exits 0: **zero fanout shortfall at any concurrency** (every connection saw every tempId), **zero `messageError`**; and at concurrency 20: p99 send RTT ≤ 2× the HTTP POST-equivalent p99; and the HTTP harness's p95 degrades ≤ 25% while the WS run is in flight | Existing thresholds: realtime-pilot.md §8.3 stop list (:667-671); harness failure rules loadtest-chat.ts:23-27 |
| G11 | WS pilot — expand bar | Fanout correct at concurrency **50**; p95 send RTT < **500 ms** at concurrency **20**; zero exceeded-CPU errors in `wrangler tail` during runs | Existing thresholds: realtime-pilot.md §8.3 expand list (:672-676) |
| G12 | Rollback drill | Steps 1/5/7 of the drill all print `OK 10/10` and the Worker is left serving `$NEW` (pass criteria deploy-rollback.md:187-189) | Existing drill (deploy-rollback.md) |
| G13 | Backup/restore drill | Dump completes, restore reports no fatal errors, per-table counts + `MAX(created_at)` match source vs scratch (database-reliability.md:130-132) | Existing drill (database-reliability.md) |
| G14 | Production prerequisites | Production Hyperdrive id is not the `0000…` placeholder (wrangler.jsonc:148; cloudflare-ci.yaml:32-35); every §6 secret/var present; external crontab absent from the production database host | Existing config facts |

G4/G5 failing today is expected and **owned by the infra outage**, not by
code: the same battery passes when the database path is healthy
(database-reliability.md:280-282). A NO-GO from G4/G5 at cutover time with
healthy infra is a genuine blocker, not noise.

## 3. Initial SLOs

Honest framing first: **nothing continuous exists.** No synthetic monitor,
no alerting, no saved-log query watches anything (scheduled-jobs.md gap 3,
":99-101"; deploy-rollback.md:273-276). Every "measured today" entry below
is on-demand or point-in-time. Targets marked **[proposed]**.

| SLO | Target | Measured today, with existing tooling | Cannot be measured yet |
| --- | --- | --- | --- |
| Availability (HTTP, public routes) | ≥ **99.0%** monthly **[proposed]** ≈ 7 h 18 min budget/month | Point-in-time only: `bun scripts/smoke-deploy.ts` (10 unauthenticated checks, exit code); per-deploy. Interim operational proxy: G4+G5 green before and after every deploy | Continuous uptime %; any alert when the site is down; authenticated-route availability (smoke is all-unauthenticated, testing-coverage.md gap 1) |
| Latency — static/SSR pages | p50 ≤ 150 ms, p95 ≤ 2 000 ms **[proposed]** (derivation in G6) | On-demand only: the load harness's per-route p50/p95/p99/max over a 30 s run (loadtest-preview.ts summary, database-reliability.md:216-239). Baselines: this session 57/73 ms p50 | Continuous latency percentiles; worker-side per-request duration (no `durationMs` emitter exists — deploy-rollback.md standard-fields table notes this) |
| Latency — DB-backed API (`/api/config`) | p95 ≤ 3 000 ms **[proposed]** (derivation in G7) | Same harness; healthy-path samples only exist as incident-era probes (40-50 ms warm, database-reliability.md:261-263) | Same as above, plus a healthy baseline at gate scale — blocked by the outage |
| Error rate | ≤ **1%** overall and per route over the standard 30 s × 10-worker run (existing harness rule, loadtest-preview.ts:43); tail shows no recurring 5xx cluster | Per-run: harness `errorRate`/`passed` fields. Spot: `wrangler tail --env <env> --status error` (deploy-rollback.md:247-256) | A time-series error budget; per-route error split for authenticated writes (harness sends no credentials, loadtest-preview.ts:21-26) |
| Realtime reconnect (pilot) | Reconnect succeeds within the client cadence (5 attempts, 1 s doubling to 30 s cap — realtime-pilot.md §3); DO transport auto-rejoins the open room after reconnect (§7.11); delivery-level SLOs = G10/G11 numbers | **Nothing measurable today**: the pilot is undeployed (realtime-pilot.md §8 header) and the harness measures RTT/fanout, not reconnect success rate | Reconnect success %, reconnect duration distribution, forced-fallback rate (`connectionFailed` → HTTP read-only mode) — all need a post-deploy procedure that does not exist yet **[proposed: define with the pilot rollout]** |
| Game-state integrity | **Zero** double-applied ticks per the G8 bank_history windows; zero duplicated economy writes (idempotency replay refused with 409 inside the 120 s TTL — api-contract.md §6); deposit→withdraw round-trip conserves balance | Manual SQL (G8) after each first-firing and each rollback; idempotency pinned by `src/middleware/idempotency.test.ts` + route tests (mocked Prisma); balance round-trip is a manual-checklist item (operations.md:130) | Continuous integrity monitoring; per-run ledger for `turns`/`daily` does not exist at all (scheduled-jobs.md gap 5 — only `bots` has `hasRunToday`); the G8 SQL today runs only when a human runs it |

## 4. Incident response

No severity ladder exists anywhere in the repo docs today; the following is
**[proposed]** and should be copied into operations.md when agreed (this
document does not modify it).

| Severity | Definition | First response window **[proposed]** |
| --- | --- | --- |
| SEV1 | Game-wide: production down, or **game-state corruption** (double-applied ticks, duplicated/lost economy writes) | Immediate |
| SEV2 | One workload degraded: DB path errors on production, a cron job failing repeatedly, realtime pilot unusable | Same day |
| SEV3 | Single flow broken (one route family 5xx, one page broken), no state risk | Next working day |
| SEV4 | Cosmetic/docs/degraded-but-working | Backlog |

### First diagnostics per failure domain

- **Worker (HTTP/SSR)** — deploy-rollback.md is the runbook.
  1. `bun scripts/smoke-deploy.ts` (or `--base-url <production URL>`) to
     scope which checks fail.
  2. `bunx wrangler tail --env production --status error`
     (deploy-rollback.md:247-256).
  3. Attribute to a version: `wrangler deployments list` + the correlation
     procedure (deploy-rollback.md:278-297) — use deployment timestamps,
     not upload order.
- **Database (Hyperdrive → tunnel → PgBouncer → Postgres)** —
  database-reliability.md + operations.md LAN database path.
  1. Isolate: do static pages pass while `/api/config` fails? (That exact
     signature is the recorded incident, database-reliability.md:266-282.)
  2. `docker logs private-lan-pg-tls` first, then origin Postgres
     (operations.md:157-158; database-reliability.md:144-146). The
     PgBouncer hop is tunnel-only and not directly probeable
     (database-reliability.md:274-275).
  3. Know the timeout signature: >15 s queries are canceled (SQLSTATE
     57014), wedged transactions die at 15 s (25P03), unreachable DB fails
     at 10 s (connectionTimeoutMillis) — database-reliability.md:153-189.
  4. A DB-path failure is **infra-owned**; rolling back the Worker does not
     touch this layer.
- **Realtime (DO pilot)** — realtime-pilot.md.
  1. Client-side: failure lands in `connectionFailed` → HTTP read-only
     fallback + banner retry (§7.7) — messaging reads keep working over
     HTTP; sends are the loss.
  2. `wrangler tail --env preview` for DO errors during harness/manual use;
     re-run `scripts/loadtest-chat.ts` (§8.2) to reproduce.
  3. Rollback = redeploy the previous build (flag is build-time; no data or
     migration to undo — §7.7).
- **Scheduled jobs** — scheduled-jobs.md.
  1. `bunx wrangler tail --env production --search '[scheduled]'`
     (deploy-rollback.md:259-269). **Past Cron Events always shows success**
     — the fan-out catches every error so `waitUntil` never rejects
     (scheduled-jobs.md:78-85, gap 4); the log stream is the only failure
     signal.
  2. Per-job meaning and safe re-run rules: the per-job table
     (scheduled-jobs.md) — `bots`/`accountStatus` re-runs are safe;
     `turns`/`daily` re-runs double-apply.
  3. Nothing alerts (gap 3): a missed tick is found by a human tailing or
     by players; check the last `[scheduled]` lines for each job daily
     during rollout.

### Escalation and rollback decision rules

1. **Attribute before acting** (deploy-rollback.md:278-297). If errors
   predate the newest deployment in the window, the cause is config or
   data — a rollback will not help and the fix is forward.
2. **Roll back when**: smoke fails on routes that were passing, AND the
   failure window aligns with the bad deployment's `Created on`. Command:
   `bunx wrangler rollback <VERSION_ID> --env production --message "…"`
   (deploy-rollback.md:42-57; pass `--message` always — it skips the
   interactive prompt).
3. **Do not roll back when**: the signature is the DB path (static pages
   fast, `/api/config` hanging/5xx — forward infra fix per the incident
   record), the motive is a bad migration (schema is forward-only; deploy a
   forward-fix — deploy-rollback.md:59-84), or bound resources changed
   (rollback is refused; re-verify the binding set first).
4. **After any rollback**: re-run smoke, and tail `[scheduled]` across one
   `*/30` tick on production (deploy-rollback.md:294-297); run the G8
   double-tick check for the rollback window (§5).
5. **Escalation path [proposed]**: responder → release operator → ops
   review, with the Forgejo issue tracker as the incident record (the
   2026-10-14 incident itself is recorded in-repo,
   database-reliability.md:266-282 — follow that pattern).

## 5. Rollback safety for committed game actions

What `wrangler rollback` does and does not undo (deploy-rollback.md:59-84
is authoritative; this section applies it to game state):

1. **Schema is forward-only.** Migrations are operator-run before deploy;
   the CLI has only `status` and `apply` — no down command
   (scripts/db-migrate.ts:44 via deploy-rollback.md:60-70). The rolled-back
   code runs against the newer schema: migrations must stay
   backward-compatible with the release you would roll back to.
2. **Rows already written survive.** Gold spent, attacks resolved,
   messages sent, ticks applied — none are undone. Data repair is manual
   SQL and explicitly outside the runbook (deploy-rollback.md:77-81).
3. **Out-of-band state persists.** Secrets, vars, Hyperdrive resources
   rotated since the target version stay in effect
   (deploy-rollback.md:71-76).

### Avoiding double-applied ticks during a rollback window

- The Cron Triggers belong to the Worker deployment: after a rollback the
  (older) version's `scheduled()` fan-out keeps firing — the rollback
  itself does **not** add a second scheduler. Doubling only enters if a
  second scheduler exists or a human re-runs a job.
- **Exactly one scheduler per database** (scheduled-jobs.md:68-73): keep
  the Cron Triggers, keep the external `curl` crontab absent. Beware the
  cadence trap — the legacy crontab fires daily 00:00/bots 00:30 UTC while
  Triggers fire 04:00/04:30, so a leftover crontab double-applies at two
  different times of day, which is harder to spot (scheduled-jobs.md:63-67).
- **Never manually re-run `turns` or `daily` to "catch up" during or after
  a rollback** — a full re-run re-applies a tick (+turn, gold income,
  citizen growth) to every participant; the guidance is to wait for the
  next `*/30` tick (scheduled-jobs.md:23, :41-44). `bots` (same-day
  `hasRunToday` guard) and `accountStatus` (derived writes) are the only
  safe re-runs.

### Reconciliation checks after the window

Run all three once the Worker is stable again, and record the outcome in
the incident record:

1. **Double-tick check (G8)** — zero rows from:
   ```sql
   -- turns: at most one ECONOMY row per user per 30-minute window
   SELECT user_id, date_trunc('hour', date_time)
          + INTERVAL '30 min' * FLOOR(EXTRACT(minute FROM date_time) / 30) AS win,
          COUNT(*)
   FROM bank_history
   WHERE history_type = 'ECONOMY' AND date_time >= '<window start>'
   GROUP BY 1, 2 HAVING COUNT(*) > 1;

   -- daily: at most one DAILY_RECRUIT row per user per UTC day
   SELECT user_id, date_trunc('day', date_time) AS day, COUNT(*)
   FROM bank_history
   WHERE history_type = 'DAILY_RECRUIT' AND date_time >= '<window start>'
   GROUP BY 1, 2 HAVING COUNT(*) > 1;
   ```
   Basis: each applied tick writes exactly one row per user
   (scheduled-jobs.md:74-77); writers verified this session at
   `CronJob.service.ts:477-485` (ECONOMY) and `:367-375` (DAILY_RECRUIT).
   Note the daily job also deletes history older than 20 days
   (scheduled-jobs.md per-job table), so scope the window to recent time.
2. **Economy-write spot audit**: for one sampled player, deposit → history
   → withdraw over the incident window and confirm the balance delta equals
   the sum of surviving `bank_history` rows (manual; the balance round-trip
   is an existing checklist item, operations.md:130).
3. **Scheduler audit**: `crontab -l` on the legacy host shows no
   `cronJobs` entries for the production database, and tail shows exactly
   one `[scheduled]` line set per tick window.

## 6. Final cutover checklist

**DNS/routing.** No production route/custom-domain configuration exists in
the repo today — the only production-looking hostname in-tree is
`alpha.openthrone.dev` as the Cypress target (package.json:37);
**[assumption: that is the intended public host — confirm at cutover]**.
Checklist: choose the public hostname; attach it to the `openthrone` Worker
(route or custom domain); set `NEXTAUTH_URL` and `NEXT_PUBLIC_URL_ROOT`
vars to the final origin (operations.md:122 — the preview values live at
wrangler.jsonc:112-113); keep the preview Worker on workers.dev as the
staging surface; verify Turnstile site vars match the public origin.
The production host's `curl` crontab calls the app's local address, not
`openthrone.dev` (pinned 2026-11-11), so moving the domain does not move the
scheduler; scheduling stays on the legacy host until the Cron Triggers take
over under the exactly-one-scheduler rule.

**Secrets and vars inventory (names only — never values).** Per-env
Worker secrets (operations.md:120-121): `NEXTAUTH_SECRET`, `JWT_SECRET`,
`TASK_SECRET`, `TURNSTILE_SECRET` (the `NEXT_PUBLIC_TURNSTILE_SECRET`
legacy name maps to the same server-only secret,
cloudflare-modernization.md:62), `API_TOKEN_PEPPER`, `ANTI_ABUSE_SALT`,
`MAIL_PROVIDER_API_KEY` when `MAIL_DRIVER=http` (provider key name from the
mapping table, cloudflare-modernization.md:60). Additional names in the
mapping: `REVALIDATION_SECRET` (cloudflare-modernization.md:59;
api-contract.md:107), `POSTGRES_PRISMA_URL` fallback secret (:56), the
`AWS_*` set only if S3 avatars are enabled (:61). Plain vars:
`NEXTAUTH_URL`, `NEXT_PUBLIC_URL_ROOT`, `DO_TURN_UPDATES`,
`DO_DAILY_UPDATES`, `DO_BOT_UPDATES` (production only),
`TURN_INTERVAL_MINUTES` kept aligned with the `*/30` cron,
`MAIL_DRIVER` (operations.md:122). Build-time `NEXT_PUBLIC_*` flags must be
present in the build environment (operations.md:123;
cloudflare-modernization.md:52). CI-only secrets:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
(cloudflare-ci.yaml:126-127). Verify each with `wrangler secret list` /
`wrangler versions secret list` against this list before switch.

**Data.** Migration ownership is the release operator's, once per release:
`db-migrate.ts status --env production` → `apply --env production
--confirm-production` → deploy (database-reliability.md:10-29, :53-60).
Backup/restore drill must have passed recently on the target instance
(pass criteria database-reliability.md:130-132; the written drill targets
LAN staging — a production-instance drill is **[proposed: operator
decision]**). Confirm the scratch-db cleanup and that no restore was ever
pointed at the live database (database-reliability.md:147-148).

**Monitoring activation.** Honest state: none exists. Minimum activation
for cutover **[proposed]**: (a) a scheduled runner (the CI runner, once
registered) executing smoke + load run against production on a cadence and
filing a failure as a Forgejo issue; (b) a daily human check of
`[scheduled]` tail lines during the first week; (c) Workers Logs retention
enabled so `--status error` queries have history. Until (a) exists, the
SLOs in §3 are unmeasured commitments, not envelopes.

**Support communication.** Mechanisms that exist: the disabled-login gate
`NEXT_PUBLIC_DISABLE_LOGIN=true` (staff-only maintenance mode,
scheduled-jobs.md "Disabled login" — rebuild required per toggle) and
`NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE` (cloudflare-modernization.md:65).
No support inbox/runbook exists **[gap — decide where player reports land
before cutover]**. Pre-cutover data caveat to communicate: stale
failed-login activity rows from the old runtime are tracked by Forgejo
issue #11 and are not cleaned by this branch (scheduled-jobs.md:86).

**Decommission conditions for the Node/custom-server path
[proposed — none of these are met today]:**

1. Production Worker has served all public traffic for ≥ 30 consecutive
   days within the §3 SLOs.
2. The messaging posture decision is executed and recorded (DO pilot
   promoted per §8.3, or read-only formally accepted) — the decision item
   itself is testing-coverage.md §4 item 7.
3. Exactly-one-scheduler rule enforced: the external `curl` crontab removed
   from the production database's host (scheduled-jobs.md:68-73).
4. A rollback drill has been executed successfully on the production
   deployment path at least once (the written drill is preview-scoped,
   deploy-rollback.md:86-90 — a production drill is an operator decision).
5. One era-start or equally invasive admin operation has been executed
   successfully on the Workers runtime (currently manual-checklist-only,
   testing-coverage.md admin rows).

The Node runtime is **not** deleted at decommission: it remains the local
development runtime (operations.md:114) and Socket.IO remains the realtime
rollback path for the pilot (realtime-pilot.md §7.7). Decommission here
means: production traffic, production cron scheduling, and the legacy
crontab all live only on the Workers path.

## 7. Known-open blockers

1. **Preview database-path outage (infra-owned, open).** Recorded
   2026-10-14 (database-reliability.md:266-282): `/api/config` intermittently
   wedges (23.3% errors, p95 at the 15 s ceiling) while static pages stay
   fast; suspects are `private-lan-cloudflared` or `private-lan-pg-tls` PgBouncer
   on the LAN Docker host. **Still failing at authoring time** — this session's smoke
   is 8/10 and the gate-scale load run fails at 12.86% overall / 38.57% on
   `/api/config`; additionally `battle-users` (a DB-backed SSR page,
   `src/pages/battle/users.tsx:1043-1051`) returned 500, extending the
   incident's blast radius beyond `/api/config`. Blocks G4, G5, G7 and the
   Hyperdrive ladder's preview stage; also blocks any trust in preview as a
   DB-path proxy for production.
2. **CI is inert.** `.forgejo/workflows/cloudflare-ci.yaml` is a draft with
   no registered Forgejo runner (cloudflare-ci.yaml:1-5); nothing enforces
   G1-G4 on push (testing-coverage.md gap 2, :116-118). The promotion gate
   this document leans on does not exist until the runner is registered
   (testing-coverage.md §4 item 6; tracked as issue #22 work).
3. **Realtime DO pilot: §8.3 ladder ran 2026-10-19 — verdict STOP / fix
   first.** Update 2026-11-11: the per-request Prisma memory ceiling is
   fixed (one client per isolate, realtime-pilot.md §8 "Fix 3"; no
   `exceededMemory` at 50 concurrent DB-bound requests on the rehearsal);
   the chat send ladder still has to be re-run before the verdict changes. The pilot is implemented, deployed to the preview and the
   production-connected rehearsal (2026-10-16, realtime-pilot.md §7.13),
   and redeployed with the merged master code on 2026-10-18. The full
   concurrency ladder (5/20/50, driver at
   `dogfood-output/rt-ladder-2026-10-18/ladder.mjs`) ran after the
   operator enabled `ENABLE_MESSAGING` on staging: sends collapse from 5
   concurrent senders per room upward (serialized room-lock transactions
   exceed Prisma's 5 s interactive timeout on the staging path) and the
   worker hit its 128 MiB memory ceiling 28 times at rung 50. Numbers and
   fix options in realtime-pilot.md §8. The cutover messaging-posture
   decision (blocker 4, item 7) stays open with it: production stays
   read-only until the send path is fixed and the rehearsal manual
   exercise records production-path RTT.
4. **Must-fix coverage gaps from [testing-coverage.md](testing-coverage.md)
   §4** (the teammate's minimum-before-production list — all seven are
   gate-relevant). Status 2026-10-18, after the master merge:
   - item 1: no authenticated end-to-end smoke has ever run against a
     deployed Worker — the single highest-value addition (closes gaps 1, 5,
     6 at composition level). **Still open** (the 2026-10-16 DO pilot
     verification was scripted-but-synthetic, not an authenticated smoke of
     the deployed app surface);
   - item 2: password-reset emailed-token route chain — **closed**
     (`src/__tests__/pages/api/account/password-reset-chain.api.test.ts`,
     11 tests: full chain on real AuthService/AccountService through the
     mailer facade, single-use/expiry/anti-enumeration, shared
     `password_reset` profile, service-level attempt caps);
   - item 3: alliance create/join untested — **closed for the core
     lifecycle** (`src/__tests__/pages/api/alliances/` +5 files, 71 tests:
     create/getAll/[id], join + request lifecycle, update, bank writes with
     idempotency, wars declare/index); the remaining alliance surface
     (leave/disband/roles/lists/loans/intel/…) is follow-up, not
     minimum-before-production;
   - item 4: `POST /api/attack/[id]` and `/api/training/train` route
     tests — **closed**
     (`src/__tests__/pages/api/attack/attackExecution.api.test.ts`,
     `src/__tests__/pages/api/training/{train,convert}.api.test.ts`, 40
     tests: confirm-gate envelopes, realtime-facade emission, audit,
     idempotency, delegation and sanitization);
   - item 5: an automated cron tick check — **closed**
     (`src/__tests__/pages/api/cronJobs/turns.api.test.ts`, 6 tests:
     scheduled() dispatch → self-reference → endpoint →
     `CronJobService.processTurnUpdates`, secret/flag refusals, no-retry);
   - item 6: register the runner and activate the gate (= blocker 2) —
     **still open**;
   - item 7: decide and test the production messaging posture (= blocker
     3's decision half) — **still open**, ladder blocked on preview
     migrations.
5. **Production Hyperdrive: resolved.** `env.production.hyperdrive[0].id`
   now carries a real resource id (wrangler.jsonc env.production; the
   rehearsal env binds the same resource against production Supabase, and
   the 2026-10-18 rehearsal deploy of the merged code served
   `/__rehearsal/health` → `{"ready":true}`). The placeholder caveat is
   historical.
6. **No alerting/monitoring whatsoever** (scheduled-jobs.md gap 3;
   deploy-rollback.md:273-276): the §3 SLOs have no continuous measurement,
   and cron failures are detectable only by a human tailing.
7. **PgBouncer pool mode is unrecorded** (database-reliability.md:136-139):
   if it runs transaction pooling, `pg_dump` through the TLS front door may
   fail — the drill has a documented fallback, but the unknown weakens G13's
   guarantee for the path production will actually use.
8. **Preview staging database has not run the master-v0.4.1 migrations**
   (operator action; recorded 2026-10-18, Forgejo issue #110 item 5). The
   merged branch carries 15 new migrations plus hardened variants of two
   existing ones; `db-migrate.ts apply --env preview` needs the
   operator-held `PREVIEW_POSTGRES_URL_NON_POOLING`. Until it runs: new
   alliance/event features error on the preview, and the merged
   `ENABLE_MESSAGING` setting falls back to false (messaging admin-only),
   which also blocks the §8.3 ladder (blocker 3). The production database
   already has these migrations (the LXC released v0.4.1), so the
   production cutover path is unaffected; the two re-contented migrations
   were taken from master and their checksums match what production
   applied.
