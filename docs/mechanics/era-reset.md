# Eras and era resets

Last verified against code: 2026-11-12 (alpha 8ffa50de)

An era is one season of the game world. Exactly one era is open at a time (its `endDate` is empty). This page covers how eras start and end, the two ways to wipe gameplay state (the **era rollover** and the **current-era reset**), the timed reset, per-era stats, and veteran claims.

## Rules

### What an era is

- The open era is the one with no end date. If none exists, the first request that needs one creates `Era 1` under an advisory lock, so a fresh database never gets two ([Era.service.ts](../../src/services/Era.service.ts)).
- Each era stores its starting values (`startSettings`): gold, citizens and attack turns. Defaults: 25,000 gold, 50 citizens, 50 attack turns. Limits: gold up to 1,000,000,000,000, citizens up to 10,000,000, turns up to 10,000, all whole and non-negative. Invalid stored values fall back field by field to the defaults ([eraStartSettings.ts](../../src/utils/eraStartSettings.ts)).
- Every other starting value is fixed in [UserDefaults.service.ts](../../src/services/UserDefaults.service.ts): 100 stamina, fort level 1, kingdom morale 100, zero experience, units and upgrades at their level-1 baseline, zero workers and military.
- A player counts as an **era participant** only if they are assigned to the open era and their `last_active` is on or after the era start. Registration or assignment alone is not enough. Daily and turn jobs, the attack-target list and current leaderboards use this rule ([loginPolicy.ts](../../src/utils/loginPolicy.ts), [eraParticipation.ts](../../src/utils/eraParticipation.ts)).
- Era-wide operations take one exclusive PostgreSQL advisory lock (the era lifecycle lock). Gameplay takes the shared form of the same lock. Whole-player-base transactions may run up to 300 seconds ([eraLifecycleLock.ts](../../src/utils/eraLifecycleLock.ts)).

### Two ways to wipe the world

| | Era rollover (**End Current Era & Start New**) | Current-era reset (**Reset current era now** / **Schedule reset**) |
|---|---|---|
| Era row | Ends the open era, creates a new one named `Era <old id + 1>` | Keeps the same era (id, name); moves its start date forward |
| Snapshots | Writes one `UserEra` row per account for the ended era | Deletes the era's `UserEra` rows; no snapshot, no achievement credit |
| Lifetime achievements | Adds the ended era's level, wins and defends to each account | Untouched |
| Gameplay history | Kept | Rows from the current era's date window are deleted |
| Player access | Not closed by the action | Closes logins first, optionally reopens after |
| Game events | Events bound to the ended era become `COMPLETED` | Not touched |

### Era rollover

Admin-only. The request names the era being ended (`expectedEraId`); a stale or repeated request is refused with 409. An audit row is written before it starts, and the request is refused if that write fails ([eras.ts](../../src/pages/api/admin/game/eras.ts)). Inside one transaction `startNewEra` does the following.

1. Locks the lifecycle, all alliances, then all positive-ID players, in that order.
2. Ends the open era and completes its still `ACTIVE`, `SCHEDULED` or `PAUSED` events.
3. Creates the new era with the chosen start settings (or the defaults).
4. For every positive-ID account: counts that account's non-voided attack wins and defend wins inside the ended era's date window, writes the `UserEra` snapshot, then resets the account to the new era's defaults.
5. Zeroes force reserves and wounded counts, frees all dungeon captives, cancels pending pillage events, and makes force dues due now.
6. Turns every active alliance into `RESERVED` (see below).

The `UserEra` snapshot holds level, units at start, the era's win counts, end-of-era rank, gold, bank gold, offense, defense, spy, sentry and structure levels, plus a JSON copy of experience, stats, units, items and upgrades. The first ever rollover (no prior era) writes no snapshots. Lifetime achievements keep the highest level ever reached and add the ended era's wins and defends.

The rollover does not clear rank, stat counters or gameplay history rows. Players become participants of the new era after their next activity, because `last_active` must be at or after the new start.

### Current-era reset

Admin-only. Use **Administration → Eras → Reset current era now**. No manual login-setting change is needed, whether player logins are open or closed.

1. Open the reset dialog. It shows starting gold, citizens and attack turns prefilled from the active era's saved settings. The values you confirm are applied to every account and saved to the era. The separate "Next Era Starting Settings" boxes are only for the next rollover and are never used by a reset.
2. Leave **Enable logins after the reset** checked to reopen the realm afterward, or uncheck it to leave logins closed.
3. Type the displayed `RESET ERA <id>` phrase and confirm.

