# Spying and intel

Last verified against code: 2026-11-06 (alpha d59b12d9)

Spies let you look at another kingdom (intel), damage its fort (infiltration) or kill some of its units (assassination) without a battle. Your spy force is tested against the target's sentries. Missions cost attack turns and spies, never stamina or gold, and give no XP.

## Rules

### Mission types

| Mission | Unit sent | Turns (default to min) | Spies per mission | What it does |
|---|---|---|---|---|
| `INTEL` | Spy (unit level 1) | 1 to 5 (min 1) | 1 to 10 | Returns a report on the target |
| `INFILTRATE` | Infiltrator (spy level 2) | 2 to 10 (min 2) | Up to the SPY structure limit | Removes fort hit points |
| `ASSASSINATE` | Assassin (spy level 3) | 3 to 10 (min 3) | Up to the SPY structure limit | Kills units of one chosen type |

- A `turns` value outside the range is clamped to it, not refused. Leaving it out uses the minimum.
- The committed turns are always spent from your attack turns, whether the mission succeeds or fails.
- Assassination needs a target unit: `CITIZEN`, `WORKER`, `OFFENSE`, `DEFENSE`, `SPY`, `SENTRY`, or `CITIZEN_WORKERS` (citizens and workers together).

### Who can be targeted, and when

A mission is refused unless:

- the mission type is switched on: `ENABLE_INTEL`, `ENABLE_INFILTRATIONS` or `ENABLE_ASSASSINATIONS` (all three default to off in the registry; a live server may differ) (`MISSION_DISABLED`);
- the target is not yourself and not on vacation, closed, banned, suspended, timed out or resetting (`DEFENDER_UNAVAILABLE`);
- you have not borrowed alliance troops from an alliance the target belongs to (`ALLIANCE_FORCE_TARGET_FORBIDDEN`);
- an assassination names a target unit (`ASSASSINATION_TARGET_REQUIRED`);
- you own at least as many spies as you send (`INSUFFICIENT_SPIES`), and at least as many infiltrators or assassins for those missions (`INSUFFICIENT_INFILTRATORS`, `INSUFFICIENT_ASSASSINS`). The API route also checks you have enough level 1 spies for intel and level 2 for infiltration;
- the level gap is within `ATTACK_LEVEL_RANGE` (default 5), the same range as attacks (`TARGET_OUT_OF_RANGE`);
- you have the committed attack turns (`INSUFFICIENT_ATTACK_TURNS`);
- your spy offense power is not zero (`INSUFFICIENT_SPY_OFFENSE`).

Spy missions have no protection check. Battle protection neither blocks them nor softens them.

### Daily limits

Counted over the last game day (a rolling window):

| Mission | Per target | Per day, all targets |
|---|---|---|
| Intel | 5 (`INTEL_MAX_PER_TARGET_PER_DAY`) | none |
| Infiltration | SPY structure table below (refused with code `SPY_TARGET_DAILY_LIMIT`) | SPY structure table (refused with code `SPY_DAILY_LIMIT`) |
| Assassination | SPY structure table | SPY structure table |

Infiltration and assassination are locked until the SPY structure reaches the level where the limit is above zero (`INFILTRATION_LOCKED`, `ASSASSINATION_LOCKED`). The limits are fixed by the SPY structure level:

| SPY level | Infiltrators per mission / per target / per day | Assassins per mission / per target / per day |
|---|---|---|
| 1 to 6 | locked | locked |
| 7 | 3 / 1 / 1 | locked |
| 8 | 3 / 1 / 2 | locked |
| 9 | 3 / 2 / 3 | locked |
| 10 | 4 / 2 / 4 | locked |
| 11 | 5 / 2 / 5 | locked |
| 12 | 5 / 3 / 6 | locked |
| 13 | 6 / 3 / 7 | locked |
| 14 | 6 / 3 / 8 | locked |
| 15 | 7 / 4 / 9 | locked |
| 16 | 7 / 5 / 10 | 10 / 1 / 10 |
| 17 | 7 / 5 / 11 | 20 / 1 / 10 |
| 18 | 7 / 5 / 12 | 30 / 2 / 20 |
| 19 | 7 / 5 / 13 | 40 / 2 / 20 |
| 20 | 7 / 5 / 14 | 50 / 2 / 20 |
| 21 | 7 / 5 / 15 | 60 / 3 / 30 |
| 22 | 7 / 5 / 16 | 70 / 4 / 40 |

