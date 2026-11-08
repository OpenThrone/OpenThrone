# Kingdom morale and fatigue

Last verified against code: 2026-11-06 (alpha 43c5fff7)

Two separate things tire a kingdom. Kingdom morale is a slow 0 to 100 meter that follows how well you defend and how often you play; when it gets low, people leave. Garrison fatigue is a same-day penalty on a defender who is attacked again and again. The attacker's own tiredness comes from the away-army penalty (below) and from stamina (see [stamina.md](stamina.md)).

## Rules

### Kingdom morale

- Morale is a whole number from 0 to 100. A new kingdom starts at 100.
- It changes in four ways: a battle you defend, the daily pass, releasing captives, and (as a floor) the Human Discipline upgrade.

**Battle (defender only).**

| Result | Change |
|---|---|
| Attacker wins (defense lost) | -3 |
| Attack repelled (defense held) | +2 |

- Attackers' morale does not change.
- Protected defenders and defenders whose account is not ACTIVE (vacation and similar) never gain or lose morale in battle. See [protection.md](protection.md).
- A voided battle reverses its morale change.

**Daily pass.** Once per game day, per player, after the growth update. Players who have not been active since the current era began are skipped.

| Last active | Change |
|---|---|
| Under 24 hours ago | +5 |
| 24 to 48 hours ago | +3 |
| Over 48 hours ago | -5, minus another 5 for each full week away, at most -15 |
| Never | -15 |

- A kingdom with 0 or less gold and an active mercenary contract takes an extra -3 (`MORALE_BROKE_MERCENARY_UPKEEP`).
- Protected players, and players whose account is not ACTIVE, are skipped entirely: no drift and no desertion.
- Running the pass twice on one game day does nothing the second time.
- A captor who releases captives from their dungeon gives the source kingdom +2 (`RELEASE_MORALE`).
- Human Discipline (racial upgrade, tier 1 to 4) sets a morale floor of 5 per tier. Morale never falls below it.

**What low morale does.** Desertion only happens when `ENABLE_DESERTION` is on (default off). With it off, morale still moves and nobody leaves.

| Morale after the daily change | Effect, each day |
|---|---|
| Below 40 | 1% of citizens leave, per unit row, only for rows of 100 or more |
| Below 20 | 1% of the trained army deserts (at least 1 if the army is 100 or more); 10% of surviving mercenaries leave (at least 1 if 10 or more survive) |

- "Trained army" means non-mercenary OFFENSE, DEFENSE, SPY and SENTRY units. Citizens and workers do not count. The percentage is taken from the whole army and spread over rows in proportion to their size, so splitting an army into many stacks does not avoid it.
- The army never falls below 75% of its desertion floor. The floor is the size of the trained army the first time morale drops under 20 in the era. It only rises afterward (when morale is back at 20 or more and the army is larger) and is cleared only by an era reset.
- Mercenary contracts that reach 0 survivors are closed.
- Human Discipline cuts desertion to 75%, 60%, 45% or 30% of normal at tiers 1 to 4. Tier 4 keeps morale at 20, so army desertion (below 20) never starts for it.
- Half of the deserting trained units defect, the other half vanish. Defectors go to the player who attacked this kingdom most in the last 72 hours (ties go to the most recent attacker, voided battles do not count). That player must:
  - be in the current era and active within the last 24 hours;
  - have an ACTIVE account, not be protected, and share no active alliance with the loser;
  - not be the loser.
- A recipient gains at most 1% of its own trained army per game day from defectors. Defectors arrive as untrained level 1 citizens. Whatever cannot go to a recipient vanishes.
- Whatever the desertion switch says, mercenary hire and renewal are refused below 20 morale (message "Mercenaries won't sign with a kingdom this demoralised"). Dismissals stay open.
- Each pass that changes morale, or desertion happens, is logged for the player with the rule used and the numbers.
- The Overview shows a morale meter (steady at 40 or more, restless at 20 to 39, mutinous below 20) and the desertion log only when `SHOW_KINGDOM_MORALE` is on (default off). Morale runs whether or not it is shown.

### Garrison fatigue (defense pressure)

