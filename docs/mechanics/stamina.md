# Stamina

Last verified against code: 2026-11-12 (alpha 8ffa50de)

Stamina is how fresh an army is for attacking. Only attacks spend it; spy
missions are free. Attacks are never blocked: the cost is capped at the
current balance, and below `stamina.penaltyThreshold` the attacker's offense
falls linearly to `stamina.minOffensePercent` at zero (the battle report shows
the cut as "Low stamina: −N% offense"). The browser estimates recovery and the
cost of the selected attack from the shared formula; the server is
authoritative for every attack.

## Rules

Default values, with the setting key where an admin can change them:

- Maximum balance: 100 stamina (per player, `maxStamina`).
- Recovery: 5 stamina every 10 minutes (`stamina.recoveryAmount`,
  `stamina.recoveryIntervalMinutes`), in whole intervals; empty to full in
  3h 20m.
- Attack cost: `ceil((baseCost + turns × perTurnCost) × drain)`
  (`stamina.baseCost` 2, `stamina.perTurnCost` 0.5), where `drain` falls from 1
  to 0.5 across the offensive upgrades (`staminaDrainFactor`). Default: 2 + 0.5
  per turn, so 10 turns cost 7. Ten separate one-turn attacks cost more than
  one ten-turn attack.
- The cost is taken from the balance after any recovery since the last write,
  and never below zero.
- Offense penalty: below 50 stamina (`stamina.penaltyThreshold`), down to 80%
  offense at zero (`stamina.minOffensePercent`). The multiplier uses the
  balance before the attack's cost is taken.

Where the penalty applies in a battle:

- It multiplies the attacker's attack pressure in the assault check, so a tired
  army wins fewer assaults, and in the loot check that follows a won assault.
- It does not reduce the damage dealt to defenders or the fort, which uses the
  unreduced attack. The battle report shows the stored percent for both sides.
- It also lowers battle XP: XP is multiplied by
  `clamp(stamina / 100 − 0.025 × turns, 0.25, 1)`, using the same pre-attack
  balance. A full 10-turn attack from 100 stamina therefore pays 75% of the
  unscaled amount. See [combat.md](combat.md).

The server setting `stamina.enabled` turns stamina costs and the offense
penalty on or off. When off, attacks cost no stamina, the offense penalty does
not apply and XP is computed as if stamina were 100. `stamina.recoveryEnabled`
independently pauses or resumes recovery. Recovery amount, interval, costs,
threshold and floor can be adjusted in **System: Runtime Settings**; the form
bounds values to the supported registry ranges.

## Where players learn about it

All of these read the live rules from `/api/config`, so admin changes show up
without a copy edit:

- How to Play, Combat → Stamina (`#combat-stamina`) and the FAQ ("What is
  stamina?") share one explanation (`useStaminaGuide`, `common:stamina.guide`).
- The sidebar Stamina row: tooltip with what spends it and when offense drops;
  the row links to the How to Play entry.
- The attack dialog: the selected attack's cost and the resulting offense.
- The battle report: "Low stamina: −N% offense" when the penalty applied.

## Recovery clock and rule changes

Recovery uses elapsed wall-clock time, including time offline; it is independent
of attack-turn updates. Whole intervals award recovery and retain their time
remainder. Reaching the maximum discards banked recovery time. There is no
manual recovery action. A zero recovery amount also pauses recovery.

Changing or resetting any stamina setting settles all players under the old
rules and starts a fresh recovery interval. This also applies to history
reverts. Time spent with stamina or recovery disabled is not awarded later.
Existing balances are retained while stamina is disabled; attacks and spy
missions neither require nor spend stamina. Maximum stamina remains the
player's existing maxStamina value (100 by default).

## Why it works this way

- Stamina no longer blocks attacks; low stamina weakens the army instead
  (CHANGELOG, v0.10.0 "Army stamina").
- Offense structure upgrades cut the drain per committed turn by up to half, and
  spying costs no stamina (CHANGELOG, v0.10.0).
- Players read the numbers from the live server rules so the explanation stays
  true when an admin changes a setting (`useStaminaGuide.ts`, `guideFacts.ts`).
- Estimates must not turn a second config read into a failed player response, so
  a failed read keeps the stored balance and invents no recovery
  (`Stamina.service.ts`).

## Admin and settings

- System: Runtime Settings (`/home/admin/settings`), group `stamina`:
  `stamina.enabled` (on), `stamina.recoveryEnabled` (on), `stamina.penaltyThreshold`
  (50, 0 to 100), `stamina.minOffensePercent` (80, 50 to 100),
  `stamina.recoveryAmount` (5, 0 to 1000), `stamina.recoveryIntervalMinutes`
  (10, 1 to 1440), `stamina.baseCost` (2, 0 to 1000), `stamina.perTurnCost`
  (0.5, 0 to 100).
- Saving a changed stamina setting (or deleting an override, or reverting one
  from the audit history) first settles every player's balance under the old
  rules.

## Source

- [ArmyStamina.ts](../../src/constants/ArmyStamina.ts): penalty multiplier, condition bands, drain factor
- [stamina.ts](../../src/utils/stamina.ts): cost, recovery projection, guide values, default rules
- [Stamina.service.ts](../../src/services/Stamina.service.ts): settling on setting changes, safe projection
- [AttackService.ts](../../src/services/AttackService.ts): spends stamina and seals the settings in the replay
- [attackFunctions.ts](../../src/utils/attackFunctions.ts): offense penalty in the assault check, XP factor
- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts): the `stamina.*` keys and ranges
- [server-settings API](../../src/pages/api/admin/system/server-settings.ts): settles balances when a stamina setting changes
- [useStaminaGuide.ts](../../src/hooks/useStaminaGuide.ts) and [guideFacts.ts](../../src/utils/guideFacts.ts): player-facing numbers
- [ArmyConditionMeter.tsx](../../src/components/sidebar/ArmyConditionMeter.tsx): sidebar row and attack dialog estimate

## Tests

- [ArmyStamina.test.ts](../../src/constants/ArmyStamina.test.ts): penalty multiplier and drain factor
- [stamina.test.ts](../../src/utils/stamina.test.ts): cost and recovery projection, guide values
- [AttackService.test.ts](../../src/services/__tests__/AttackService.test.ts): cost after recovery, disabled stamina, exhausted army, upgrade discount, spying free, replay keeps settings
- [stamina.test.ts](../../test/integration/stamina.test.ts): row locks, offline recovery, disabled mode, settings transitions
- [attackFunctions.test.ts](../../src/utils/attackFunctions.test.ts) and [combatGolden.test.ts](../../src/utils/combatGolden.test.ts): zero-stamina army power at 80% with no extra casualties, and a low-stamina golden scenario
- [runtimeSettings.test.ts](../../src/constants/runtimeSettings.test.ts): registry keys and ranges
- [guideFacts.test.ts](../../src/utils/guideFacts.test.ts): the numbers players read

## Known gaps

- The stamina penalty does not scale the damage an assault deals, only whether
  assaults are won and whether they pay loot. The in-game text says the army
  "fights weaker", which suggests damage as well.
- The XP factor that uses stamina is implemented as `calculateMoraleXpFactor`
  with `MORALE_EXHAUSTION_PER_TURN`; the names are legacy. How to Play does not
  mention that stamina and turns reduce XP.
- No test pins that the damage dealt ignores the stamina multiplier. The engine test only asserts that an exhausted army does not cost the defender more losses.
