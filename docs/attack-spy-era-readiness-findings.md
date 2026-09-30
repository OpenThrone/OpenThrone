# Attack and Spy New-ERA Readiness Findings

## Verdict

Do not launch a new ERA on the current Attack/Spy implementation yet.

The strategic foundation is promising: bounded multi-turn attacks, fort degradation, shared turn/stamina pressure, role-specialized units, imperfect intel, sentry defense, casualty/recovery budgets, and capped pillage all support a real turn-based strategy game. The blocker is not concept quality. The blocker is that executable evidence currently contradicts readiness.

This is not a recommendation to redesign combat from scratch. It is a recommendation to make the existing model internally consistent, transaction-safe, simulator-faithful, and empirically calibrated before changing reward curves or adding more content.

## Release Blockers

1. One battle can have two winners.

   XP uses a 1.05 score threshold in `calculateAndApplyExperience`, while `finalizeBattleResult` can later declare a win using remaining-offense, casualty, and defense conditions. The persisted outcome, loot, and XP can therefore disagree.

   Evidence: `src/utils/attackFunctions.ts:1837`, `src/utils/attackFunctions.ts:1882`, `src/utils/attackFunctions.ts:2026`.

   Required fix: establish one canonical outcome object and derive every reward, stat, log, and notification field from it.

2. The checked-in balance harness fails the most basic symmetry check.

   `bun scripts/balance/run-simulations.ts` completed 400 fixed-build battles with an attacker win rate of 1.00, average pillage of 110,000, average attacker losses of 1,000, and defender losses of 3.48. Spy runs reported 100% success for all missions and zero assassination kills.

   This directly refutes the older 50.25% mirror result and means prior calibration evidence is stale, non-representative, or both.

   Artifact: `scripts/balance/output/latest-simulation-summary.json`.

3. Assassination and clandestine strength are internally inconsistent.

   One path reads legacy `killingStrength` and `defenseStrength` fields, while current units/items use `MeleeAtkPower` and `MeleeDefPower` elsewhere. The unit/item allocation denominator also changes while allocation is in progress.

   Evidence: `src/utils/spyFunctions.ts:632-664`, `src/utils/spyFunctions.ts:710-752`.

   The observed "success, zero kills" result is consistent with these defects.

4. Tests are not release-authoritative.

   Targeted Bun combat/spy/simulation tests produced 123 passes and 24 failures. Some failures are fixture drift from the current `MockUserGenerator`, but combat casualty/stamina and legacy spy expectations also fail.

   The package/CI Jest route cannot resolve the many `bun:test` imports, so there is no single green runner proving production behavior. The production build and standalone TypeScript check pass, but the Next build explicitly skips type validation.

5. Concurrent attacks and spy missions can race.

   Services read users, daily counts, pressure, turns, and resources before their write transaction, then persist absolute values. Two requests can pass the same limit or balance check and overwrite turns, gold, XP, pressure, fort health, or units.

   Evidence: `src/services/AttackService.ts:102-124`, `src/services/AttackService.ts:467-497`, `src/services/SpyService.ts:249-280`.

   Required fix: use row locks, conditional updates, or transaction-scoped reads for the values being consumed or mutated.

6. Live and simulation contracts diverge.

   Public battle test surfaces accept up to 50 turns while the engine clamps to 10. Simulation projections omit or compress population/equipment state, and the economy simulator can fall back to a 250-citizen grant that does not represent every live housing state.

   Evidence: `src/utils/balance/v5Combat.ts:4`, `src/utils/attackFunctions.ts:297`.

   Current balance outputs therefore cannot be assumed to model production players faithfully.

7. ERA operations lack behavioral proof.

   Reset/start-era logic and stale-era repair are split across services. Historical migration behavior is not demonstrated as transactional, and no end-to-end test proves that a failed ERA transition rolls back without mixed-era state.

   The generic `resetGame()` route remains a placeholder. Even if normal start-era does not use it, the operational contract is unclear.

8. Protection and target rules have edge gaps.

   Standard attacks reject self-targeting in `Battle.service.ts:418-421`; Spy has no equivalent explicit guard. Low-level attack protection reduces casualties but does not necessarily prevent loot, fort damage, pressure, or attack-count consumption.

   Intel also lacks the same clear per-target/daily mission quota pattern as destructive spy missions, making repeated low-cost probing an attractive optimization.

## Strategic Assessment

The current economy naturally creates real choices because citizens allocated to workers, offense, defense, spies, and sentries cannot be allocated elsewhere. Forts, equipment, upgrades, turns, stamina, and gold add further opportunity costs.

The intended progression shape visible in code and simulations is sensible:

- Early game: commit to one primary identity; broad balance should be inefficient.
- Mid game: add a support axis, such as raider plus intel, fortress plus sentry, economist plus defense, or saboteur plus economy.
- Late game: hybridize enough to remove fatal weaknesses while retaining a primary advantage.

What is not yet proven is whether these are genuine choices rather than presentation around a solved allocation. Attack is currently the clearest active source of both gold and global XP. Spy consumes the same scarce turns, stamina, and population but has no equivalent XP, mastery, reputation, or direct economy loop. Defense is mostly reactive. Economy compounds passively.

That reward asymmetry will push rational players toward Attack unless its expected value is sharply lower, which would make offensive play feel bad instead.

