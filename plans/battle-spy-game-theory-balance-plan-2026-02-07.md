# OpenThrone Battle & Spy Balance Plan (Game Theory)

Date: 2026-02-07
Scope reviewed: `src/services/Battle.service.ts`, `src/services/AttackService.ts`, `src/services/SpyService.ts`, `src/utils/attackFunctions.ts`, `src/utils/spyFunctions.ts`, combat/spy API routes, user stat models.

## 1) Current-State Balance Risks

### Systemic
- Balance logic is distributed across multiple layers (model getters, services, utils), making effective multipliers hard to reason about end-to-end.
- Several mission success checks are binary (`attacker.spy > defender.sentry`), creating hard cliffs rather than smooth probabilities.
- Randomness sources mix `Math.random` and custom RNG (`mtRand`) without seed control, reducing reproducibility and fairness analysis.

### Battle-specific
- Many interacting modifiers (items, upgrades, structure mitigation, fort mitigation, class/race bonuses, stamina) are compounded with limited telemetry for contribution attribution.
- Mitigation cap (`<= 75%`) and casualty formulas can produce edge outcomes; requires curve validation by level bracket.
- `updateUserUnits` full replacement strategy can create race windows under concurrent attacks/spy events.

### Spy-specific
- Intel/assassinate/infiltrate use different casualty and success math with inconsistent shape.
- Mission limits are partly checked in API and partly in service, risking drift.
- `canAssassinate` currently checks `INTEL` history in validation service, likely policy mismatch.

## 2) Balance Design Goals

- Strategic diversity: at least 3 viable archetypes per era bracket (offense rush, fortified economy, clandestine control).
- Counterplay: every dominant strategy has a practical counter with bounded opportunity cost.
- Smoothness: avoid step-function breakpoints from single-stat thresholds.
- Retention fairness: novice bracket protection while still allowing meaningful progression.
- Explainability: players can infer why outcomes occurred from post-battle summaries.

## 3) Unified Combat Value Model

Define canonical effective stats used by both battle and spy layers:

- `E_OFF`, `E_DEF`, `E_SPY`, `E_SENTRY`
- Inputs:
  - Base unit stats by type/level
  - player bonuses
  - race/class modifiers
  - structure upgrades
  - battle upgrades
  - equipped items
  - stamina/recovery modifiers
  - fort state (level + current HP ratio)

Normalization rules
- Additive buffs grouped first, then multiplicative buffs by category.
- Soft caps for any single category dominance (e.g. diminishing returns above threshold percentile).
- Explicit cap table versioned by era.

Deliverable
- `balance/formulas/v1-effective-stats.md` with exact order-of-operations.

## 4) Battle Rebalance Plan

## Phase B1: Instrumentation first
- Add per-battle breakdown logging fields (or separate table) for contribution slices:
  - base power
  - race/class contribution
  - structure contribution
  - item contribution
  - bonus points contribution
  - mitigation contribution
- Track win probability proxy vs actual result for calibration.

## Phase B2: Casualty/loot/XP curve calibration
- Use Monte Carlo simulation suite (100k+ matchups per bracket).
- Brackets by level and economy/fort tier.
- Tune for target envelopes:
  - expected attacker win rate in equal-power mirror: 48%-52%
  - expected net gold swing bounded by bracket
  - expected casualty ratio bounded to avoid runaway snowballing

## Phase B3: Anti-snowball mechanics
- Add catch-up dampers:
  - diminishing loot efficiency versus significantly weaker defenders
  - post-raid fatigue penalty curve for repeated attacks
- Maintain anti-farm constraints using attacker/defender pair history.

## Phase B4: Fortification clarity
- Keep fort as meaningful defensive identity:
  - fort mitigation scales with HP ratio
  - breach state grants temporary vulnerability window
  - visible telemetry in battle recap

## 5) Spy Rebalance Plan

