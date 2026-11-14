# Combat

Last verified against code: 2026-11-13 (alpha 237e566f)

An attack spends attack turns, and optionally stamina, to fight another player's kingdom. Every attack is one server-side battle that produces a winner, casualties on both sides, damage to the defender's fort, gold taken from the defender, and experience (XP) for both. The browser never decides any of it.

This page describes the live ruleset, `combat-v14`. Older rulesets stay in the code only so old battle reports can be replayed.

## Rulesets

- Every battle is fought under one frozen ruleset and sealed with its version (`combat-vN`) in the battle log.
- The newest registered ruleset is the live one. Today that is `combat-v14`. Versions v9 to v14 are registered; v7 and v8 cannot be rebuilt.
- Each version is the previous one plus overrides:
  - v9: gear parity, troop-only chip damage, mercenaries take the front line.
  - v10: casualties spread over all unit tiers by headcount.
  - v11: battle XP follows effort, plus the anti-camping XP ramp.
  - v12: per-battle casualty caps round up by chance instead of down.
  - v13: the defender's casualty budget is anchored to the units engaged in the battle, and civilians engage only when the fort falls.
- Tables (units, items, forts, upgrades, XP per level) come from the ruleset, not the live game tables, when a battle is replayed.
- Balance numbers below are the `combat-v14` values. They are code constants, not admin settings, unless a setting key is named.

## Rules

### Who can attack whom

An attack is refused unless all of these hold. Codes are returned in the API response.

| Check | Rule | Code |
|---|---|---|
| Request | `turns` is a whole number from 1 to 10 | `INVALID_ATTACK_TURNS` |
| Target | Not yourself | `SELF_ATTACK` / `SELF_TARGET_FORBIDDEN` |
| Target status | Target is not on vacation, closed, banned, suspended, timed out or resetting | `DEFENDER_UNAVAILABLE` |
| Era participation | Target has been active since the current era began | `DEFENDER_NOT_ACTIVE_THIS_ERA` |
| Turns | You have at least the committed attack turns | `INSUFFICIENT_ATTACK_TURNS` |
| Army | You own at least one OFFENSE unit row | `NO_OFFENSIVE_UNITS` |
| Feature switch | `ENABLE_ATTACKING` is on (default on) | `ATTACKING_DISABLED` |
| Alliance troops | You have not borrowed troops from an alliance the target belongs to | `ALLIANCE_FORCE_TARGET_FORBIDDEN` |
| Offense | Your offense power is above zero | `NEGLIGIBLE_OFFENSE` |
| Level gap | `abs(your level - target level)` is at most `ATTACK_LEVEL_RANGE` (default 5) | `LEVEL_RANGE_EXCEEDED` |
| Pair limit | Fewer than `combat.pairDailyLimit` (default 5) non-voided attacks from you on this target in the last game day | `TOO_MANY_ATTACKS` |
| Friendly fire | If you and the target share an active alliance, the request must carry `confirmAllianceAttack` | `ALLIANCE_MEMBER_CONFIRMATION_REQUIRED` |

Other facts:

- Being protected does not stop anyone from attacking you or you from attacking. Protection changes the numbers; see [protection.md](protection.md).
- Attacking while protected does not end protection.
- The pair limit counts only plain attacks (`type = attack`) that have not been voided. Spy missions have their own limits. The window rolls, so the refusal tells the player when their next attack on that target opens.
- Stamina never blocks an attack; see [stamina.md](stamina.md).
- Both players' rows are locked (in id order) for the whole battle, so concurrent attacks queue instead of reading stale balances. Gold, turns and stamina are saved as deltas.
- The request has an idempotency key guard and a rate limit profile (`attack`).

### Where strength comes from

Offense and defense power come from `calculateStrength`, shared by the battle engine, the Overview and the simulator.

- Units: each unit type and level has attack and defense power on a melee channel and a ranged channel. Units whose tier needs a higher fort level than yours do not count.
- Gear: weapons, helm, armor, boots, bracers and shield. Each slot goes to one unit. The best items go to the highest-level units first. Your own gear does not go to mercenary or alliance contract units, which carry their own kit.
- Battle upgrades: extra items that cover a number of units each, limited by your OFFENSE structure level.
- Multiplier: `(1 + bonus / 100) x race multiplier`, applied to units, gear and upgrades together.
  - Offense bonus is the sum of race/class OFFENSE bonuses, bonus points (`1 + 0.35 x L / (L + 250)`) and the OFFENSE structure upgrade.
  - Defense bonus is the sum of race/class DEFENSE bonuses, bonus points and your fort's defense bonus.
  - Race multipliers: Human 1.02 offense and 1.02 defense; all others 1.0.
