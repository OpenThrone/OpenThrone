# Balance simulation

Last verified against code: 2026-11-06 (alpha d59b12d9)

`src/sim` is an offline simulator that plays a population of fake players against each other so staff can compare balance settings before changing the live game. It reuses the live battle and spy code. Everything around that (who logs in, what they buy, who they pick as a target) is a model, not a measurement. Its results compare one setting against another; they are not a forecast of the live game.

## Rules

### Parts

| Part | Entry points | What it is for |
|---|---|---|
| Single battle | `runSingleBattle`, `runSimulation` ([engine.ts](../../src/sim/engine.ts)) | Repeated one-on-one battles between two built players, using the live battle function. |
| Population day cycle | `generatePopulation`, `simulateDay`, `runPopulationSimulation` ([daycycle.ts](../../src/sim/daycycle.ts)) | A population over many days: turns, income, recruiting, training, attacks, spy intel, XP. Without `live` it uses a simplified legacy model. |
| Live-rules mode | `SimulationConfig.live` ([liveRules.ts](../../src/sim/liveRules.ts), [liveEconomy.ts](../../src/sim/liveEconomy.ts), [liveForces.ts](../../src/sim/liveForces.ts)) | Players log in on a schedule by activity type (casual, regular, active, grinder), pay live structure prices, unlock unit tiers with their fort, heal wounded units, lose battle protection, use kingdom morale, mercenaries, dungeon and alliances. This is what the admin Balance Simulator runs. |
| ERA mode | `runEraSimulation` ([eraIntegration.ts](../../src/sim/eraIntegration.ts)) | A long run (730 days by default) of a mixed cohort that starts from the fresh-era defaults. |
| Autonomous and closed-loop tuning | `runAllBalancePersonas`, `runClosedLoopBalance` ([autonomous.ts](../../src/sim/autonomous.ts), [closedLoop.ts](../../src/sim/closedLoop.ts)) | Repeated runs that nudge combat parameters (attacker damage, defender counter damage, pillage share) toward target ranges for win rate, attacks per active player and loot to production. |

All randomness comes from a seeded generator ([random.ts](../../src/sim/random.ts)), so the same seed and settings give the same run. The simulator also asserts invariants such as finite, non-negative gold and throws on a bad configuration ([invariants.ts](../../src/sim/invariants.ts)).

A simulated day is 48 half-hour ticks in ERA mode. Live-rules mode derives its ticks per day from the configured turn interval.

### ERA mode in detail

- **Start state.** Fresh-era defaults: 25,000 gold, 50 citizens, 50 attack turns, 100 stamina, level-1 fort, no trained units ([eraPopulation.ts](../../src/sim/eraPopulation.ts)).
- **Cohort.** The primary cohort is 15 active and 25 passive players. Active mix: 4 farmers, 4 attackers, 2 defenders, 2 spies, 1 sentry, 2 balanced. Passive mix: 8 farmers, 3 attackers, 4 defenders, 2 spies, 2 sentries, 6 balanced. Farmers come in greedy, cautious and adaptive variants. Late joiners arrive on days 30, 90, 180 and 365 by default.
- **Personas** (`farmer`, `attacker`, `defender`, `spy`, `sentry`, `balanced`) decide through a policy that sees only banded, imperfect information about opponents, never exact hidden values ([personas](../../src/sim/personas)). These are unrelated to the live-game bot personas ([bots.md](bots.md)) and to the four autonomous tuning personas (`equilibrium`, `aggression`, `fortress`, `progression`).
- **Lifecycle.** Players can go inactive, be wiped and rebuild, reactivate and adapt ([lifecycle.ts](../../src/sim/lifecycle.ts)).
- **Rulesets.** `production`, `weakLowLevelProtection` (low-level protection off) and `candidateSafety` (adds a 20% daily casualty cap and a 7-day rebuild shield). Only the first is meant to resemble live rules ([rulesets.ts](../../src/sim/rulesets.ts)).
- **Alliance modes.** `none`, `twoBalanced`, `dominant60_40`, `focusFive`. **Recruitment bands.** 5, 15, 25 or 40 successful recruits per recruiting player per day.
- **Checkpoints.** Metrics are recorded at days 0, 1, 7, 14, 30, 60, 90, 180, 365, 545 and 730 as medians and 5th and 95th percentiles per cohort and persona.

