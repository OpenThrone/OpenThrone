# Scheduled jobs

Every scheduled game job is an HTTP endpoint under `src/pages/api/cronJobs/`,
fired either by a Cloudflare Cron Trigger (via the `scheduled()` entry in
`worker.ts`, fan-out in `src/lib/workerCron.ts`) or by an external `curl` crontab. This page documents, per job:
trigger, owner, schedule, what actually happens on failure today, the
idempotency mechanism, and the failure-recovery path. Endpoint auth and cadence
conventions are in [operations](operations.md#scheduled-tasks-and-bots); the
Cloudflare cautions live in [operations](operations.md#cloudflare-deployment).

> **Auth contract:** each endpoint requires its `DO_*` enable flag to equal
> `true` and an `Authorization` header containing the raw `TASK_SECRET` value
> (no `Bearer` prefix), compared with `timingSafeEqual`
> (`src/pages/api/cronJobs/turns.ts:15-33`). A missing flag or secret returns
> `401 Unauthorized or Disabled Task` (`turns.ts:36-37`); the fan-out logs a
> warning when `TASK_SECRET` is unset in the Worker environment
> (`src/lib/workerCron.ts:105-109`).

## Production scheduler (since 2026-11-11)

Production's turns, account status and daily updates are driven by the
`openthrone` Worker's Cron Triggers (`wrangler deploy --env production`), not
by the production host's crontab. The Worker has no route and no workers.dev
address; the triggers reach the endpoints through `WORKER_SELF_REFERENCE`, and
the Worker's own `TASK_SECRET` is held only there. The production host keeps
only its `/api/general/revalidate` crontab line (it refreshes that host's own
page cache), and its `DO_TURN_UPDATES` / `DO_DAILY_UPDATES` are `false`, so its
cron endpoints refuse every call.

| Job | Cron Triggers (UTC) | When it runs |
| --- | --- | --- |
| Turns, then account status | `*/30 * * * *` | Every 30 minutes, sequentially |
| Daily | `0 4 * * *` and `0 5 * * *` | Only on the one that is midnight in New York (`isOtMidnight`): 04:00 UTC in summer, 05:00 UTC in winter |
| Bots | not scheduled | Production does not run bots |

The Worker uses targeted placement next to the database
(`"placement": {"mode": "targeted", "region": "aws:us-east-1"}`). Without it,
Cron Triggers run in whichever Cloudflare data center is quiet: on
2026-11-11 a far one stretched turns from 7 s to 47–56 s and account status to
149–180 s, with under 2 s of CPU (the rest was query round trips). With
placement, turns took 5.3 s and account status 16 s, in line with the old host.

Duplicate deliveries are skipped by the endpoints: turns skips when a `turns`
run succeeded or is running within two thirds of `TURN_INTERVAL_MINUTES`, and
daily skips when a `daily` run did so since the current game day began at
OT midnight (`hasCronRunSince` in `src/services/CronRun.service.ts`), so an
off-schedule daily earlier in the day never blocks the next midnight run. Both answer
`200 {"skipped": true}`. Failed runs never count. The check is not atomic: two
deliveries at the same instant can both pass.

## Per-job reference

| Job | Trigger | Owner | Schedule | Retry policy (as built) | Idempotency mechanism | Failure recovery |
| --- | --- | --- | --- | --- | --- | --- |
| Turn updates | Cron `*/30 * * * *` (`wrangler.jsonc:17`) → `POST /api/cronJobs/turns` through `WORKER_SELF_REFERENCE` (`src/lib/workerCron.ts:36`, `src/lib/workerCron.ts:112-125`); legacy curl: `*/30 * * * *` (`operations.md:29`) | `CronJobService.processTurnUpdates` (`CronJob.service.ts:174`), handler `turns.ts:35-57` | Every 30 min, must match `TURN_INTERVAL_MINUTES` (default 30) (`src/lib/workerCron.ts:20-22`, `operations.md:33`). Game: +1 attack turn, per-turn gold income (event-multiplied, capped), +1 stamina to cap, rank write (`CronJob.service.ts:493-505`) | No Cron Trigger re-run: `runCronTargets` catches every per-target error and non-ok status (`src/lib/workerCron.ts:126-147`), so the `waitUntil` promise never rejects and the invocation is always recorded as a success (Cloudflare `scheduled()` contract, see [double scheduler](#double-scheduler)). In-run, each user is requeued up to 3 attempts (`CronJob.service.ts:218-228`); exhausted users are counted `failed` and logged (`CronJob.service.ts:224-226`). Partial failure still returns HTTP 200 with `processed`/`failed` (`turns.ts:43-49`); HTTP 500 only when the whole run throws (`turns.ts:50-56`). The only automatic retry is the next `*/30` tick | Per-user `$transaction` locks exactly that `users` row `FOR UPDATE` (`CronJob.service.ts:305-310`), re-reads it under the lock (`CronJob.service.ts:461-464`), and writes gold/turns as relative increments under bounded options — 10 s timeout, 5 s maxWait (`CronJob.service.ts:23-26`) — so a retried user cannot overwrite a player action committed in between. Covered by `src/services/__tests__/cronJob.concurrency.test.ts:285-296`, `:334-343` | Detect: `bunx wrangler tail --env production` → `[scheduled] turn updates (/api/cronJobs/turns) failed: 500` (`src/lib/workerCron.ts:130-134`, `operations.md:128`) plus per-user `Failed to update user <id> after 3 attempts.` error lines (`CronJob.service.ts:224-226`). The Past Cron Events dashboard will show success (see gaps). Manual re-run: [commands](#manual-re-run). **Not** safe to blind re-run: a full re-run re-applies a tick (+turn income, +attack turn) to every participant — prefer waiting for the next 30-min tick |
| Daily updates | Crons `0 4 * * *` and `0 5 * * *` (`wrangler.jsonc`), filtered to New York midnight by `isOtMidnight` (`src/lib/workerCron.ts`) → `POST /api/cronJobs/daily` (`src/lib/workerCron.ts:37`); legacy curl: `0 0 * * *` (`operations.md:28`) | `CronJobService.processDailyUpdates` (`CronJob.service.ts:107`), handler `daily.ts:35-57` | Midnight New York time (04:00 UTC in summer, 05:00 UTC in winter). Game: recruiting-bonus citizen growth with `DAILY_RECRUIT` history (`CronJob.service.ts:344-382`), wounded-unit healing (`CronJob.service.ts:398-445`), 20-day cleanup of `attack_log`/`bank_history`/`recruit_history` + login-telemetry pruning (`CronJob.service.ts:535-568`) | Same as turns: no platform re-run; 3-attempt requeue for the recruit tick (`CronJob.service.ts:143-152`). Wounded healing is fire-once per user — its failure is logged, never retried (`CronJob.service.ts:132-137`, `CronJob.service.ts:442-444`). HTTP semantics identical to turns (`daily.ts:43-56`) | Same single-row `FOR UPDATE` lock + re-read for citizens (`CronJob.service.ts:318-327`) and for the wounded pool (`CronJob.service.ts:401-414`, test at `cronJob.concurrency.test.ts:421-460`); citizens applied as `increment` upserts (`CronJob.service.ts:344-365`). Cleanup is date-threshold `deleteMany`, so re-running it is a no-op (`CronJob.service.ts:550-567`) | Same tail detection (`daily updates ... failed:`). Safe to re-run: only the cleanup portion (threshold deletes). A manual full re-run **double-applies** citizen growth and can heal twice in a day for already-processed users — the endpoint has no per-run marker. A missed day self-corrects next run (units stay wounded, citizens arrive late); re-run manually only after a total failure (e.g. 500 from `ensureActiveEra`) and record that it happened |
| Bot tick | Cron `30 4 * * *` (`wrangler.jsonc:19`) → `POST /api/cronJobs/bots` (`src/lib/workerCron.ts:38`); legacy curl: `30 0 * * *` (`operations.md:30`) | `BotService.runDailyBotTick` (`Bot.service.ts:256`), handler `bots.ts:35-60` | 04:30 UTC daily, after daily's citizen growth (`src/lib/workerCron.ts:22`, `operations.md:22`). Game: bots are assigned RECRUIT/TRAIN/IDLE slots by a date-seeded deterministic shuffle (`Bot.service.ts:69-91`, `Bot.service.ts:284-292`) | No platform re-run; no in-run retry of a failed bot — the error is captured as a `failed` result row (`Bot.service.ts:300-312`). The endpoint **always returns 200** with `byStatus` counts (`bots.ts:45-53`); HTTP 500 only if the tick itself throws (`bots.ts:54-59`). `botLastRunAt` is stamped even for failed actions (`Bot.service.ts:316-324`), so a failed bot is not retried until the next day | Run-level: `hasRunToday` skips bots whose `botLastRunAt` is on/after start of day (`Bot.service.ts:177-181`, filtered at `Bot.service.ts:283`) — a same-day re-run is a no-op for processed bots. Slot assignment is deterministic per calendar day (`dailySeed`, `Bot.service.ts:69-76`) | Detect: `[scheduled] bot tick ... failed:` log line, or `byStatus.failed > 0` in the response body (`bots.ts:49-52`). Safe to re-run same day (processed bots are skipped). A bot whose action failed stays failed until tomorrow; repair the roster with `bun run scripts/seed-bots.ts` (`operations.md:37`) |
| Account status maintenance | Cron `*/30 * * * *`, after turns (`src/lib/workerCron.ts`) → `POST /api/cronJobs/accountStatus` (`src/lib/workerCron.ts:39-43`); legacy curl: no example line exists (`operations.md:25-31` covers daily/turns/bots only) — same curl pattern applies | `CronJobService.processAccountStatusUpdates` (`CronJob.service.ts:246`), handler `accountStatus.ts:35-60` | Every 30 minutes, matching the production crontab it replaced. Game: normalizes status history — expired blocks revert to ACTIVE, >60-day idle → IDLE, returning users → ACTIVE; CLOSED/BANNED/SUSPENDED/VACATION are never rewritten (`User.service.ts:283-360`) | No platform re-run; 3-attempt requeue per user (`CronJob.service.ts:269-287`); HTTP semantics same as turns (`accountStatus.ts:46-60`). Shares the `DO_TURN_UPDATES` enable flag (`accountStatus.ts:39`) | `getUpdatedStatus` locks the user row `FOR UPDATE` inside a transaction (`User.service.ts:253-255`) and inserts history rows only on transitions derived from current state (`User.service.ts:269-360`) — a re-run makes no changes unless the state changed since | Same tail detection. Safe to re-run: yes — writes are derived state with no increments; a re-run is effectively a no-op for already-processed users |

## Manual re-run

All four jobs can be re-run by hand with the same contract the schedulers use
(replace `<host>` and read the secret from the environment; do not paste it
into shell history or logs):

```sh
curl --fail -X POST -H "Authorization: $TASK_SECRET" https://<host>/api/cronJobs/turns
curl --fail -X POST -H "Authorization: $TASK_SECRET" https://<host>/api/cronJobs/daily
curl --fail -X POST -H "Authorization: $TASK_SECRET" https://<host>/api/cronJobs/bots
curl --fail -X POST -H "Authorization: $TASK_SECRET" https://<host>/api/cronJobs/accountStatus
```

Safety summary: `bots` and `accountStatus` re-runs are safe (run-level
`hasRunToday` guard; derived status writes). `turns` and `daily` refuse a
re-run while a recent run succeeded or is still running (see
[Production scheduler](#production-scheduler-since-2026-11-11)); a failed run
can be re-run at once. Add `?force=true` to the URL to re-run anyway, which
re-applies the tick to every participant — use it only for a run that
recorded success but did not apply, once, and record that it happened.

## Double scheduler

The external `curl` crontab (`operations.md:27-31`) and the Cloudflare Cron
Triggers (`wrangler.jsonc:15-22`) both drive the same endpoints with the same
raw `TASK_SECRET` header. Today both are documented as live options, and
`operations.md:135` already carries the caution: pick one per database.

- **State corruption: not the risk.** Overlapping runs serialize per user on
  the single-row `FOR UPDATE` locks and re-read committed state before writing
  (`CronJob.service.ts:305-310`), and the worker fans out sequentially so the
  daily/bot pair cannot overlap each other (`src/lib/workerCron.ts:110-111`). The lock
  behavior is pinned by `src/services/__tests__/cronJob.concurrency.test.ts:285-296`.
- **Double-applied ticks: the real risk.** `turns`, `daily` and
  `accountStatus` have no run-level marker, so a second scheduler re-applies
  the tick (gold + attack turn, citizen growth). Only `bots` is protected by
  `hasRunToday` (`Bot.service.ts:177-181`). Stale rank snapshots can also
  interleave between two runs (`CronJob.service.ts:192-203`, `:499`).
- **The cadences differ between the two docs.** The legacy crontab fires daily
  at 00:00 and bots at 00:30 UTC (`operations.md:28-30`); the Cron Triggers
  fire daily at 04:00 and bots at 04:30 UTC (`src/lib/workerCron.ts:35-44`). Following the
  old crontab while Triggers are live therefore double-applies at two separate
  times of day, which is harder to spot than a same-minute overlap.
- **Recommendation:** exactly one scheduler per database. On the Workers
  deployment keep the Cron Triggers and do not install the external crontab;
  the legacy crontab remains the mechanism for the non-Workers (custom server)
  runtime. Preview has no cron triggers on purpose
  (`wrangler.jsonc:47-48`, `wrangler.jsonc:64-66`; `operations.md:134`) —
  never enable `DO_*` flags on a preview that shares the production database.
  To detect accidental doubling, count `bank_history` rows with
  `history_type` `ECONOMY` / `DAILY_RECRUIT` per interval window
  (`CronJob.service.ts:477-492`, `CronJob.service.ts:367-382`): each applied
  tick writes exactly one row per user.
- **Platform retry caveat:** Cloudflare records a cron invocation's status
  from the first failing `ctx.waitUntil`, and otherwise reports it as a
  success (Workers `scheduled()` handler docs). Because `runCronTargets`
  (`src/lib/workerCron.ts`) catches every per-target failure
  (`src/lib/workerCron.ts:126-147`), the
  `waitUntil` never rejects — so Past Cron Events always shows success and the
  runtime's failure/retry path is never exercised. Failure signals live only
  in the log stream (`wrangler tail`, `operations.md:128`).

## Known gaps (issue #21)

What is **not** true yet, honestly:

1. **No queue or workflow offload for long jobs.** `wrangler.jsonc` declares
   no Queues, Workflows, KV, D1 or Durable Object bindings — each job is one
   long HTTP request inside a single scheduled invocation, bounded by the
   Workers 15-minute scheduled duration limit. A very large player base could
   approach that limit on the daily job.
2. **No platform-level retry.** `src/lib/workerCron.ts:126-147` swallows all failures, so
   a fully failed run is never re-driven by the runtime; the next scheduled
   tick (30 min for turns, next day otherwise) is the only automatic retry.
   `controller.noRetry()` is never called because nothing ever throws.
3. **No automated failure alerting.** Nothing watches the
   `[scheduled] ... failed:` log lines or Past Cron Events; detection is a
   human running `wrangler tail` (`operations.md:128`).
4. **Dashboard status is not a failure signal.** As above — invocations are
   always recorded as successes, so Past Cron Events cannot be used to detect
   outages.
5. **Run-level idempotency exists only for bots.** `turns`/`daily` re-running
   double-applies and `accountStatus` re-runs are safe only incidentally
   (derived writes); there is no per-run ledger or claim marker.
6. **Endpoint partial-failure HTTP semantics untested.**
   `src/services/__tests__/cronJob.concurrency.test.ts` pins the per-user
   lock/re-read/increment semantics (`:285-296`, `:298-332`, `:421-460`), and
   `src/lib/__tests__/workerCron.test.ts` now covers the fan-out boundary
   (cron-to-endpoint mapping, missing `TASK_SECRET`, partial-failure
   isolation, duplicate delivery, disabled flags). No test exercises the
   endpoint partial-failure HTTP semantics (`turns.ts:43-56`); there is no
   test directory under `src/pages/api/cronJobs/`.
7. **Failed bot actions are silently skipped until the next day** —
   `botLastRunAt` is stamped even when the action failed
   (`Bot.service.ts:316-324`).
8. **`accountStatus` cannot be toggled independently** — it gates on the
   `DO_TURN_UPDATES` flag shared with turns (`accountStatus.ts:39`).
9. **The fan-out always uses the `default` bot schedule** — `src/lib/workerCron.ts:112-125`
   sends no `?schedule=` query, so the parameter supported by
   `bots.ts:41-43` is unused by the Cron Trigger path.

## Job-addition checklist

1. Implement the service method with the per-user pattern: `$transaction` +
   single-row `FOR UPDATE` lock + re-read under the lock + relative
   increments, using `CRON_USER_TX_OPTIONS` (`CronJob.service.ts:23-26`,
   `CronJob.service.ts:305-310`).
2. Add the handler under `src/pages/api/cronJobs/` copying the existing
   shape: `withApiGuard` with `POST` / `authMode: 'none'` /
   `rateLimitProfile: 'admin'` (30 req/min, `apiGuard.ts:44-46`) plus
   `isAuthorizedTaskRequest` and its own `DO_*` enable flag
   (`turns.ts:9-37`).
3. Map it in `CRON_TARGETS` (`src/lib/workerCron.ts:35-44`) and declare the identical
   cron expression in `wrangler.jsonc` `triggers.crons` (`wrangler.jsonc:15-22`)
   — the fan-out matches targets by exact string equality (`src/lib/workerCron.ts:165-167`).
4. Keep cadence aligned with the game constants (e.g. `TURN_INTERVAL_MINUTES`
   for turn-driven work; `src/lib/workerCron.ts:20-22`, `operations.md:33`).
5. Add a `bun test` suite covering the new job's lock and retry semantics,
   modeled on `cronJob.concurrency.test.ts`.
6. Add the row to the endpoint table in [operations](operations.md#scheduled-tasks-and-bots)
   and, for non-Workers deployments, a crontab example line.
7. Choose exactly one scheduler for the job (Cron Trigger **or** external
   crontab — never both, per the caution above and `operations.md:135`).