- Mercenary contract units: primary stat x1.25, other stat x0.8, hit points x0.8.
- Totals are rounded up to whole numbers.
- Defense in a battle also includes, only once they join: citizens and idle workers at 10% effectiveness, and the defender's own OFFENSE units at 70% (see Civilians below).

### Battle turns

You commit 1 to 10 turns. The battle plays those turns in order.

- Odd turns (1, 3, 5, ...) are attacker assaults. Even turns are defender turns. A 10-turn attack is five assaults and five defender turns; a 1-turn attack is one assault.
- The away army tires: its attack and defense are multiplied by `1 - 0.02 x (turn - 1)` (82% on turn 10).
- Each turn, melee and ranged attack roll an independent damage variance between 0.92 and 1.08.
- Low stamina multiplies the attacker's attack by the stamina multiplier (see [stamina.md](stamina.md)).
- The battle ends early when your offense units are all dead, or when the defender has nothing left to hit.

**An assault is won** when `attack pressure x stamina multiplier` is greater than the contest defense pressure, and you still have offense units.

- Attack pressure is melee attack plus ranged attack.
- Defense pressure is matching defense: melee attack meets melee defense, ranged attack meets ranged defense. A melee-only assault also meets half (`RANGED_DEFENSE_ASSAULT_WEIGHT` 0.5) of the defender's ranged defense.
- Contest defense is defense pressure times the defender's garrison fatigue multiplier (see [morale.md](morale.md)). Fatigue changes only whether the wall holds and whether loot pays; it never adds losses.

**The battle is won** by the attacker only if they won more assault turns than they lost. A tie, or all offense units dead, goes to the defender.

Report reasons: `FORT_BREACHED` (walls fell), `DEFENSE_WIPED`, `ASSAULT_SUCCEEDED` for a win; `ATTACKER_REPELLED` or `DEFENDER_HELD` for a loss. Loot and fort damage earned on won assault turns are kept even if the final verdict is a loss.

### Civilians join when the fort falls

Since combat-v13, citizens and workers fight at 10% effectiveness, can be hit, and count in the defender's casualty budget together, from the moment the fort reaches 0 HP. Before that they do none of these, even when the guards are dead. The defender's OFFENSE units join at 70% only when the fort is down and the defense units are gone.

### Damage and casualties

Each turn's damage is turned into dead units, within several caps.

1. Mitigated damage: attack minus matching defense, but never below a chip floor of 5% of the attack. On an assault, the chip floor scales from 0 at a 0.25 attack/defense ratio to full at 0.75 (`CHIP_TAPER_START_RATIO`, `CHIP_TAPER_FULL_RATIO`). On an assault that fails, chip damage scales with the troops' share of attack, so gear alone does not add losses to a defense that holds (`CHIP_FROM_TROOPS_ONLY`).
2. Piercing: if the attack/defense ratio is above 1, damage is multiplied by `1 + log10(ratio)` (ratio capped at 100).
3. Fort soak: while the fort stands, damage to defenders is multiplied by `1 - 0.5 x fort HP share`.
4. Defender mitigation: `(fort tier mitigation + CASUALTY bonuses) x fort HP share + armory mitigation`, capped at 75%.
5. Protected defender: damage is halved (`PROTECTED_DAMAGE_MULTIPLIER` 0.5).
6. A won assault always lands: if the assault is won and the defender has lost nobody yet, damage is raised to at least one defender's hit points, unless the daily allowance is spent.
7. Ranged counter: on each attacker turn, defender ranged power also hits the attacker's army. Standing walls raise it by up to 25%.

Dead units are chosen per side:

- Lowest tier is hit first in the engine, but the dead are then charged across all unit tiers in proportion to headcount (v10). Mercenaries take twice their share within a type and level (`MERC_LOSS_WEIGHT`).
- No unit stack loses more than 40% of its size in one battle (`PER_STACK_CASUALTY_CAP`), but any stack can lose at least one.
- About 30% of the fallen are wounded instead of dead (`WOUNDED_SHARE`, rounded down). Wounded units leave the army and heal 35% of each wounded group per day, at least one unit per group (`WOUNDED_HEAL_RATE_DAILY`).

### Casualty budget