Confirming closes player access and starts the same durable pipeline used by timed resets. The API returns `202 Accepted` once the closure and the reset request commit ([reset-current-era.ts](../../src/pages/api/admin/game/reset-current-era.ts)). After a 35-second drain, the worker resets gameplay state and optionally reopens logins. A pending timed reset is replaced by a confirmed immediate one. A second request while a reset is already `closing` is rejected. The request must match both the era id and the era start timestamp, or it is refused as stale.

The closure and its audit row commit together, and a failure rolls both back. The reset itself, the optional login opening and the completion marker commit in a second transaction. If that phase fails, it rolls back, logins stay closed and the worker retries after 15 seconds.

### What a current-era reset changes

- **Accounts.** Every positive-ID account, including staff, is reset: resources to the chosen starting values, units, items, structure and battle upgrades and bonus points to baseline, experience to 0, wounded units and daily pressure cleared. Rank is set to 0, player stat counters are cleared, and `last_active` and `last_gameplay_at` are cleared so participation starts fresh. Battle-protection and anti-camping clocks restart. Active force contracts are returned, requested ones cancelled, force obligations cancelled, force reserves zeroed, pending pillage cancelled, and all dungeon captives freed.
- **Item ledger.** Each account's old item balances are written off to the item ledger as an `ACCOUNT_RESET` entry before the new baseline is created.
- **Histories.** Rows dated on or after the era start are deleted from attack logs (combat ACLs first), personal bank history, recruit history, alliance bank history and alliance join requests. Alliance wars created in that window and every war still in progress are deleted. All alliance cooldowns and auto-recruit sessions are cleared. The era's `UserEra` rows and its cached rankings and community stats are removed.
- **Friend gold requests.** Every pending friend gold request is marked cancelled, not only recent ones.
- **Alliances.** Active alliances become `RESERVED` (see below).
- **Era row.** Keeps its id, name and settings; the start date moves to the reset time and the chosen starting values are saved.
- **Not touched.** Account identity, credentials, staff grants, moderation history, messages and social relationships, lifetime achievements, completed eras, and game events.

Queued turn and daily jobs recheck the era start timestamp and each player's participation after taking their row lock, so work queued before a reset is discarded. Recruitment quotas start at the later of the (refreshed) era start and the game-day boundary, so old recruitment does not consume fresh quotas.

Maintenance mode is a separate switch and is not changed by a reset.

### Alliances at an era boundary

Both wipes call the same step ([allianceStatus.ts](../../src/services/allianceStatus.ts)). Active alliances become `RESERVED`: identity, roster, roles and artwork are kept. Treasury is set to zero (not paid out), parked loan repayments are dropped, active and defaulted loans are written off, requested loans and pending gold and join requests are cancelled, wars in warmup, active or cooldown are ended, and alliance XP and upgrades are deleted. The Alliance Hall returns to level 0 (Camp, 10 members); an alliance with more members keeps them but cannot add more until it upgrades again. Every membership's unpaid dues (`dues_arrears`) and `dues_paid_through` are cleared; the join fee and dues settings are kept (see [alliances.md](alliances.md)). A reserved alliance stays locked until its leader reactivates it. The requirements are two runtime settings, `alliance.reactivationMinLevel` (default 10) and `alliance.reactivationCostGold` (default 10,000,000).

### Factory restore

**Factory restore** is a stricter immediate reset for staged data ([factory-restore.ts](../../src/pages/api/admin/game/factory-restore.ts)). It runs the same pipeline, but dissolves every alliance instead of reserving them and evicts their members from alliance chat rooms. It needs its own phrase, `FACTORY RESTORE ERA <id>`. The ordinary reset rejects that phrase and the factory restore rejects the ordinary one. It cannot be scheduled for a later time.

### Timed reset

In **Administration → Eras → Schedule reset**, pick a date and time in OT Time (America/New_York; the clock in the sidebar; see [world-clock-and-jobs.md](world-clock-and-jobs.md)). The picker converts it to UTC and shows both. Confirm the starting gold, citizens and attack turns (prefilled from the era and stored with the schedule), choose whether to reopen logins afterward, and type `RESET ERA <id>`.

