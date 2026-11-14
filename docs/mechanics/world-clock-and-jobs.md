# World clock and scheduled jobs

Last verified against code: 2026-11-13 (alpha 4138222f)

The game runs on one clock, called OT Time, and on a few scheduled jobs: a turn job that pays income and attack turns, a daily job that grows and heals armies and cleans up, an account-status job, a shadow chat moderation job, and a bot job. This page explains the clock, what each job does, and how runs are recorded.

## Rules

### OT Time and the game day

- OT Time is the instant read in the `America/New_York` zone, with daylight saving handled. It is the zone for every daily rule (caps, pressure, recruiting, crons, analytics) and for every displayed "OT Time", regardless of the server's or the viewer's own zone ([timefunctions.ts](../../src/utils/timefunctions.ts)).
- The sidebar shows the current OT Time. Admin date pickers for timed resets are entered in OT Time and converted to UTC.
- The **game day** is a real calendar day in OT Time by default. Game-day boundaries align to OT midnight. An accelerated test server can shorten it with `GAME_DAY_MINUTES` (or `NEXT_PUBLIC_GAME_DAY_MINUTES` for the browser); the value must be a whole number of minutes that divides 1,440 evenly, otherwise the code falls back to a real day. A game-day key is `YYYY-MM-DD`, or `YYYY-MM-DD#n` on an accelerated server.
- Fixed-window "per day" limits, such as bank deposit cooldowns, use a rolling window of one game-day length instead of calendar boundaries.
- The **turn interval** is 30 minutes by default. `TURN_INTERVAL_MINUTES` (or the `NEXT_PUBLIC_` form) changes what the application believes; it does not change when the external scheduler fires ([Turns.ts](../../src/constants/Turns.ts)). The sidebar countdown rounds up to the next multiple of the interval counted from the Unix epoch.
- Stamina recovery is not part of the turn job. It uses elapsed real time ([stamina.md](stamina.md)).

### Who runs the jobs

The server does not schedule the five cron jobs. An external scheduler must POST to each endpoint. Each endpoint is enabled by an environment flag, and the caller must send the task secret in the `Authorization` header (compared in constant time, with no scheme prefix). A wrong secret or a disabled flag returns 401 and records nothing.

| Endpoint | Flag | Cadence (see [operations.md](../operations.md)) | Run-log name |
|---|---|---|---|
| `/api/cronJobs/turns` | `DO_TURN_UPDATES` | Match the turn interval (30 minutes) | `turns` |
| `/api/cronJobs/daily` | `DO_DAILY_UPDATES` | Daily | `daily`, plus `dailySupporter`, `allianceDues`, `itemLedgerCheck` |
| `/api/cronJobs/accountStatus` | `DO_TURN_UPDATES` | Operator's choice | `accountStatus` |
| `/api/cronJobs/chatModeration` | `DO_TURN_UPDATES` | Every 30 minutes, no-op until `moderation.shadowEnabled` is on | `chatModeration` ([decision models](../features/decision-models.md)) |
| `/api/cronJobs/bots` | `DO_BOT_UPDATES` | Daily, after citizen growth | `bots` |

Each call grants once. The code keeps no catch-up ledger: a missed call is a missed grant. The scheduler is responsible for cadence. The code does not tie the daily job to OT midnight; that depends on the scheduler's own time zone.

The turn and daily endpoints skip a repeated delivery instead of granting twice ([CronRun.service.ts](../../src/services/CronRun.service.ts)):

- **Turns** is skipped when a `turns` run that succeeded or is still running started within the last two thirds of the turn interval (20 minutes by default). A late but legitimate tick still runs.
- **Daily** is skipped when a `daily` run that succeeded or is still running started since the start of the current game day (OT midnight on a real-day server).
- A skipped call answers 200 with `skipped: true` and records no run. Failed runs never count, so a failed tick can be re-run at once. A `RUNNING` row older than 2 hours (`CRON_RUN_STALE_AFTER_MS`, the same point the admin page marks it stale) lost its finish and no longer counts, so a daily that crashed mid-run is retried by the next delivery. Adding `?force=true` to the request bypasses the check, for an operator re-run.
- If the lookup itself fails, the job runs anyway. The check is not atomic: two deliveries arriving at the same instant can both pass. Per-user row locks still keep each write consistent.
- The account-status, chat moderation and bot endpoints have no such check.

The in-process workers (timed era reset, temporary forces, Discord and email outboxes) are not cron jobs. They poll continuously and are not in the run log.

### Who a job touches