The design target should be different loops with comparable long-run utility, not identical income:

| Identity | Satisfying loop | Progress signal | Counter / cost |
| --- | --- | --- | --- |
| Offense | Scout, choose turns, breach or raid, replace losses | Risk-adjusted XP, loot, war record | Casualties, stamina, retaliation, target pressure |
| Defense | Posture, absorb or deny, identify attacker, retaliate or rebuild | Defense mastery, renown, preserved assets | Opportunity cost, no passive farming from arranged attacks |
| Economy | Workers, bank, build, fund specialization or alliance | Infrastructure milestones, efficiency | Exposed hand gold, population unavailable to military |
| Spy | Gather confidence-rated intel, sabotage selectively, enable attacks | Spy mastery, intel quality, unlocks | Sentries, exposure, pressure, quotas |
| Sentry | Detect, distort or deny reports, capture attribution | Counter-intel mastery, actionable alerts | Population/upkeep, no reward for self-farming |

Reward defense and information work with bounded mastery or utility, not large raw gold. Defensive progress should require materially denying an eligible attack. Spy progress should depend on mission difficulty, new information, or strategic effect, with strong repeated-pair decay. This gives non-raiders progression without creating cooperative XP farms.

Avoid a hard doctrine such as "every build must keep exactly 25% defense." Use soft diminishing-return curves and visible risk indicators. A specialist should be playable but have exploitable weaknesses; a balanced build should be resilient but not best at every action.

## Reference-Game Lessons

The supplied Lord of Chains references support five ideas worth transferring:

- explicit protection, level range, self-target, inactivity/vacation, and repeated-pair gates;
- bounded action resources and capped extraction;
- imperfect reconnaissance whose confidence improves with investment;
- loser/defender progress so a setback is not a dead session;
- rich immutable logs containing the inputs and deltas needed to explain outcomes.

They also show what not to copy:

- one-shot physical/magical comparison combat;
- apparent piercing/shielding stats that are calculated and then neutralized;
- extreme-ratio casualty cliffs that can force zero losses;
- stacked currency, XP, clan currency, rank, drops, and fragments on victories;
- opaque formulas that hide why a player won or lost.

Preserve the preparation and counterplay principles, not the formulas.

## PvE Recommendation

PvE is worthwhile first as a teaching and recovery surface, not a second economy. No production PvE loop currently exists.

Recommended order:

1. Start with a deterministic build sandbox using authored armies and zero persistent rewards/state mutation.
2. Add three to five guided trials that teach scouting, turn commitment, fort breach, casualty recovery, and sentry counterplay. Rewards should be one-time cosmetics, badges, or explanatory unlocks.
3. Add recovery drills only if telemetry shows players churn after losses. Any repair benefit must stay below ordinary natural recovery and be capped to a recent-loss window.
4. Consider NPC sparring later, capped daily, with negligible or one-time progression. It must never be the safest repeatable XP/gold strategy.

## Required Pre-ERA Proof

- One canonical winner invariant across result, XP, loot, logs, stats, and notifications.
- Mirror matchups land in a declared band, recommended 48-52%, over multiple seeds and every race/class combination.
- A full early/mid/late strategy grid covers offense, defense, economy, spy, sentry, and hybrids across turns 1-10, fort states, wealth bands, equipment coverage, and level gaps.
- No pure allocation dominates all opponents; recommended average regret target is under 10%, with deliberate specialist counters documented.
- Monotonicity/property tests: more valid offense never lowers attack power; more sentry never lowers defense; caps never exceed available resources/population; all persisted values stay nonnegative.
- Concurrency tests prove daily/per-target limits, turns, gold, XP, pressure, units, and fort updates cannot be double-spent or lost.
- Self-target, protection, date-boundary, idempotency, retry, and coordinated dogpile tests.
- Live-versus-simulator parity fixtures use the same player snapshot and produce the same normalized inputs and outcome distribution.
- ERA start/reset tests prove transactionality, rollback, stale-era repair, idempotence, and preservation/deletion rules.
- One supported test command is green locally and in CI; obsolete runner imports and stale workflow commands are removed or isolated.

## Verification Record

- `bun run check-types`: pass.
- `bun run build`: pass.
- Build caveat: Next warned that `next.config.js` i18n is unsupported in App Router and reported that build-time type validation was skipped.
- Targeted Bun combat/spy/simulation tests: 123 pass, 24 fail.
- Targeted Jest attempt: fails at runner/module compatibility with `bun:test` before providing authoritative coverage.
- Current balance harness: completes but produces 100% fixed attacker and spy success rates, including zero assassination kills.

## Source Artifacts Reviewed

- OpenThrone Attack/Spy implementation and related tests under `src/services`, `src/utils`, and `scripts/balance`.
- `/home/tim/flattened_loc_combat_direct.txt`.
- `/home/tim/flattenedLOC.txt`.
- `/home/tim/lordofchains/*`.
- Research journal: `.omo/ulw-research/20260715-150336-attack-spy-era-audit/`.
- Main synthesis: `.omo/ulw-research/20260715-150336-attack-spy-era-audit/SYNTHESIS.md`.
- Generated simulation output: `scripts/balance/output/latest-simulation-summary.json`.

## Implementation Note

No product implementation was intentionally changed during the audit. This file is a durable copy of the findings for planning and execution.