Each SPY level also adds 5% to spy offense (level 1 adds 0).

### The entry contest

Every mission first has to get in.

- Your spy force is your whole spy network's melee attack power (all spy levels, with your SPY structure bonus, INTEL bonus and race multiplier), times `turns ^ 0.35`. It counts in full as long as you send at least one spy; how many you send does not change it.
- The target's sentry force is its SENTRY defense power (with sentry structure bonus, INTEL bonus and race multipliers).
- Spy pressure hardens the target. Pressure is the committed turns of every mission the target has absorbed today (success or fail). It makes the sentry force `max(1, sentry / max(0.35, 1 / (1 + pressure / 16))) + pressure x 0.5`. The `+ pressure x 0.5` term applies even to a target with no sentries.
- The mission gets in only if your spy force is strictly greater than the adjusted sentry force. Otherwise it fails. There is no dice roll in this step; the result is exact.
- Spy pressure resets on the next game day. It has no cap.

### What happens after entry

- **Failed intel or infiltration:** all spies sent are lost.
- **Failed assassination:** the loss share is `min(1, (1 - ratio) x 0.6 + 0.4 + turns / 10 x 0.15)` of the squad, times a random 0.9 to 1.1, rounded up. Ratio is your force over the adjusted sentry force.
- **Successful entry:** no spies are lost, because success needs a ratio above 1.

**Intel.** Intel quality is `min(100, surviving spies x 10 x turns ^ 0.45)` percent. Ten spies on one turn give 100%; five spies need about five turns. If quality is above zero the report includes:

- the target's exact total population (units and mercenaries), always;
- a random selection of the other fields, `round(14 x quality / 100)` of them at least 1: offense, defense, spy offense, sentry defense, units, mercenaries, items, fort level, fort hit points, defense bonus, SPY level, SENTRY level, gold on hand, banked gold. Fields that are chosen show exact values;
- units and mercenaries are sampled by headcount to about the quality share of troops; items are sampled to the quality share.

**Infiltration.** Fort damage is `floor(current fort HP x cap x ratio share x force share x random 0.9 to 1.0)`:

- cap is `min(12%, 2.5% + 0.95% x turns)`;
- ratio share is `ratio / (1 + ratio)`;
- force share is `force / (force + 50)`, where force is the surviving infiltrators' attack power times `turns ^ 0.35`.

It does nothing if the fort has 0 HP. Damage is real fort damage that the defender must repair with gold.

**Assassination.** Kills are the smallest of:

- `floor(attack x penetration / average target HP)`, where attack is the surviving assassins' attack times `turns ^ 0.35` and penetration is `attack / (attack + target defense)`;
- the number of target-type units the defender has;
- `floor(population x (1% + 3% x (turns / 10) ^ 1.1))`;
- the defender's remaining daily casualty allowance, shared with battles (7 days of rebuild throughput per game day);
- 10% of the target type per game day across all attackers (`ASSASSINATION_DAILY_TYPE_SHARE`).

Only units the defender's fort level lets them field (and always citizens and workers) can die. Regular units die before mercenaries.

### Sentries and defending

- Sentries and your own spies defend you. Only sentry power counts in the entry contest. Citizens never help against spies.
- A mission the defender stops (the mission fails) is recorded as a defender win. The defender gets a Discord alert (if opted in) and a live notice. The spy is not named.
- A mission that gets in is not shown to the defender.
- The stats `SPY` (attacker) and `SENTRY` (defender) count missions won and lost.

### Reports

- Each mission is saved in the attack log as type `INTEL`, `INFILTRATE` or `ASSASSINATE` with a sealed replay of the dice, pressure and daily caps used.
- The attacker sees their spy losses and, on a success only, the entry odds. A failed mission never shows the odds, because they would reveal the defender's sentry strength.
- The defender sees only the missions they caught, and their own per-unit losses from an assassination.
- Intel snapshots drop database row ids before being sent to the player.
- Intel reports can be shared in alliances (alliance intel feed).

## Why it works this way