The turn and daily jobs only process **era participants**: accounts with a positive id, assigned to the open era, with `last_active` on or after the era start, and not closed. When player logins are disabled (or a reset is closing), they additionally require an active administrator or moderator role, so players receive no income, turns or citizens during planned downtime ([loginPolicy.ts](../../src/utils/loginPolicy.ts)). The account-status job reads every account.

Each user is processed in its own short transaction (10-second limit) holding one user row lock, and values are re-read under the lock, so a player action that lands mid-run is not overwritten. A job re-checks that the era token (id and start date) is still current and skips work queued before a reset. A failed user is retried up to three times; after that it is counted as failed and logged. Gold, turns and units are written as relative increments.

### Turn job (`turns`)

For each participant, in order of overall rank score:

1. Gold per turn is multiplied by the running game events' gold multiplier. Open alliance loans take their share of that income first ([game-events.md](game-events.md)).
2. The remaining gold is added and a `ECONOMY` bank-history row is written.
3. Attack turns increase by `1 + extraTurnsPerTick` from events.
4. Rank is stored (the rank order across participants at the start of the run), and the offense, defense, spy and sentry figures are refreshed, including hired and borrowed troops.

After all users it settles alliance loan repayments that were diverted into treasuries, and queues "stamina full" Discord alerts (best effort).

### Daily job (`daily`)