- The time must be at least one minute ahead.
- The schedule appears as a banner across the shared layout, including login pages: "Era will reset on {OT Time} ({UTC})", and "Era reset in progress" once closing.
- While pending, an admin can reschedule or cancel. The page sends the schedule id it saw, and a changed schedule is refused rather than overwritten. Once the state is `closing` it can no longer be rescheduled or cancelled.
- A schedule only matches the era id and start date it was created for. Opening a new era invalidates it; the worker then marks it cancelled and writes an `ADMIN_ERA_RESET_STALE` audit row.
- At the deadline the worker sets `DISABLE_LOGIN` to true and moves the state to `closing`. Players are blocked by the maintenance policy, while active administrators and moderators keep access. The worker waits 35 seconds, which covers the other processes' 5-second configuration cache plus its 30-second last-good fallback, and then performs the reset. If the worker was offline, an overdue schedule runs when it returns.
- The states are `pending`, `closing`, `completed` and `cancelled`. The schedule is stored as one private, non-editable `ServerSetting` row (`ERA_RESET_SCHEDULE`). The public schedule endpoint omits the admin and internal fields.
- While the state is `closing`, the runtime configuration reports `eraResetInProgress`. That counts as logins disabled and as maintenance for everyone except active staff. It also pauses the force worker.

### Worker

The custom server (`bun run dev`) starts the reset worker automatically. It polls every second and backs off 15 seconds after an error ([eraResetWorker.ts](../../src/server/eraResetWorker.ts)). `bun run start` (plain `next start`) does not run the custom server, so such deployments must run `bun run era-reset-worker` as a separate supervised process ([run-era-reset-worker.ts](../../scripts/run-era-reset-worker.ts)). Without a worker, a timed reset never runs. Do not reopen logins while a started reset is retrying; fix the failure and let the worker finish.

### Login switch

The immediate and timed resets write the single `DISABLE_LOGIN` override into `ServerSetting`. A database value takes precedence over the `NEXT_PUBLIC_DISABLE_LOGIN` environment value, so an environment value cannot keep logins disabled after the reset reopens them. Other processes see the change within about five seconds. See [runtime-settings.md](runtime-settings.md).

### Era stats

Ended-era stats are served by [UserEraStats.service.ts](../../src/services/UserEraStats.service.ts) to the public stats page. Only ended eras are served; the open era returns nothing from this module.

- **Standings** (top 10): sum of end-of-era offense, defense, spy and sentry from the `UserEra` snapshot. Ties break by gold on hand plus bank, then lowest user id. `rankAtEnd` is deliberately not used.
- **Gold on hand, gold in bank, offense, defense, spy, sentry** (top 10 each): straight from the snapshot columns.
- **Attacks, attacker casualties, defender casualties, attack by total casualties, recruiters** (top 10 each): the saved era totals (see Era totals) plus any attack and recruit logs still on hand inside the era's date window (start inclusive, end exclusive). Casualty figures prefer the scalar loss columns and fall back to legacy JSON.

### Era totals

Attack and recruit logs are deleted after 20 days, but the totals that leaderboards need are kept. Each day, in the same transaction as the delete, the job folds the expiring logs into per-player `UserEraActivity` rows (attacks won, defends won, casualties, recruits) and into each era's `topBattles` (its 10 biggest battles). Voided battles are left out. If the step fails, nothing is deleted and the next run picks the logs up.

Ended-era leaderboards and the achievements saved at rollover add these totals to whatever logs are still on hand. A current-era reset clears them for that era. The rows follow the account like `UserEra`: exports include them, and they are deleted with the account row.

### Veteran claims

A veteran claim lets a returning player of a finished era get a title and their original join date back, and optionally their old display name ([VeteranClaim.service.ts](../../src/services/VeteranClaim.service.ts)).

- **Record.** When the inactivity process erases an unsanctioned account that joined before the open era started, a keyed hash of its email and display name is saved as a veteran record with title `ERA1_TESTER`, valid for 730 days. Self and admin erasures, and sanctioned accounts, create none. Plain email is never stored ([AccountAnonymization.service.ts](../../src/services/AccountAnonymization.service.ts)). Expired records are purged by the daily job.
- **Link.** On sign-up with a matching email, and on request from the signed-in account (3 per hour), a single-use claim link is emailed to that address. It is valid for 30 days, bound to the address, and sent directly rather than through the outbox. Earlier links are voided.
- **Redeem** (10 attempts per hour). In one transaction the account receives the title and original join date. If the supplied display name matches the erased account's reserved name and is free, the account is renamed and the reservation released. A used, expired or unknown link, a changed email, a name mismatch or a taken name is refused.
- Staff with user-management permission can list records. Hashes are never returned and each read is audit-logged.