A side's losses in a battle are limited by a budget, computed each phase from totals so far.

- Ceiling: the smaller of 5 days of rebuild throughput and 8% of the population at risk.
  - Throughput is `(225 + 25 + housing citizens per day) x race citizen-recovery multiplier` (Goblin 1.05). Subscriber throughput is not passed in battle.
- The ceiling is scaled by:
  - turns: `min(1, 0.08 x turns^1.15)`, where turns is the turn number reached;
  - level gap: `clamp(1 - (opponent level - own level) x 0.08, 0.8, 1)`;
  - win quality: damage received divided by damage dealt, battle total, clamped to a floor of 0.3 for the defender and 0.5 for the attacker (`DEFENDER_WIN_QUALITY_FLOOR`, `ATTACKER_WIN_QUALITY_FLOOR`);
  - fort protection (defender only): `(1 - 0.3 x fort HP share) x (1 - 0.25 x fort HP share)`;
  - dogpile protection (defender only): `1 / (1 + defense pressure today / 20)`.
- Casualties are then soft-capped (`budget x (1 - e^(-population / budget))`) and hard-capped at 8% of the population (`SINGLE_ATTACK_POPULATION_LOSS_CAP`). Both round up by chance with probability equal to the fraction (v12), one random draw per side per battle.
- Population at risk:
  - Attacker: offense units sent, plus their losses so far.
  - Defender (v13): units engaged, which is defense units (plus offense units if they have joined), plus citizens and workers once the fort is down, plus losses so far.
- Protected defender: losses are also capped at 1.5% of population at battle start, minimum 1 (`PROTECTED_LOSS_CAP_SHARE`).
- Daily dogpile cap (defender only): all attackers together may not destroy more than 7 days of throughput per game day (`DAILY_CASUALTY_RECOVERY_DAYS`). It is reduced by today's non-voided battle and assassination losses (killed plus wounded). The attacker has no daily cap.
- If garrison fatigue is switched off (`ENABLE_GARRISON_FATIGUE`), the battle sees zero defense pressure, so the dogpile protection factor above is also off.

### Fort damage

- Only assaults on a standing fort damage it. Damage per assault turn is a share of the fort tier's maximum HP, from the ratio of attack pressure to the manned wall (defense pressure plus the fort's own defense power):
  - ratio 1 or more: 2% (`MIN_SHARE_PER_TURN`) rising to 7% (`MAX_SHARE_PER_TURN`) at ratio 3;
  - ratio from 0.35 to 1 (a repelled assault): up to a third of a marginal success (`CHIP_*`);
  - below 0.35: none.
- Multiplied by up to 1.25 if defense units are under 25% of the defender's population.
- A battle removes at most 30% of max HP (`PER_BATTLE_CAP_SHARE`). A reaching assault removes at least 1 HP, but only a won assault can take the last hit point. There is no daily wall cap.
- Fort damage is repaired with gold in the Repair page; it is not a casualty.

### Loot (gold)

Gold comes only from won assault turns.

- Each won assault turn takes the slice of the cap that its covered turns represent: `covered turns / 10`, where covered turns is 2 (or the turns left, if fewer). A fully won 10-turn attack reaches the cap; a 1-turn raid earns a tenth of it.
- Cap share: 22% of the defender's gold (`MAX_GOLD_PILLAGE_SHARE`), scaled from 25% while the fort stands up to 100% once it is breached (`FORT_LOOT_CAP_FLOOR_SHARE`).
- Each turn's pillage is multiplied by:
  - level gap: `clamp(1 + (defender level - attacker level) x 0.05, 0.7, 1.25)`;
  - under-defended reward: up to 1.25 if defense units are under 25% of the population;
  - Goblin attacker: 1.03;
  - a random 0.92 to 1.00.
- Defender level factor on the unprotected-rate gold: 0.8 for defender levels 1 to 9, 0.7 at level 10 rising linearly to 1.0 at level 20, 1.0 above.
- Gold shield (protected defenders only): the first 100,000 gold on hand is shielded and raiders take a cap share of it multiplied by 0.1 at level 1, rising linearly to 1.0 at level 10. Gold above 100,000 is raided at the normal rate. See [protection.md](protection.md).
- Hard limits: gold on hand; the battle-wide cap computed from the start-of-battle treasury; and for protected defenders only, 50% of the start-of-day treasury across all attackers per game day (`DAILY_GOLD_PILLAGE_SHARE_CAP`). Unprotected defenders have no daily gold ceiling.
- Banked gold cannot be taken.
- Pillage moves from the defender's hand to the attacker's hand, minus any share diverted to alliance troop contracts or alliance loans. The bank history records it as `WAR_SPOILS`.