### Balance gates

Gates run over the cohort metrics at days 365 and 730 ([balanceGates.ts](../../src/sim/balanceGates.ts)). Each finding is either a `gate` (it can fail the run) or `info` (a recorded observation that never fails).

| Gate | Pass condition |
|---|---|
| Persona viability | A persona's median viability is between 0.5x and 1.5x the population median. |
| Cohort presence | All six personas exist in the primary cohort. |
| Late-joiner catch-up | A late-joiner persona's median viability is at least 0.5x the primary cohort's median for that persona. |

Viability is the geometric mean of four ratios against the same-day population median: income, combat power, clandestine power and level.

Four further gates are reported only as `info` because a single run cannot decide them: top power-quartile persona concentration, action drought, recruiter advantage (at most 1.5x at day 90) and median rebuild time. Quartile concentration and recruiter advantage need results from several seeds. Action drought and rebuild time need per-player data that the cohort metrics do not expose yet.

**Gates only run for calibrated scenarios.** Every scenario the command-line runner builds is marked `uncalibrated`, so the gates are replaced by one `info` finding saying they are suppressed. As written, `--enforce-balance-gates` therefore never fails a run. A calibrated status needs a person to approve targets built from real era data ([export-era-calibration.ts](../../scripts/export-era-calibration.ts) exports the raw history and explicitly does not mark anything calibrated).

### How to run it

All commands run from the project root with Bun.

- **Admin Balance Simulator:** **Administration → Balance simulator** ([balance-sim.tsx](../../src/pages/home/admin/balance-sim.tsx)) posts to the admin simulation endpoint, which runs live-rules mode with the population size, level range, days, turn interval, activity mix, optional game event, dungeon, alliance share, balance overrides and seed you set. It is admin-only and every run is audit-logged before it starts ([run.ts](../../src/pages/api/admin/simulation/run.ts)).
- **ERA matrix:** `bun scripts/run-era-simulation.ts --manifest smoke|exhaustive|<path> --output <dir>`, with optional `--resume`, `--overwrite`, `--max-workers 1|2`, `--per-run-timeout <ms>`, `--matrix-timeout <ms>`, `--max-output-bytes <n>` and `--enforce-balance-gates`. `smoke` is one 730-day cell; `exhaustive` crosses three rulesets, four recruitment bands, four alliance modes and 30 seeds, plus two extra population sizes. Each cell writes a JSON report, a cohort CSV and a Markdown report, with checksums, atomically ([run-era-simulation.ts](../../scripts/run-era-simulation.ts)).
- **Persona tuning:** `bun scripts/run-balance-agents.ts` runs the four autonomous personas and writes reports under a timestamped `temp/balance-reports` folder. `bun scripts/run-closed-loop-balance.ts` runs the closed-loop tuner.
- **Quick checks:** `bun scripts/test-sim.ts` (fixed battle matchups), `bun scripts/test-population-sim.ts` (50 players for 7 days), and the probes in [scripts/balance](../../scripts/balance) (battle, fort, early-game and war experiments).
- **Tests:** `bun test src/sim`.

### What results may and may not be used to claim

May claim:

- Relative effects: "with setting A the attacker win rate and loot share moved by this much compared with setting B", given the same seeds and population.
- Absence of crashes or invariant breaks across the tested matrix.
- That a code path (battle, spy, economy) is deterministic for a seed.

May not claim:

- A forecast of a real era. The admin page itself says to compare settings with each other, not to treat results as forecasts. Starting players get generated mid-era armies and spend their gold before day 1; late joiners start as new accounts.
- That any balance gate "passed" for the live game. Gates are suppressed for uncalibrated runs, and the persona behavior has not been checked against production data.
- Anything about alliance lent troops, loans or treasury requests. Live-rules mode does not model them.
- Anything about how real players choose targets, recruit or churn. Targeting is a heuristic that uses only information a player could know.
- That `production` ruleset numbers equal the live numbers. The ruleset text still says low-level mitigation is 0.1x with an 8% cap, while the live combat constants use a 0.5 damage multiplier and a 1.5% population loss cap for protected defenders. Battles themselves run through the live combat code, but see Known gaps.

