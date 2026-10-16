# Battle and spy source guide

Use the implementation and its tests for current formulas, limits, and persistence behavior. The previous narrative mixed a February baseline with a September cutover; it is preserved as [historical context](archive/battle-spy-workflow-reference-legacy.md).

## Request and execution flow

| Concern | Source |
| --- | --- |
| Attack request validation and dispatch | [attack route](../src/pages/api/attack/[id].ts) |
| Spy mission validation and dispatch | [spy route](../src/pages/api/spy/[id].ts) |
| Shared API guard | [apiGuard.ts](../src/middleware/apiGuard.ts) |
| Battle orchestration | [Battle.service.ts](../src/services/Battle.service.ts) |
| Attack execution and persistence | [AttackService.ts](../src/services/AttackService.ts) |
| Attack eligibility | [AttackValidationService.ts](../src/services/AttackValidationService.ts) |
| Spy execution and persistence | [SpyService.ts](../src/services/SpyService.ts) |

## Calculations and replay

| Concern | Source |
| --- | --- |
| Shared army strength and equipment allocation | [combatStrength.ts](../src/utils/combatStrength.ts) |
| Battle simulation and outcome | [attackFunctions.ts](../src/utils/attackFunctions.ts) |
| Spy mission calculations | [spyFunctions.ts](../src/utils/spyFunctions.ts) |
| Combat balance parameters | [v5Combat.ts](../src/utils/balance/v5Combat.ts) |
| Server randomness and replay encryption | [serverRandom.ts](../src/utils/serverRandom.ts) |
| Replay types | [combatReplay.ts](../src/utils/combatReplay.ts) |
| Spy result serialization | [results.ts](../src/utils/spy/results.ts) |
| Offline simulation | [src/sim](../src/sim) and [balance scripts](../scripts/balance) |


### Battle verdict, walls and loot (2026-10-13 rules)

- **Verdict:** each odd turn is an attacker assault; it is *won* when attack pressure exceeds the manned-wall defense pressure. The attacker wins the battle only by winning more assault turns than they lose; ties and an offense wipe go to the defender (`computeCanonicalOutcome`). A `WIN` reports `FORT_BREACHED` when the walls fell, else `DEFENSE_WIPED`, else `ASSAULT_SUCCEEDED`.
- **Walls:** a won assault turn removes 2% (marginal) to 7% (overwhelming, pressure ratio 3) of the fort tier's *maximum* hitpoints; one battle removes at most 30% of max (`V5_COMBAT_CONSTANTS.FORT_DAMAGE`). A repelled assault at ratio >= 0.35 scratches at least 1 HP but can never take the last hitpoint. There is no daily wall cap by design: four full assaults from different attackers are expected to fell a fort.
- **Counters:** defender ranged power fires on the attacker's turn as well as the defender's (`RANGED_COUNTER_FORT_BONUS`); a won assault always lands at least one defender casualty unless the defender's daily casualty allowance is spent.
- **Loot:** linear in commitment. Each won assault turn pillages the slice of the fort-adjusted cap (22% of the start-of-battle treasury, scaled down while the fort stands, 2.2% for protected defenders) that its covered turns represent, so a fully won 10-turn assault reaches the cap and a 1-turn raid earns a tenth of it. Loot accrued on won turns is kept even when the verdict is a loss. The daily 50% treasury cap is anchored to the start-of-day balance.
- **Protection:** level 9 and under halves incoming damage and caps losses at 1.5% of population per battle (min 1 on a won assault). The attacker's own incoming-attack pressure never reduces the attacker's losses.
- **Assassination caps:** kills draw from the defender's shared daily casualty allowance (`DAILY_CASUALTY_RECOVERY_DAYS` of throughput, battle losses included) and all attackers together may kill at most `ASSASSINATION_DAILY_TYPE_SHARE` (10%) of the targeted unit type per OT day; both remaining values are sealed into the spy replay.
- **Gates:** `src/utils/combatInvariants.property.test.ts` fuzzes 4000 battles per rule above; `scripts/balance/early-game-forts.ts` and `scripts/balance/era-early-game.ts` show the early-game envelope.

### Assault gate defense pressure

During assault resolution in `executeBattleTurn` (`attackFunctions.ts`), defender defense pressure includes matching melee defense against melee attacks, full matching ranged defense against ranged attacks, and a weighted contribution from defending ranged units (`RANGED_DEFENSE_ASSAULT_WEIGHT = 0.5` in `V5_COMBAT_CONSTANTS`) when assaulted by pure-melee attacker forces. This prevents pure-melee forces from ignoring defending archer garrisons during assault checks.
`NEXTAUTH_SECRET` (or `JWT_SECRET`) is required for encrypted combat replay persistence. Do not infer exact replay support for older logs from the presence of current replay code.

For validation, use `bun run test` or `bun test <path/to/test-file>` for a focused Bun suite. Test results and simulation outputs establish behavior only for the revision and configuration that produced them; archived readiness reports are not current release verdicts.