### Relaunch notice

The era-relaunch email tells players who have not played since the open era started that development has restarted, when the purge is, and how a veteran claim works ([AccountInactivity.service.ts](../../src/services/AccountInactivity.service.ts), copy in `public/locales/*/email.json` under `relaunchNotice`).

- **Send.** Administration → Inactive users, template *Era relaunch*. Choosing it fills *Inactive since* with the open era's start; a news post ID is required for the news link. The admin picks a **purge date** 14–365 days ahead; it is stored on each notice as midnight UTC of that day and printed in the email. *Preview* renders the email in English, German or Spanish, and *Send test to me* mails it to the admin's own address; neither creates a notice.
- **Delete now.** The email's delete link needs no sign-in: it opens `/account/confirm-erasure?notice=…`, where pressing Confirm deactivates the account and erases it after the usual 14-day grace (see [privacy-self-service.md](../privacy-self-service.md)). That path keeps no veteran record.
- **Last email.** The email says it is the last one. A relaunch notice never gets a reminder, even with reminders enabled, and while it is open the player is left out of news, announcement and battle-alert email. Security and account-lifecycle mail still go out. Logging in cancels the notice and lifts both.
- **Purge.** On the purge date the daily sweep anonymizes the account (when auto-anonymize is on): the name becomes a pseudonym, the email is scrubbed, the account is closed, and a veteran record is kept as above.

## Why it works this way

- The 35-second wait exists because other processes may serve a last-good runtime configuration for up to 30 seconds ([EraResetSchedule.service.ts](../../src/services/EraResetSchedule.service.ts)).
- The alliance treasury is discarded rather than paid out because the same boundary resets every member's gold, so a payout would create new-era gold from nothing ([allianceStatus.ts](../../src/services/allianceStatus.ts)).
- Win counts are limited to the era being closed so legacy wins are not recounted into lifetime achievements ([legacy-era-import.md](../legacy-era-import.md)).
- The lifecycle lock casts PostgreSQL's `void` result to `text` because Prisma's driver adapter needs a supported result type ([eraLifecycleLock.ts](../../src/utils/eraLifecycleLock.ts)).
- Sign-up never proves email ownership, so veteran benefits are released only through the emailed link ([VeteranClaim.service.ts](../../src/services/VeteranClaim.service.ts)).

## Admin and settings

- **Administration → Eras** ([eras.tsx](../../src/pages/home/admin/eras.tsx)): list (era-management permission), rollover, reset, schedule and factory restore (administrators only).
- Runtime settings involved: `DISABLE_LOGIN`, `MAINTENANCE_MODE`, `era.protectionDurationDays`, `era.protectionLevelLimit`, and the two alliance reactivation settings.
- Audit actions: `ADMIN_ERA_START_REQUESTED`, `ADMIN_ERA_START`, `ADMIN_ERA_RESET_SCHEDULED`, `ADMIN_ERA_RESET_CANCELLED`, `ADMIN_ERA_RESET_STARTED`, `ADMIN_ERA_RESET_STALE`, `ADMIN_CURRENT_ERA_RESET`, `ADMIN_FACTORY_RESTORE_REQUESTED`, `ADMIN_FACTORY_RESTORE`.
- Moving data from the old deployment is described in [legacy-era-import.md](../legacy-era-import.md).

## Source