The API handler first prunes run-log rows older than 90 days, then runs the daily pass, then supporter housekeeping as a separate logged run (`dailySupporter`), then alliance membership dues as another (`allianceDues`, idempotent per member per period; see [alliances.md](alliances.md#join-fee-and-membership-dues)), and finally the item ledger check (`itemLedgerCheck`), which runs even if the daily pass failed and never changes the response.

The daily pass, per participant:

1. **Healing.** Expires mercenary contracts, then each wounded group returns `max(1, floor(35% of its size))` units to duty (capped at the group size). The rest stay wounded. Wounds belonging to expired force contracts are dropped.
2. **Citizen growth.** Adds the player's housing growth plus qualifying event bonuses, with the event multiplier applied, and writes a `DAILY_RECRUIT` bank-history row.
3. **Kingdom morale.** Daily morale drift and desertion, run after growth. Failures are logged and do not block the run.

Then, once for the world: cleanup (login telemetry, audit-log IP pruning, folding expiring logs into era totals, deletion of attack logs, bank history and recruit history older than 20 days, and their combat ACLs, overdue alliance loans, expired identity blocks, veteran records and anti-abuse keys), dungeon captive escapes, the inactivity sweep, admin-only abuse detection, and the privacy-erasure passes. Each of those is isolated so a failure is logged without failing the day.

### Account-status job (`accountStatus`)

Re-evaluates each account's status history ([User.service.ts](../../src/services/User.service.ts)). A timed status that has expired reverts to `ACTIVE`. Accounts idle over 60 days become `IDLE`, and `IDLE` accounts that were active again become `ACTIVE`. Accounts idle over 365 days become `INACTIVE`. `CLOSED`, `BANNED`, `SUSPENDED` and `VACATION` are never rewritten by the idle rules.

### Chat moderation job (`chatModeration`)

Runs one shadow moderation sweep over chat messages from the last 24 hours that have no verdict yet. It does nothing unless the `moderation.shadowEnabled` runtime setting is on (off by default), and it only records verdicts, never enforces them. `moderation.shadowBatchSize` (default 25, 1 to 200) sets how many messages one sweep reads. If the decision provider is unreachable the sweep is skipped. See [decision models](../features/decision-models.md).

### Bot job (`bots`)

Runs the daily bot tick; see [bots.md](bots.md).

### Cron run records

Every authorized call is wrapped by `withCronRunLog` ([CronRun.service.ts](../../src/services/CronRun.service.ts)).

- A `CronRun` row is inserted as `RUNNING` when the job starts, and completed as `SUCCESS` or `FAILED` with the finish time, duration, a sanitized summary and, on failure, a truncated error message.
- A job that returns without throwing but flags itself failed is recorded `FAILED`. A thrown error is recorded, then rethrown unchanged.
- Summaries keep only finite numbers, booleans, null and strings (cut to 200 characters), nested at most two levels, at most 30 fields. Error messages keep the message only (never the stack), have credentials, bearer tokens, URL credentials and email addresses redacted, and are cut to 500 characters.
- Logging never holds a job up. The start insert is not awaited before the job runs, and every write the caller waits for is raced against 2 seconds. If the start insert is late, the finish update is attached to it so the row is still closed.
- A row can stay `RUNNING` if the process died or the start insert never confirmed. Rows still `RUNNING` after 2 hours are shown as stale. Rows older than 90 days are deleted by the daily job.
- Rejected or disabled calls, and repeated deliveries skipped by the duplicate check, are not recorded.

## Why it works this way

- One zone for the whole game keeps daily limits identical for every player ([timefunctions.ts](../../src/utils/timefunctions.ts)).
- Per-user transactions that lock exactly one user row cannot deadlock with attacks and spy missions, which lock two users in id order ([CronJob.service.ts](../../src/services/CronJob.service.ts)).
- The jobs avoid the era lifecycle lock: a reset takes lifecycle then user locks, so taking the lifecycle lock under a user lock would invert the order and could deadlock ([CronJob.service.ts](../../src/services/CronJob.service.ts)).
- Run-log failures are swallowed so logging can never break a game job ([CronRun.service.ts](../../src/services/CronRun.service.ts)).
- The daily pass has no per-run marker, so running it twice would grant citizen growth twice; the duplicate check guards against a duplicate Cron Trigger or two schedulers overlapping during a switchover ([daily.ts](../../src/pages/api/cronJobs/daily.ts), [CronRun.service.ts](../../src/services/CronRun.service.ts)).

## Admin and settings

- **Administration → System → Cron run log** (`/home/admin/cron-runs`; settings-management permission). Filter by job and status, see the last success per job, and stale rows ([cron-runs.ts](../../src/pages/api/admin/cron-runs.ts)).
- Administration → System → Runtime Settings: `moderation.shadowEnabled`, `moderation.shadowBatchSize`.
- Environment: `DO_TURN_UPDATES`, `DO_DAILY_UPDATES`, `DO_BOT_UPDATES`, the task secret, `TURN_INTERVAL_MINUTES`, `GAME_DAY_MINUTES`. These are deployment values, not runtime settings.

## Source

- [timefunctions.ts](../../src/utils/timefunctions.ts), [Turns.ts](../../src/constants/Turns.ts): clock and intervals.
- [CronJob.service.ts](../../src/services/CronJob.service.ts): turn, daily and account-status work.
- [CronRun.service.ts](../../src/services/CronRun.service.ts): run records.
- Endpoints: [turns.ts](../../src/pages/api/cronJobs/turns.ts), [daily.ts](../../src/pages/api/cronJobs/daily.ts), [accountStatus.ts](../../src/pages/api/cronJobs/accountStatus.ts), [chatModeration.ts](../../src/pages/api/cronJobs/chatModeration.ts), [bots.ts](../../src/pages/api/cronJobs/bots.ts).
- [loginPolicy.ts](../../src/utils/loginPolicy.ts): who counts as a participant.
- [ItemLedger.service.ts](../../src/services/ItemLedger.service.ts): the logged item ledger check.

## Tests

- [cronJob.concurrency.test.ts](../../src/services/__tests__/cronJob.concurrency.test.ts): one-tick game maths, row locking, relative increments, healing, recruiting bonus, era-change skips, event effects in the jobs.
- [timefunctions.test.ts](../../src/utils/timefunctions.test.ts): OT calendar day key, sidebar clock zone, game-day blocks, fallback for lengths that do not divide a day.
- [currentEraParticipants.test.ts](../../src/services/__tests__/currentEraParticipants.test.ts): jobs select only staff while logins are disabled.
- [CronRun.service.test.ts](../../src/services/__tests__/CronRun.service.test.ts): record lifecycle, sanitizing and redaction, stalled writes, retention.
- [cron-runs.api.test.ts](../../src/__tests__/pages/api/admin/cron-runs.api.test.ts): the admin run-log endpoint (permissions, stale flag, filters).
- [cron-run-logging.api.test.ts](../../src/__tests__/pages/api/cronJobs/cron-run-logging.api.test.ts): endpoints record or skip runs, daily prune, supporter and alliance dues runs (a failing dues pass still serves the daily), duplicate-delivery skips for turns and daily, `?force=true`, a failed lookup never blocking a tick, bot response contract.

## Known gaps

- The OT-day and game-day helpers are tested, but no test covers daylight-saving transitions in `otWallClockToDate`.
- The account-status transitions (`getUpdatedStatus`) are covered only through other suites, and the daily cleanup deletion window has no direct test.
- Nothing in code enforces that the external scheduler matches `TURN_INTERVAL_MINUTES` or fires the daily job at OT midnight.
- The account-status and chat moderation jobs share the `DO_TURN_UPDATES` flag with the turn job.