### Experience

Per battle, with `turns` the turns actually played (not the turns committed, if the battle ended early):

```
base = turns x XP per turn x commitment x level gap x closeness x stamina factor x fort bonus
```

- XP per turn by attacker level: 360 up to 10, 300 up to 25, 260 up to 50, 230 up to 75, 200 above.
- Commitment: `clamp(0.22 + 0.78 x (turns / 10)^0.85, 0.25, 1)`.
- Level gap: `clamp(1 + (defender level - attacker level) x 0.08, 0.35, 1.45)`.
- Closeness: from attack power over defense power at the start, `clamp(1.25 - abs(1 - ratio), 0.75, 1.18)`.
- Stamina factor: `clamp(attacker stamina / 100 - 0.025 x turns, 0.25, 1)`. Stamina is the pre-attack value (100 when stamina is disabled).
- Fort bonus: x1.1 if the fort went from above 0 to 0 HP in this battle.

Then:

- Attacker wins: attacker gets `base`; defender gets `base x 0.25 x threat x stall`.
- Attacker loses: attacker gets `base x 0.22 x effort`; defender gets `base x 0.75 x threat x stall`.
- Effort is 0 at an attack/defense ratio of 0.25 or less and 1 at 0.75 or more. Threat is `max(0.15, effort)`.
- Stall (anti-camping): 1 for the first 3 game days at a level, then +0.25 per further whole day, up to 3x. It applies to defender XP only.
- Active game events may multiply both XP amounts. Spy missions give no XP.

### Level gap rules

- Attack and spy range: `ATTACK_LEVEL_RANGE`, default 5, same range for both. The range is fixed; it does not grow with level.
- XP, loot and casualty budgets each take a smaller or larger share by level gap, as listed above.

### After the battle

Within the same transaction the server also:

- Subtracts the committed attack turns and the stamina cost from the attacker.
- Records the battle in the attack log with a sealed, encrypted replay, and updates the WON/LOST counters.
- Moves the defender's kingdom morale and garrison pressure (see [morale.md](morale.md)).
- Resolves dungeon captives, Undead reanimation and Elf Sanctuary recovery where those features apply. Protected defenders and non-ACTIVE accounts are exempt from all three.
- Queues a battle alert email and Discord alert for the defender.

The battle API also pushes a live notification (`attackNotification`) to the defender, over Socket.IO on a Node host and through the player's Durable Object mailbox on Workers (`realtime.ts`, mailbox allowlist `USER_MAILBOX_NOTIFY_EVENTS` in `realtimeTransport.ts`). An open tab shows a translated toast linking to the battle report and refetches the defender's numbers (`useGameEventAlerts`, `gameEventAlerts.ts`). The first load of a tab after time away also says the player was attacked meanwhile (`beenAttacked`, once per tab). Nothing is pushed when realtime is switched off.

### Battle reports and replays

- The log stores a redacted view by viewer role. Both sides see damage, XP, pillage, fort damage, loss totals, wounded totals, "Garrison fatigue" and "Low stamina" percent, stamina cost, and captives taken.
- Only the attacker sees their own unit levels and loss breakdown. Only the defender sees their own loss breakdown and absolute fort HP. Defender rosters and replay inputs are never returned.
- A participant who can read a report can re-run ("retest") it. The target of a spy mission that got through cannot read it ([spying.md](spying.md)). The attacker can share it with members of a chat room they are in; a recipient can read and retest it but cannot reshare it. A retest of an old battle uses the ruleset version sealed in the log.

### Voiding a battle

An administrator can void a battle (type `attack` only) with a written reason of up to 500 characters.

- The flow is preview then confirm. The confirm must carry the hash of the previewed plan; if either player changed in between, it is refused as stale.
- Voiding is refused for battles from an earlier era and for battles already voided.
- The void returns or takes back: gold (`full` mode credits the defender the whole pillage, `recovered` only what can be clawed back), fallen and wounded units, fort damage, attack turns, stamina, XP, WON/LOST counters, kingdom morale, garrison pressure, captives, reanimation and Sanctuary grants, alliance loan repayments and force pillage cuts. Items it cannot fully reverse are recorded as capped or not reversed.
- The log is never rewritten. It is marked voided by an administrator for both players, and both get a message.
- A voided battle stops counting toward the pair limit, the daily casualty and gold allowances, and defector selection.