- The entry check is a contest of forces rather than a chance roll (issue #97, `effectiveStats.ts`). The whole spy force counts so the dispatched squad decides losses and gains, not whether the mission gets in (`spyFunctions.ts` comments).
- Spy pressure also adds phantom sentry strength so repeated missions on one target harden it even with no sentries; a 5-spy intel squad is a coin flip after about 30 turns (`v5Combat.ts`).
- Population is always exact because the attack list already shows it (issue #286). Unit groups are sampled by headcount because one big worker group made 82% intel show 31% (playtest #286, `spyFunctions.ts`).
- Intel fields round rather than floor so near-full intel does not drop a whole field (`spyFunctions.ts`).
- Assassinations draw from the defender's shared daily casualty allowance and a per-type share so many attackers cannot wipe a unit type (`v5Combat.ts`).
- Failed-mission odds are hidden because they invert to the defender's sentry strength (`SpyService.ts`).
- Spy missions do not get the combat XP multiplier from game events (`SpyService.ts`).

## Admin and settings

- Runtime Settings (`/home/admin/settings`, System: Runtime Settings): `ENABLE_INTEL`, `ENABLE_INFILTRATIONS`, `ENABLE_ASSASSINATIONS` (each default off), `ATTACK_LEVEL_RANGE` (default 5).
- Mission turn limits, per-target limits, pressure weights, and the assassination caps are code constants in `v5Combat.ts` and the SPY structure table in `Structure_Upgrades.tsx`, not runtime settings.
- Spy missions are not voidable. The battle void tool accepts only `attack` logs.

## Source

- [spy API route](../../src/pages/api/spy/[id].ts): input validation per mission type
- [SpyService.ts](../../src/services/SpyService.ts): checks, limits, persistence, redaction of the live result
- [spyFunctions.ts](../../src/utils/spyFunctions.ts): entry contest, intel snapshot, infiltration, assassination
- [results.ts](../../src/utils/spy/results.ts): result shapes
- [effectiveStats.ts](../../src/utils/balance/effectiveStats.ts): the force contest
- [v5Combat.ts](../../src/utils/balance/v5Combat.ts): turn bounds, pressure, intel quality, mission power
- [Structure_Upgrades.tsx](../../src/constants/Structure_Upgrades.tsx): SPY structure limits
- [UserUnitsService.ts](../../src/services/UserUnitsService.ts): spy limits and unit totals
- [AttackValidationService.ts](../../src/services/AttackValidationService.ts): untargetable statuses
- [AttackLogAccess.service.ts](../../src/services/AttackLogAccess.service.ts): spy report redaction by viewer
- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts): feature switches

## Tests

- [AttackService.test.ts](../../src/services/__tests__/AttackService.test.ts): the spy level-range refusal and the daily mission cap.
- [spyFunctions.test.ts](../../src/utils/spyFunctions.test.ts): dispatch, loss bounds, assassination conservation, intel snapshots
- [spyFunctions.v5.test.ts](../../src/utils/spyFunctions.v5.test.ts): force contest, pressure, daily assassination caps, intel coverage
- [spy.test.ts](../../src/app/spy.test.ts), [assassinate.test.ts](../../src/app/assassinate.test.ts), [infiltrate.test.ts](../../src/app/infiltrate.test.ts): mission results on real user models
- [intelPopulation.test.ts](../../src/utils/intelPopulation.test.ts): population in reports
- [AttackService.test.ts](../../src/services/__tests__/AttackService.test.ts): intel per-target limit and attacker view of spy results, spy costs no stamina
- [spy.api.test.ts](../../src/__tests__/pages/api/spy.api.test.ts): API validation
- [spyBehavior.test.ts](../../src/sim/spyBehavior.test.ts): simulator checks of range, locks and daily limits
- [stamina.test.ts](../../test/integration/stamina.test.ts): spy missions leave stamina untouched

## Known gaps

- No live-service test covers `MISSION_DISABLED`, `DEFENDER_UNAVAILABLE`, `SPY_DAILY_LIMIT`, or the live `TARGET_OUT_OF_RANGE` check. Simulator tests cover the range and daily limits only.
- Result objects still carry `probabilityModel = 'LOGISTIC'`, and `computeSpySuccessProbability` / `resolveSpyMissionSuccess` still exist with tests, but the live contest is the deterministic `resolveSpyForceContest`. `successProbability` is therefore always 0 or 1. `SPY_SENT_WEIGHT` and `SPY_NETWORK_WEIGHT` are defined but nothing reads them.
- `AssassinationResult` has `experienceGained` and `goldStolen` fields that nothing sets; both stay 0. There is no steal mission.
- `canAssassinate` and `canInfiltrate` in `AttackValidationService.ts` are unused with a hard-coded 5; the live limits come from the SPY structure table.