## Phase S1: Probability curve unification
Replace binary success gates with logistic probability:
- `P(success) = sigmoid(k * ln(E_SPY / E_SENTRY) + situational_modifiers)`
- Keep guaranteed fail/success guardrails only at extreme ratios.

## Phase S2: Mission-specific risk/reward
- `INTEL`: highest information yield, lowest lethality.
- `INFILTRATE`: medium information + strategic disruption.
- `ASSASSINATE`: highest impact, highest detection/casualty risk.
- Mission budgets linked to spy tier + cooldown economy, not hardcoded route values.

## Phase S3: Detection and retaliation game
- Introduce defender strategic responses:
  - sentry posture modes (balanced/aggressive/counterintelligence)
  - temporary buffs with upkeep cost
- Add expected-value parity so spy-heavy builds are strong but not mandatory.

## 6) Game-Theory Balance Framework

## State variables in payoff model
- `U` = player utility over horizon H turns
- Components:
  - resource gain/loss (gold, units, structures)
  - positional pressure (cooldowns, threat, detectability)
  - opportunity cost of allocated bonuses/upgrades/items

## Strategy sets
- Offensive: burst raid, attrition raid, fortress breach
- Defensive: turtle economy, fort stack, counter-offense
- Spy: intel scouting, infiltration denial, assassination disruption

## Equilibrium targets
- No pure strategy should dominate across all brackets.
- Mixed strategy equilibrium should vary by bracket and era.
- Regret metric target: average strategy regret < 10% versus best response in simulation grid.

## 7) Simulation & Analytics Pipeline

1. Build deterministic simulator mode (seeded RNG) for battle+spy.
2. Generate matchup matrix over sampled player builds including:
- race bonuses
- class bonuses
- structure upgrades
- unit distributions
- equipped items
- bonus points allocations
3. Compute metrics:
- win rates, casualty EV, loot EV, spy success EV, survivability, churn-risk proxy.
4. Optimize parameters using constrained search (Bayesian or grid per era).
5. Promote changes behind feature flag and run A/B or shadow simulation on live telemetry.

Deliverables
- `scripts/balance/run-simulations.ts`
- `plans/balance-parameter-ledger.csv`
- weekly balance report template

## 8) Concrete Refactor Worklist (Code)

- Consolidate battle + spy effective-stat calculation into shared module.
- Remove duplicated mission checks split between API and service layers.
- Standardize RNG provider injection for deterministic tests.
- Add invariant tests:
  - monotonicity (more offense should not reduce win chance in controlled scenario)
  - bounded casualty/loot outputs
  - no negative inventory or gold after transaction
- Migrate heavy log analytics from JSON blobs to typed columns for speed.

## 9) Rollout Plan

## Stage 1 (safe observability)
- Add telemetry and deterministic simulation harness, no balance changes.

## Stage 2 (low-risk tuning)
- Adjust non-breaking constants/caps within current formulas.

Stage 2 applied (2026-02-07):
- Battle mirror fairness calibrated to 50.25% in seeded simulation baseline.
- Added bounded per-attack damage variance (seeded RNG aware) to avoid deterministic cliff outcomes.
- Added per-attack pillage cap (35% of defender starting hand gold) to dampen runaway swings.

## Stage 3 (formula unification)
- Introduce unified effective-stat + logistic spy success, feature-flagged.

## Stage 4 (live validation)
- Run staged rollout (5% -> 25% -> 100%) with kill switch.

## 10) Success Metrics

- Battle mirror fairness: 48%-52% in equal-power scenarios.
- Spy mission outcome variance reduced while preserving strategic differentiation.
- Decrease in extreme outlier reports and support tickets related to combat fairness.
- Stable economy inflation/deflation within defined weekly bounds.

## 11) Execution Tracker
- [x] Stage 1 complete
- [x] Stage 2 complete
- [ ] Stage 3 complete
- [ ] Stage 4 complete