- [Era.service.ts](../../src/services/Era.service.ts): active era, rollover.
- [CurrentEraReset.service.ts](../../src/services/CurrentEraReset.service.ts): the reset transaction.
- [EraResetSchedule.service.ts](../../src/services/EraResetSchedule.service.ts): schedule states, immediate start, worker step.
- [eraResetWorker.ts](../../src/server/eraResetWorker.ts) and [run-era-reset-worker.ts](../../scripts/run-era-reset-worker.ts): polling loop.
- [UserDefaults.service.ts](../../src/services/UserDefaults.service.ts): baseline values and relation reset.
- [allianceStatus.ts](../../src/services/allianceStatus.ts): reserve step.
- [eraStartSettings.ts](../../src/utils/eraStartSettings.ts), [eraResetPhrase.ts](../../src/utils/eraResetPhrase.ts), [eraLifecycleLock.ts](../../src/utils/eraLifecycleLock.ts), [eraParticipation.ts](../../src/utils/eraParticipation.ts), [loginPolicy.ts](../../src/utils/loginPolicy.ts).
- [UserEraStats.service.ts](../../src/services/UserEraStats.service.ts): ended-era stats.
- [EraActivity.service.ts](../../src/services/EraActivity.service.ts): folds expiring logs into era totals.
- [VeteranClaim.service.ts](../../src/services/VeteranClaim.service.ts), [AccountAnonymization.service.ts](../../src/services/AccountAnonymization.service.ts): veteran records and claims.
- [AccountInactivity.service.ts](../../src/services/AccountInactivity.service.ts), [inactive-notices.ts](../../src/pages/api/admin/users/inactive-notices.ts), [inactive-users.tsx](../../src/pages/home/admin/inactive-users.tsx): relaunch notices and the purge.
- API: [eras.ts](../../src/pages/api/admin/game/eras.ts), [reset-current-era.ts](../../src/pages/api/admin/game/reset-current-era.ts), [factory-restore.ts](../../src/pages/api/admin/game/factory-restore.ts), [era-reset-schedule.ts](../../src/pages/api/admin/game/era-reset-schedule.ts), [public schedule](../../src/pages/api/era-reset-schedule.ts), [veteran-claim.ts](../../src/pages/api/account/veteran-claim.ts).

## Tests

- [EraActivity.test.ts](../../src/services/__tests__/EraActivity.test.ts): tallying logs, top battles, and leaderboards that combine totals with logs.
- [eraActivityRollup.test.ts](../../test/integration/eraActivityRollup.test.ts): on real PostgreSQL, leaderboards match before and after logs expire, reruns count nothing twice, and a failed run keeps the logs.
- [CurrentEraReset.service.test.ts](../../src/services/__tests__/CurrentEraReset.service.test.ts): reset scope, no snapshot, alliances reserved with treasury and hall level reset and dues arrears cleared, chosen vs saved starting values, stale era and start date, confirmation phrases, friend requests, login opening and audit rollback.
- [EraResetSchedule.service.test.ts](../../src/services/__tests__/EraResetSchedule.service.test.ts): immediate start, scheduling, stale and cancel conflicts, closing before reset, restart recovery, retry, audit rollback.
- [reset-current-era.api.test.ts](../../src/__tests__/pages/api/admin/reset-current-era.api.test.ts) and [era-reset-schedule.api.test.ts](../../src/__tests__/pages/api/admin/era-reset-schedule.api.test.ts): admin guard and input validation.
- [allianceStatus.test.ts](../../src/services/allianceStatus.test.ts): reserved status and the ordinary vs factory phrase.
- [ensureActiveEra.test.ts](../../src/services/__tests__/ensureActiveEra.test.ts): one era is created under concurrent first requests.
- [eraStartSettings.test.ts](../../src/utils/eraStartSettings.test.ts): starting-value parsing and bounds.
- [eraLifecycleLock.pg.test.ts](../../src/utils/eraLifecycleLock.pg.test.ts): the real-database lock (opt-in; needs `ERA_LIFECYCLE_TEST_DATABASE_URL` pointing at a disposable database whose name ends in `_test`). It verifies the lock only, not a full reset against real data.
- [currentEraParticipants.test.ts](../../src/services/__tests__/currentEraParticipants.test.ts): participation filters during disabled login.
- [cronJob.concurrency.test.ts](../../src/services/__tests__/cronJob.concurrency.test.ts): jobs skip work queued before a new era.
- [VeteranClaim.test.ts](../../src/services/__tests__/VeteranClaim.test.ts): sign-up link, redeem, name restore, address change, rollback.
- [AccountInactivityRelaunch.test.ts](../../src/services/__tests__/AccountInactivityRelaunch.test.ts), [emailTemplates.test.ts](../../src/services/__tests__/emailTemplates.test.ts), [Email.service.test.ts](../../src/services/__tests__/Email.service.test.ts) and [inactive-notices.test.ts](../../src/__tests__/pages/api/admin/users/inactive-notices.test.ts): relaunch cutoff, purge date, no reminder, copy in every locale, other mail held back, preview and test input.

## Known gaps

- `startNewEra` (the rollover) has no direct test: snapshots, lifetime achievements, event completion and the stale-era check are untested.
- The factory restore route has no test. No test runs a full reset against a real PostgreSQL database.
- The rollover does not reset rank or stat counters, unlike the current-era reset.
- A timed reset cannot be a factory restore.
- Eras that ended before `UserEraActivity` existed keep only the logs that were still on hand, so their attack, casualty and recruit leaderboards can be short or empty.