## Why it works this way

- Gates use the same-day population median as the reference, not an average of cohort medians, because a one-player cohort would otherwise weigh the same as a 25-player one ([balanceGates.ts](../../src/sim/balanceGates.ts)).
- Single-run observations of multi-seed gates are `info` so they never read as a verdict ([balanceGates.ts](../../src/sim/balanceGates.ts)).
- Persona observations cannot carry exact opponent gold, units or fort points, so the "no hidden data" rule is enforced by type ([personas/types.ts](../../src/sim/personas/types.ts)).
- Gates are suppressed until calibrated because they are "meaningful only after behavior/calibration targets are approved" ([scenarioTypes.ts](../../src/sim/scenarioTypes.ts)).
- The ruleset manifests are simulation-only data and "must not be described as live behavior" ([rulesets.ts](../../src/sim/rulesets.ts)).

## Admin and settings

- Balance Simulator page and endpoint, as above. The endpoint requires an administrator.
- Simulation parameters are request inputs, not runtime settings. The live values it reads (protection days, level range, pair limit and so on) come from the live constants and the runtime-settings defaults.

## Source

- [src/sim](../../src/sim): the simulator ([index.ts](../../src/sim/index.ts) lists the public surface).
- [balanceGates.ts](../../src/sim/balanceGates.ts), [cohortMetrics.ts](../../src/sim/cohortMetrics.ts), [eraExport.ts](../../src/sim/eraExport.ts): gates, metrics, reports.
- [scripts/run-era-simulation.ts](../../scripts/run-era-simulation.ts), [scripts/run-balance-agents.ts](../../scripts/run-balance-agents.ts), [scripts/run-closed-loop-balance.ts](../../scripts/run-closed-loop-balance.ts), [scripts/export-era-calibration.ts](../../scripts/export-era-calibration.ts).
- [run.ts](../../src/pages/api/admin/simulation/run.ts): admin endpoint.
- Planning background (dated 2026-07-15 and partly out of date): [era-progression-stress-test.md](../era-progression-stress-test.md).

## Tests

- [balanceGates.test.ts](../../src/sim/balanceGates.test.ts): each gate, severity and informational findings.
- [eraIntegration.test.ts](../../src/sim/eraIntegration.test.ts): ERA day count and checkpoints, inactive players get nothing, late joiners, rebuild shields, alliances, persona economy.
- [eraFixture.test.ts](../../src/sim/eraFixture.test.ts) and [eraExport.test.ts](../../src/sim/eraExport.test.ts): report format.
- [rulesets.test.ts](../../src/sim/rulesets.test.ts): ruleset manifest values and shield and cap helpers.
- [liveRules.test.ts](../../src/sim/liveRules.test.ts): schedule, structures, units, protection, banking, alliances in live-rules mode.
- [invariants.test.ts](../../src/sim/invariants.test.ts), [random.test.ts](../../src/sim/random.test.ts): invariants and seeded randomness.
- [lifecycle.test.ts](../../src/sim/lifecycle.test.ts), [personas](../../src/sim/personas), [alliances.test.ts](../../src/sim/alliances.test.ts), [spyBehavior.test.ts](../../src/sim/spyBehavior.test.ts), [cohortMetrics.test.ts](../../src/sim/cohortMetrics.test.ts): the model parts.
- [run-era-simulation.test.ts](../../scripts/run-era-simulation.test.ts): manifest cell counts, worker limit, atomic output, resume and overwrite.

## Known gaps

- The CLI never produces a calibrated scenario, so no gate can fail a run today, and the cross-seed gates are not implemented at all.
- No test checks that the `production` ruleset or the simulator's live-rules mode matches the live game's constants. The ruleset text (0.1x multiplier, 8% cap) disagrees with the live protection constants (0.5 damage multiplier, 1.5% loss cap); the ruleset only decides who counts as protected (level 9 and under) and the candidate caps.
- There is no test that the simulator's start state equals the live era defaults.
- The planning document [era-progression-stress-test.md](../era-progression-stress-test.md) still describes the simulator as lacking a live-parity mode and says stamina rises one per turn tick; both are out of date.
- The admin endpoint and its configuration validation have no test.