- Defense pressure is a counter on the defender that resets each game day.
- After each battle: if the attacker wins, pressure rises by the committed turns. If the attack is repelled, it rises by half the committed turns, rounded up. Pressure never falls below what earlier attackers built that day.
- Fatigue multiplier on the garrison's defense in the assault check: `max(0.85, 1 - 0.0025 x pressure)`. It reaches the 15% floor at 60 pressure.
- Fatigue decides whether the wall holds and whether loot pays. It does not change fort damage, counter damage or casualty budgets by itself. Pressure does, separately, shrink the defender's casualty budget by `1 / (1 + pressure / 20)` (the dogpile protection in [combat.md](combat.md)).
- Battle reports show "Garrison fatigue: -X%" to both sides.
- With `ENABLE_GARRISON_FATIGUE` off, the battle sees zero pressure, so both the fatigue multiplier and the casualty-budget factor are off. Pressure is still recorded, so turning it back on mid-day applies the day's pressure.
- The attacker's own incoming pressure never reduces the attacker's losses.
- Spy missions have a separate counter, spy pressure. See [spying.md](spying.md).

### Away-army fatigue

During one attack, the attacker's attack and defense are multiplied by `1 - 0.02 x (turn - 1)`, so 82% on turn 10. This is part of the battle itself and is not stored.

## Why it works this way

- Morale and garrison fatigue are tuned in `KingdomMorale.ts` (issues #204 and #205).
- A repelled attack refunds only half its turns so repelling many attacks still tires the garrison and never erases other attackers' pressure (`KingdomMorale.ts`).
- Fatigue tips the wall but pressure never adds losses: "pressure never adds losses" (`attackFunctions.ts`).
- Desertion is computed on the whole army so many small stacks cannot evade it, and the floor is recorded once per era so recover-and-crash cycles cannot re-arm a fresh bleed of a shrinking army (`KingdomMorale.service.ts`).
- Defectors arrive as untrained citizens, and a recipient's daily gain is capped, to limit defector farming; an admin-only cheat signal watches for it (`KingdomMorale.ts`, issue #205).
- Protected new players and non-ACTIVE accounts are exempt so battle and decay never move their morale (`AttackService.ts`).

## Admin and settings

- Runtime Settings (`/home/admin/settings`): `ENABLE_DESERTION` (default off), `SHOW_KINGDOM_MORALE` (default off), `ENABLE_GARRISON_FATIGUE` (default on).
- Every number (the +5, -3, 40, 20, 1%, 0.0025, 0.85) is a code constant in `KingdomMorale.ts`, not a setting. The fatigue per pressure and minimum multiplier are also frozen into each combat ruleset (`defenderFatigue`).
- Defector farming is flagged for staff as a cheat signal (14-day window, 3 or more days or half or more of the loser's desertion). It is a signal only; nothing is applied automatically. See the cheat signals page (`/home/admin/cheat-signals`).

## Source

- [KingdomMorale.ts](../../src/constants/KingdomMorale.ts): all morale and fatigue constants and helpers
- [KingdomMorale.service.ts](../../src/services/KingdomMorale.service.ts): the daily pass, desertion, defection
- [AttackService.ts](../../src/services/AttackService.ts): morale and pressure after a battle
- [attackFunctions.ts](../../src/utils/attackFunctions.ts): fatigue in the assault check, away-army fatigue
- [CronJob.service.ts](../../src/services/CronJob.service.ts): schedules the daily pass
- [Mercenary.service.ts](../../src/services/Mercenary.service.ts): hiring refusal under low morale
- [Captives.ts](../../src/constants/Captives.ts) and [Captives.service.ts](../../src/services/Captives.service.ts): release morale
- [RacialPerks.ts](../../src/constants/RacialPerks.ts): Discipline floor and desertion reduction
- [KingdomMoraleMeter.tsx](../../src/components/overview/KingdomMoraleMeter.tsx): meter and states
- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts): switches

## Tests

- [KingdomMorale.test.ts](../../src/constants/KingdomMorale.test.ts): clamping, daily drift, desertion amounts, floor, fatigue math
- [kingdomMorale.test.ts](../../test/integration/kingdomMorale.test.ts): battle morale, exemptions, daily drift, desertion, defection, mercenaries, fatigue switch
- [kingdomMoraleEdges.test.ts](../../test/integration/kingdomMoraleEdges.test.ts): daily idempotence, concurrency, defection caps, floor over time
- [attackFunctions.goldPillage.test.ts](../../src/utils/attackFunctions.goldPillage.test.ts): a breach that happened only through fatigue still pays loot
- [Captives.test.ts](../../src/constants/Captives.test.ts): captive rules

## Known gaps

- No test pins the garrison fatigue effect on the casualty-budget factor, or what the `ENABLE_GARRISON_FATIGUE` off switch does to it.
- No test covers Human Discipline's effect on desertion, or that tier 4 never reaches the army-desertion threshold.
- The away-army fatigue (`calculateCombatFatigue`) has no dedicated test; it is exercised only through battle tests.
- Citizens desert per unit row. A kingdom with citizens split over several level rows could see rows under 100 skip desertion; in practice citizens are one level 1 row.