## Why it works this way

- Combat rulesets are frozen and versioned so a battle sealed under `combat-vN` replays under the numbers it was fought with, whatever the live game has become since (`combatRuleset.ts`).
- Casualty budgets are anchored to what a player can rebuild in a day, so no battle or day of attacks wipes someone out (`v5Combat.ts` comments on `CASUALTY_BUDGET_RECOVERY_DAYS` and `DAILY_CASUALTY_RECOVERY_DAYS`).
- The attacker's win-quality floor of 0.5 is described as an anti-farming cost: decisive raids still pay at least half the casualty budget (issue #200).
- Chip damage tapers with the ratio so badly outmatched assaults stop chipping the defense (issue #200). Chip comes from troops only so gear decides breakthroughs without adding losses to a defense that holds (issue #202).
- Fort damage is a share of max HP so a Manor and a Citadel both take several committed assaults to breach (`v5Combat.ts`).
- Loot is linear in commitment so a fully won 10-turn attack reaches the cap and a 1-turn raid earns a tenth of it (`attackFunctions.ts`).
- v10 spreads losses over tiers so a screen of level 1 troops cannot shield the best units (CHANGELOG, issue #203).
- v12 rounds caps by chance because a cap rounded down meant an army of 12 or fewer could never lose a unit (CHANGELOG).
- v13 anchors the defender's budget to engaged units because idle workers and citizens behind standing walls grew the garrison's casualty allowance though only guards can die (issue #303, CHANGELOG).
- The anti-camping XP ramp pushes players who stay at one level out of it (issue #334, `combat-v11/ruleset.ts`).
- Defenders earn XP by the size of the threat so trading deliberate losses does not level anyone (CHANGELOG).

## Admin and settings

- Settings page: Administration, System: Runtime Settings (`/home/admin/settings`). Combat keys:
  - `combat.pairDailyLimit` (default 5, 0 to 1000);
  - `ATTACK_LEVEL_RANGE` (default 5, 1 to 100; can also come from `NEXT_PUBLIC_ATTACK_LEVEL_RANGE`);
  - `ENABLE_ATTACKING` (default on);
  - `ENABLE_GARRISON_FATIGUE` (default on);
  - `ENABLE_REANIMATION` (default on) and `SHOW_DUNGEON` (default off) change after-battle effects;
  - protection and stamina keys are listed in their own pages.
- Battle list and void tool: `/home/admin/attacks` (calls `/api/admin/attacks/void`, administrator only, audited).
- Balance simulator: `/home/admin/balance-sim`; it can override the live battle knobs on the current ruleset.
- Every other number on this page is a code constant. Changing one means adding a new ruleset version, never editing a shipped one.

## Source

- [Battle.service.ts](../../src/services/Battle.service.ts): pre-checks, retest, report access entry points
- [AttackService.ts](../../src/services/AttackService.ts): the attack transaction and all persistence
- [AttackValidationService.ts](../../src/services/AttackValidationService.ts): target availability
- [attack API route](../../src/pages/api/attack/[id].ts)
- [attackFunctions.ts](../../src/utils/attackFunctions.ts): turn loop, casualties, fort damage, loot, XP, outcome
- [combatStrength.ts](../../src/utils/combatStrength.ts): offense and defense power
- [v5Combat.ts](../../src/utils/balance/v5Combat.ts): combat constants and budget formulas
- [combatRuleset.ts](../../src/utils/balance/combatRuleset.ts) and [combatRulesets.ts](../../src/utils/balance/combatRulesets.ts): ruleset shape and registry
- [combat-v14 ruleset](../../src/utils/balance/combat-v14/ruleset.ts), [v13](../../src/utils/balance/combat-v13/ruleset.ts), [v12](../../src/utils/balance/combat-v12/ruleset.ts), [v11](../../src/utils/balance/combat-v11/ruleset.ts), [v10](../../src/utils/balance/combat-v10/ruleset.ts), [v9](../../src/utils/balance/combat-v9/ruleset.ts)
- [casualtySpread.ts](../../src/utils/casualtySpread.ts): tier spreading of the dead
- [KingdomMorale.ts](../../src/constants/KingdomMorale.ts): garrison fatigue helpers
- [RacialPerks.ts](../../src/constants/RacialPerks.ts): Sanctuary and other racial perks
- [Bonuses.tsx](../../src/constants/Bonuses.tsx): race and class bonuses
- [BattleVoid.service.ts](../../src/services/BattleVoid.service.ts) and [void API route](../../src/pages/api/admin/attacks/void.ts)
- [AttackLogAccess.service.ts](../../src/services/AttackLogAccess.service.ts): report redaction by viewer
- [combatReplay.ts](../../src/utils/combatReplay.ts) and [serverRandom.ts](../../src/utils/serverRandom.ts): sealed replay and server randomness
- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts): adjustable values

## Tests

- [AttackService.test.ts](../../src/services/__tests__/AttackService.test.ts): the attack level-range refusal.
- [attackFunctions.test.ts](../../src/utils/attackFunctions.test.ts) and [attack.test.ts](../../src/app/attack.test.ts): engine scenarios, fort breach, meat-shield cases
- [battleOutcome.test.ts](../../src/utils/battleOutcome.test.ts): single canonical verdict, alternating assaults and counters, fort-shielded loot
- [attackFunctions.goldPillage.test.ts](../../src/utils/attackFunctions.goldPillage.test.ts): loot caps, shield taper, daily allowance
- [combatDominance.test.ts](../../src/utils/combatDominance.test.ts): fort damage as a share of max HP
- [casualtySystem.test.ts](../../src/utils/casualtySystem.test.ts), [casualtyRounding.test.ts](../../src/utils/casualtyRounding.test.ts), [casualtySpread.test.ts](../../src/utils/casualtySpread.test.ts), [defenderCasualtyBudget.test.ts](../../src/utils/defenderCasualtyBudget.test.ts): casualty budgets, caps, rounding, tier spread, v13 anchoring
- [battleExperience.test.ts](../../src/utils/battleExperience.test.ts) and [battleXpFairness.test.ts](../../src/utils/battleXpFairness.test.ts): XP formula, effort, threat and stall
- [combatStrength.test.ts](../../src/utils/combatStrength.test.ts): gear and upgrade allocation
- [combatInvariants.property.test.ts](../../src/utils/combatInvariants.property.test.ts): fuzzed invariants (loss caps, wall rules)
- [combatGolden.test.ts](../../src/utils/combatGolden.test.ts) and [combatRulesets.test.ts](../../src/utils/balance/combatRulesets.test.ts): frozen rulesets replay unchanged
- [AttackService.test.ts](../../src/services/__tests__/AttackService.test.ts): live attack persistence, pair limit, alliance confirmation, stamina
- [concurrentAttacks.test.ts](../../test/integration/concurrentAttacks.test.ts) and [opposingAttacks.test.ts](../../test/integration/opposingAttacks.test.ts): row locking
- [Battle.redaction.test.ts](../../src/services/Battle.redaction.test.ts), [AttackLogAccess.service.test.ts](../../src/services/AttackLogAccess.service.test.ts), [attackAccess.api.test.ts](../../src/__tests__/pages/api/attack/attackAccess.api.test.ts): report redaction, sharing, retest access
- [battleVoid.test.ts](../../test/integration/battleVoid.test.ts), [battle-void.api.test.ts](../../src/__tests__/pages/api/admin/battle-void.api.test.ts), [BattleVoid.conflict.test.ts](../../src/services/BattleVoid.conflict.test.ts): void plan, compensation, conflicts

## Known gaps

- No test calls the live attack service with an untargetable account status, a target who has not returned this era, `ENABLE_ATTACKING` off, or negligible offense.
- `AttackValidationService.ts` still contains `canAttack`, `canAssassinate` and `canInfiltrate` with a hard-coded 5 per game day. Nothing calls them. The live limits are in `AttackService.ts` and `SpyService.ts`.
- `Users.canAttack` and `BattleUser.canAttack` read `NEXT_PUBLIC_ATTACK_LEVEL_RANGE` and `NEXT_PUBLIC_ENABLE_ATTACKING` from the environment, not the runtime settings. Nothing calls either.
- The XP "morale" factor (`calculateMoraleXpFactor`, `MORALE_EXHAUSTION_PER_TURN`) is fed the attacker's stamina, not kingdom morale. The names are legacy.
- Sanctuary in code means the Elf racial perk, not a new-player sanctuary. There is no separate new-player sanctuary system.
- Wounded split, Undead reanimation, dungeon captives and Elf Sanctuary have their own tests but their rules are not described here beyond the hook points.
