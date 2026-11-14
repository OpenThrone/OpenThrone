# Economy

Last verified against code: 2026-11-13 (alpha 4138222f)

Gold comes from Workers and the fort, paid every turn tick. Citizens come from Housing and recruiting, added every daily tick. The Bank keeps gold out of raiders' reach but limits how often and how much you can deposit.

Values below are the defaults at the commit above. Tier tables (economy, housing, fort) live in constants and change; read them in [Structure_Upgrades.tsx](../../src/constants/Structure_Upgrades.tsx) and [Fortifications.tsx](../../src/constants/Fortifications.tsx) instead of copying them here.

## Rules

### Starting values

A new account, and every account after an era reset, starts from the era's saved settings. The built-in defaults are 25,000 gold, 50 citizens, 50 attack turns and 0 gold in the bank ([UserDefaults.service.ts](../../src/services/UserDefaults.service.ts)). Economy level and house level start at 0 (Farm, Housing Level 0); the fort starts at level 1 (Manor).

### Gold per turn

Each turn tick pays:

`ceil( (Workers x goldPerWorker + fortGoldPerTurn) x (1 + incomeBonus / 100) )`

- `goldPerWorker` comes from the player's economy level. It rises one tier per Economy upgrade (Farm to Meat Market, 7 tiers).
- `fortGoldPerTurn` comes from the fort level and is flat. It rises with every fort level.
- `incomeBonus` is a percentage and adds up from: the Thief class (+5), and Income proficiency points (see [progression.md](progression.md)). It multiplies both the Worker gold and the fort gold.
- Only Workers earn. Citizens and soldiers do not. Hired and borrowed troops count toward army stats, not income.
- A running game event can multiply the result (`goldMultiplier`, 0.1x to 10x). The multiplied amount is cut so gold on hand cannot pass the database limit.
- An open alliance loan takes its share of the income before it is paid (`alliance.loanIncomeSharePercent`). The history row shows the repayment.

The sidebar and Overview income breakdown use the same service: [UserEconomyService.ts](../../src/services/UserEconomyService.ts).

### Citizens

Citizens are the population you can train into units (see [training.md](training.md)). They arrive three ways:

- Daily growth: the daily tick adds the Housing level's `citizensDaily` (1 at Housing Level 0, then 20, 40, ... 120 at Housing Level 6).
- Recruiting: one citizen per recruit (see [recruitment.md](recruitment.md)).
- Events: a game event can add a flat daily bonus, and can multiply daily growth, recruiting, or both. Fractional multipliers round randomly so the average is fair. A flat event bonus only reaches accounts with a gameplay action inside the event's activity window (default 24 hours; 0 means every participant).

Citizens that events add also raise the player's new-player-protection population limit. Housing upgrades are bought in order, one level at a time, and each needs a minimum fort level (see [structures.md](structures.md)).

Each daily growth writes a `DAILY_RECRUIT` bank-history row with the numbers used.

### Bank

Gold on hand can be plundered. Gold in the bank cannot: combat code never reads or changes the bank balance.

- **Deposit.** A single deposit may not exceed `bank.depositCapPercent` (default 80) of the gold on hand, rounded down. It needs the gold on hand and at least one free deposit slot.
- **No capacity.** The balance has no upper limit, at any economy level. v0.13.0 refused deposits past a per-tier capacity (10,000,000 on the Farm); v0.13.1 removed it ([decision](../decisions/no-bank-capacity.md)).
- **Deposit slots.** The economy level sets deposits per day (3 on the Farm, up to 9). The count is a rolling window of one game day (24 hours by default), not a calendar reset: a slot frees 24 hours after the deposit that used it. Deposits made before the current era started do not count. The Bank page shows the countdown to the next free slot.
- **Withdraw.** Any amount up to the bank balance. There is no limit on how often and no fee.
- **Blocked while in default.** A player with a defaulted alliance loan cannot deposit.
- **Concurrency.** Both actions lock the player's row first and use conditional updates, so parallel requests cannot overdraw, overspend or beat the deposit count.
- **History.** Each deposit and withdrawal writes a `PLAYER_TRANSFER` bank-history row from HAND to BANK or back. The Bank history page filters by type (deposits, withdrawals, war spoils, transfers, sales, training, income, recruitment, fort repairs, daily rewards, friend transfers) and only shows the current era. Rows older than 20 days are deleted by the daily tick. The training filter also lists mercenary hires and renewals.
- **Bank gold can still leave.** An overdue alliance loan is collected from gold on hand first, then from the bank.

Gold transfers between friends, the alliance bank and loans have their own rules and are not covered here (see [friends-and-transfers.md](friends-and-transfers.md)). Friend transfers unlock at the Coal Mine and use `friend.dailyReceivedCap` and `friend.transferMinLevel`.

### Turn tick

`POST /api/cronJobs/turns` runs on an external scheduler. It must match `TURN_INTERVAL_MINUTES` (default 30). A repeated call within two thirds of the interval of a successful or still-running tick is skipped, so a duplicate delivery does not pay twice (details in [world-clock-and-jobs.md](world-clock-and-jobs.md)). For each participating account, in order of overall rank score, under that account's row lock:

1. Pay gold per turn (history row `ECONOMY`).
2. Add 1 attack turn, plus `extraTurnsPerTick` from running events. No cap on stored turns is applied.
3. Store the rank (its place in this run's ordering).
4. Recompute offense, defense, spy and sentry, including hired and borrowed troops.

Afterwards it moves diverted loan repayments into alliance treasuries and queues "stamina full" alerts. Stamina itself recovers on its own wall clock, not in this tick; see [stamina.md](stamina.md).

### Daily tick

`POST /api/cronJobs/daily` (`DO_DAILY_UPDATES`). A second call in the same game day, after a successful or still-running daily, is skipped, so citizen growth is not granted twice (details in [world-clock-and-jobs.md](world-clock-and-jobs.md)). Per participating account, in order:

1. Expire mercenary contracts and heal a share of wounded units (35% of each group, at least 1).
2. Add daily citizens (see above).
3. Run the kingdom morale pass.

Then global work: fold expiring attack and recruit logs into era totals (see [era-reset.md](era-reset.md)), then delete attack logs, bank history and recruit history older than 20 days; process overdue alliance loans; free captives held past 7 days or whose captor lost the dungeon (see [reanimation-and-captives.md](reanimation-and-captives.md)); run the inactivity sweep, abuse detection and privacy erasure; run supporter housekeeping; collect alliance membership dues (see [alliances.md](alliances.md#join-fee-and-membership-dues)). After the response is decided, the daily item check runs (see [armory.md](armory.md)).

### Who the ticks reach

A "participant" is an account in the active era whose last activity is at or after the era's start, whose status is not CLOSED, and, while logins are disabled, who is active staff. Queued work is skipped when the era changed after the run started. A failing account is retried up to 3 times and then counted as failed; it never stops the run.

### Time

Daily rules use the game day: a calendar day in `America/New_York`, or a shorter accelerated day when `GAME_DAY_MINUTES` is set on a test server. The turn clock is `TURN_INTERVAL_MINUTES`. Both are environment variables, not runtime settings. The cron schedulers are not started by the app; see [operations.md](../operations.md) and [world-clock-and-jobs.md](world-clock-and-jobs.md).

## Why it works this way

- Both bank actions lock the user row and are checked against committed state; the Bank service comment cites the concurrency tests for this.
- The deposit window is rolling so a player cannot bank twice around midnight ("next deposit in" countdown, #299 in the bank limits helper).
- A defaulted loan blocks depositing so gold cannot be sheltered from collection (comment in the deposit code).
- Per-user cron transactions lock exactly one row and stay short, so they cannot deadlock with attacks that lock two ([CronJob.service.ts](../../src/services/CronJob.service.ts)).

## Admin and settings

- Administration, System: Runtime Settings: `bank.depositCapPercent`, `friend.dailyReceivedCap`, `friend.transferMinLevel`, `alliance.loanIncomeSharePercent`.
- Administration, Events (rules in [game-events.md](game-events.md)): bonuses for gold, daily citizens, citizen multiplier and extra turns per tick. Replaces the former `era.dailyCitizenBonus` server settings (a migration moved them into events).
- Administration, Economy: totals and top holders.
- Administration, Cron run log: last run of the turn, daily, supporter, alliance dues and item check jobs, with counts and failures.
- Environment only: `TURN_INTERVAL_MINUTES`, `GAME_DAY_MINUTES`, `DO_TURN_UPDATES`, `DO_DAILY_UPDATES`.

## Source

- [Bank.service.ts](../../src/services/Bank.service.ts) (deposits, withdrawals, deposit status and the history filters)
- [bankLimits.ts](../../src/utils/bankLimits.ts)
- [UserEconomyService.ts](../../src/services/UserEconomyService.ts)
- [CronJob.service.ts](../../src/services/CronJob.service.ts)
- [Turns.ts](../../src/constants/Turns.ts)
- [timefunctions.ts](../../src/utils/timefunctions.ts)
- [Structure_Upgrades.tsx](../../src/constants/Structure_Upgrades.tsx)
- [Fortifications.tsx](../../src/constants/Fortifications.tsx)
- [Bonuses.tsx](../../src/constants/Bonuses.tsx)
- [gameEvents.ts](../../src/constants/gameEvents.ts)
- [GameEventRuntime.service.ts](../../src/services/GameEventRuntime.service.ts)
- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts)
- [bank API](../../src/pages/api/bank) (deposit, withdraw, getDeposits, history)
- [cron API](../../src/pages/api/cronJobs) (turns, daily)

## Tests

- [bankAndSpyRules.test.ts](../../src/services/__tests__/bankAndSpyRules.test.ts): deposit cap from `bank.depositCapPercent` and the rolling 24-hour window.
- [bankAndSpyRules.test.ts](../../src/services/__tests__/bankAndSpyRules.test.ts): conditional debits, deposit count read under the lock, over-withdrawal refused.
- [bankLimits.test.ts](../../src/utils/bankLimits.test.ts): 80% cap math with exact bigint rounding.
- [bankAndSpyRules.test.ts](../../src/services/__tests__/bankAndSpyRules.test.ts): no bank capacity: a Farm player above 10,000,000 can still deposit.
- [liveRules.test.ts](../../src/sim/liveRules.test.ts): the balance simulator deposits without a balance cap, like the live game.
- [bankDepositCap.test.ts](../../test/integration/bankDepositCap.test.ts): concurrent deposits never exceed the daily count.
- [history.structures.api.test.ts](../../src/__tests__/pages/api/bank/history.structures.api.test.ts): the history filter builder puts structure purchases under the Sale filter, and mercenary hires and renewals under Training.
- [UserEconomyService.test.ts](../../src/services/__tests__/UserEconomyService.test.ts): income breakdown rows add up to the total.
- [cronJob.concurrency.test.ts](../../src/services/__tests__/cronJob.concurrency.test.ts): turn tick math, relative gold and turn writes, event turns, daily citizens, event bonuses and activity window, stale-era skip, wounded healing.
- [cron-run-logging.api.test.ts](../../src/__tests__/pages/api/cronJobs/cron-run-logging.api.test.ts): a repeated turn or daily delivery is skipped, `?force=true` runs anyway.
- [allianceLoans.test.ts](../../src/services/__tests__/allianceLoans.test.ts): loans divert income and block deposits while defaulted.

## Known gaps

- Race `incomeMultiplier` (Human 1.02, Goblin 1.05) exists in the combat ruleset tables but nothing in the economy code reads it. Only the Thief class and Income proficiency raise income.
- `HouseUpgrades` has `softCapBonus` and `hardCapBonus` per level; no code outside the constants file reads them, so there is no population cap from housing.
- `getRecruitingBonus` has a placeholder `baseBonus = 0`; daily citizens come from Housing only.
