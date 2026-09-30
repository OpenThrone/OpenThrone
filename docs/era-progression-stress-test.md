# New ERA Progression Forecast and Stress-Test Plan

Date: 2026-07-15

## Executive conclusion

The current code gives every new or reset ERA account the same reproducible start: **50 citizens, 25,000 hand gold, 50 attack turns, 100 stamina, and zero workers/offense/defense/spy/sentry units**. At the documented 30-minute tick rate, even an untouched level-1 account gains 48,000 gold and 48 stored turns per day, plus one citizen per daily reset.

The likely early-ERA metagame is therefore not mainly determined by housing. It is determined by:

1. how quickly players convert citizens into workers;
2. recruitment participation and click volume;
3. uncapped turn storage and the timing of turn expenditure;
4. coordinated target selection;
5. whether a player can rebuild after being selected as a target.

The current simulator is useful for finding bad balance outcomes, but it is not yet a reliable forecast of a fresh ERA. It seeds level-scaled armies, structures, and wealth rather than the production reset state, automatically derives some upgrades from XP level, and does not represent the requested active/passive/recruiting cohort faithfully. A live-parity cohort mode should be the release gate.

## 1. Production ERA baseline

Authoritative defaults are in `src/services/UserDefaults.service.ts` and are used for both account creation and ERA reset.

| Resource | ERA start |
|---|---:|
| Citizens | 50 |
| Workers | 0 |
| Offense / Defense | 0 / 0 |
| Spies / Sentries | 0 / 0 |
| Hand gold / Bank gold | 25,000 / 0 |
| Attack turns | 50 |
| Stamina | 100 / 100 |
| Fort | Level 1, 50 HP |
| XP | 0 |
| Housing / Economy level | 0 / 0 |

The live turn job adds `goldPerTurn`, one attack turn, and one stamina per invocation. The documented scheduler runs every 30 minutes, or 48 times per day. Level-1 housing adds one citizen per daily invocation. There is no stored-turn cap in this path.

### Untouched-account trajectory

This table assumes exactly 48 turn jobs and one daily job per day, no purchases, no recruitment, and the default fort's 1,000 gold per turn.

| Time | Citizens | Hand gold | Stored turns |
|---|---:|---:|---:|
| Start | 50 | 25,000 | 50 |
| Day 1 | 51 | 73,000 | 98 |
| Day 7 | 57 | 361,000 | 386 |
| Day 30 | 80 | 1,465,000 | 1,490 |
| Day 365 | 415 | 17,545,000 | 17,570 |

This is the passive floor, not an expected player outcome. It exposes two important properties:

- Stored turns grow without a cap, so absence can become a large future burst rather than a pure disadvantage.
- The cron endpoint grants once per call rather than from an elapsed-time ledger. Missed calls lose growth; duplicate calls create extra growth. Tick idempotency and catch-up rules should be settled before launch.

Workers cost 2,000 gold and a level-1 worker produces 50 gold per tick. Ignoring opportunity cost, the nominal payback is 40 ticks, less than one day. A player can immediately train 12 workers with starting gold, raising gross level-1 income from 1,000 to 1,600 per tick. That makes worker-first compounding the natural opening unless military danger or another constraint offsets it.

## 2. Recruitment can dominate population growth

Each successful recruitment grants the selected recipient one citizen and 250 gold. Housing grants only one citizen per day at the opening level, then 10/20/30/40/50/60 at later housing levels.

Recruitment enforcement varies by route. Core enforcement limits the same recruiter-target pair to five, while auto-target selection also uses a 40-recruitment rolling window. Some route prechecks describe different totals. Exact recipient and cap semantics must be unified before using recruitment in a balance model.

For the expected active cohort:

| Active users | 75% recruiting, rounded |
|---:|---:|
| 10 | 8 |
| 15 | 11 |
| 20 | 15 |

Do not model recruiting as a simple yes/no bonus. Use daily successful-recruitment bands per participating player:

| Behavior | Successful recruits/day | Citizen effect versus opening housing |
|---|---:|---:|
| Light | 5 | 5x housing |
| Regular | 15 | 15x housing |
| Engaged | 25 | 25x housing |
| Cap-seeking | 40 | 40x housing |

At 25 successful recruitments per day, a recipient gains 9,125 citizens and 2,281,250 gold over a year before losses or training. At 40/day, this becomes 14,600 citizens and 3,650,000 gold. Consequently, recruitment participation is likely the strongest source of cohort inequality unless its throughput, recipient distribution, or benefit is deliberately bounded.

## 3. Anticipating player behavior

The stress test should model **policies that choose legal actions from current state**, not scripts that force a predetermined build. Each policy should react to wealth, known opponents, recent attacks, pressure, fort damage, available turns, and estimated risk.

### Core play styles

| Style | Likely opening and adaptation | What must keep it fun |
|---|---|---|
| Economic | Workers first, housing/economy/fort purchases, bank surplus, military after threat rises | Compounding must create options without making early military investment irrational |
| Offensive | Minimum economy, offense concentration, target scanning, high-turn attacks, coordinated focus | Enough viable targets, meaningful loot/XP, and losses that do not erase the attacker after one bad roll |
| Defensive | Workers plus defense/fort, low exposed gold, retaliatory attacks | Deterrence and defender progress; being attacked cannot be the only reliable way to gain XP |
| Spy | Spies, intel collection, target brokerage, opportunistic combat | Spy actions need progression or durable strategic value because they currently spend shared turns/stamina without battle XP |
| Sentry | Sentry investment, secrecy, alliance protection | Preventing intel must have visible value and not become a dead investment when server population is low |
| Balanced | Threshold-based allocation across economy and military | A forgiving route for new players that remains competitive but does not dominate specialists |

### Activity classes

- **Active:** visits daily, spends 60-90% of generated turns over a rolling week, recruits according to its assigned band, and coordinates when profitable.
- **Passive but not idle:** acts every one to three days, banks, trains, repairs, recruits occasionally, and retaliates or changes allocation after losses.
- **Late joiner:** starts at day 30, 90, or 180 and attempts either safe economic growth or alliance-assisted catch-up.
- **Exploit seeker:** hoards turns, shields gold, farms weak opponents, rotates attackers, forms recruitment rings, or synchronizes attacks immediately after resets.

Use imperfect information. A policy should not know hidden scores unless it acquired intel or observed outcomes. Otherwise simulations will overstate coordination and understate the value of spying.

## 4. Required scenario matrix

Run each scenario with at least 30 deterministic seeds and report median, 5th percentile, 95th percentile, and the worst exploit seed.

### Population and activity

- 10 active + 20 passive
- 15 active + 25 passive (primary expected case)
- 20 active + 30 passive

### Recruitment

Cross active participation at 0%, 25%, 50%, 75%, and 100% with 5, 15, 25, and 40 successful recruitments per participating player per day. Include uneven networks where 20% of players receive 80% of recruitment rewards.

### Social organization

- Free-for-all with no alliances
- Two balanced alliances
- A dominant 60/40 alliance split
- Five attackers coordinating on one defender
- A farm ring that exchanges low-risk attacks or recruitment
- An alliance that protects economic accounts while feeding target intelligence to attackers

### Time and joining

Record days 0, 1, 7, 14, 30, 60, 90, 180, and 365. Add 730- and 1,095-day runs to detect long-horizon inflation and level cliffs. Inject late joiners at days 30, 90, and 180.

### Adversarial system conditions

- Missed tick, duplicate tick, and delayed daily-reset execution
- 24-72 hour absence followed by stored-turn spending
- Maximum legal attacks from several unique attackers against one defender
- Repeated spy attempts before and after sentry investment
- Fort destruction followed by active and passive repair behavior
- Player wipe followed by economy-first, defense-first, and alliance-assisted rebuilding

## 5. Metrics that answer whether players will keep playing

Aggregate averages are insufficient. Segment every result by style, activity class, recruitment participation, alliance, and join date.

### Growth and strategic viability

- XP/day and level at every checkpoint
- Citizens, workers, military units, fort, hand/bank gold, and total power
- Turns generated, held, spent, and wasted
- Share of each style in the top quartile for power, wealth, and level
- Marginal benefit of the 1st, 5th, 15th, 25th, and 40th daily recruitment
- Conversion rates among citizens, workers, offense, defense, spies, and sentries

### Combat health

- Attacks per active player/day, win rate, loot/production ratio, and fort breach rate
- Unique attackers per defender/day and repeated attacks per pair
- Population, fort, and hand-gold losses per defender/day
- Time to first meaningful attack and first catastrophic loss
- Frequency of viable targets by level and power, not only by level range

### Recovery and retention proxies

- Wipes per player and days to recover to 25%, 50%, and 90% of pre-wipe power
- Days below 25% power after hostile pressure stops
- Consecutive days with no meaningful affordable action
- Probability a passive account remains a viable participant after 7, 30, and 90 days
- Late-joiner time to reach 25%, 50%, and 75% of incumbent median power

These measures expose the difference between a loss that creates a revenge/rebuild loop and a loss that effectively removes a player from the ERA.

## 6. Preliminary empirical warning

A seeded 40-player, 30-day closed-loop run of the existing harness produced:

- 3,816 attacks, or 3.18 per player/day;
- 3.37% attacker win rate;
- 40.54% high-turn attack share;
- 0.211 loot-to-production ratio;
- 4.85% fort breach rate;
- 869 average held turns;
- average level 1.775 and maximum level 5.

The harness flagged low turn commitment, low attacker win rate, low loot pressure, and excessive turn hoarding. This is a valid warning that the current parameter interaction is unhealthy. It is **not** a new-ERA forecast because the generated population does not match production defaults or the requested active/passive cohort.

## 7. Live-parity work needed before trusting forecasts

The simulator should gain an explicit `eraStart` mode with golden parity tests for:

1. production user defaults and purchased structure state;
2. 48 turn ticks plus one daily reset;
3. worker training and income calculation;
4. housing, fort, economy, and battle-upgrade purchases;
5. every recruitment route and its recipient/cap semantics;
6. attack turns, stamina, pressure, casualties, loot, fort damage, and battle XP;
7. spy costs, outcomes, information persistence, and rewards;
8. exact seeded determinism with independent RNG streams.

The simulator must not infer purchased upgrades from XP level or award simulation-only XP multipliers. It also needs explicit passive, late-joiner, alliance, recruitment-network, churn, and rebuild state.

## 8. Proposed launch gates

These are recommended starting gates for product tuning, not claims about current behavior:

- Golden live/simulator parity tests pass with no negative resources or duplicate grants.
- At days 90 and 365, every core style's median composite viability is between 50% and 150% of the population median when played competently.
- No one style occupies more than 60% of the top power quartile in at least 80% of seeds.
- Recruiting players remain below 1.5x comparable non-recruiters' median power at days 30 and 90, or recruitment is explicitly accepted as a required progression mechanic.
- Fewer than 10% of baseline players remain permanently suppressed 30 days after hostile pressure ends.
- A competent active player reaches 90% of pre-wipe power within 30 days; a passive player within 60 days.
- Five coordinated attackers can cause severe damage, but cannot hold a target below 25% power for more than 14 days after they stop attacking.
- Late joiners have a measured catch-up route; if they cannot reach 50% of incumbent median power within a chosen product window, use protected brackets, diminishing returns against weak targets, or PvE catch-up.
- Stored turns have an intentional cap, decay rule, or diminishing-return design. The existing harness target of 4-32 held turns is incompatible with uncapped live storage.

## 9. PvE recommendation

PvE is most valuable as a pressure valve and recovery tool, not as an unlimited replacement for PvP. Useful roles are:

- low-risk onboarding that teaches attack, spy, and sentry choices;
- rebuilding income/materials after a wipe;
- late-joiner catch-up with diminishing rewards near incumbent power;
- alliance objectives that consume turns and create coordinated play without selecting one human victim;
- predictable baseline XP for defensive, economic, spy, and sentry builds.

PvE rewards should be bounded below efficient risky PvP at equal strength, become less efficient when farmed, and avoid producing unlimited citizens. Otherwise it becomes the dominant safe compounding strategy.

## 10. Recommended decision order

1. Make ticks idempotent and decide turn-storage rules.
2. Unify recruitment caps, windows, recipients, and participation expectations.
3. Add live-parity ERA starts and behavioral cohorts to the simulator.
4. Add wipe/recovery, coordination, late-joiner, and recruitment-concentration metrics.
5. Run the full 30-seed matrix and tune worker payback, housing, battle XP, casualty/loot pressure, and spy rewards from the resulting distributions.
6. Add PvE only against a stated purpose: onboarding, recovery, catch-up, or coordinated objectives.

The key design target is not equal totals for every style. It is that every style has meaningful decisions, counterplay, a visible route to progression, and a recoverable failure state throughout a year-long ERA.

## 11. ERA simulation CLI and interpretation contract

The ERA runner is a **simulation-only** tool. It does not write to Prisma or live player data, and the synchronous admin API remains capped at 365 days. Use the CLI for 730-day work:

```bash
# One 40-player, 730-day production baseline. Required smoke check.
timeout 120s bun scripts/run-era-simulation.ts --manifest smoke --output temp/era-simulation/smoke

# Resume matching cells after an interruption.
bun scripts/run-era-simulation.ts --manifest smoke --output temp/era-simulation/smoke --resume

# Full 1,500-cell comparison matrix. Keep process concurrency at two or below.
bun scripts/run-era-simulation.ts --manifest exhaustive --output temp/era-simulation/exhaustive --max-workers 2
```

For a completed live era, export an auditable calibration candidate before
approving any balance targets:

```bash
bun scripts/export-era-calibration.ts --era-id <completed-era-id> --output /secure/path/era-calibration.json
```

This export is labeled `unapproved-live-export`. It contains start/end era
snapshots plus timestamped battle, bank, and recruitment events; it is not a
continuous unit/item history and must be replayed and reviewed before any ERA
manifest is marked `calibrated`.

Each completed cell is written atomically under the requested output directory:

```text
<cell-id>/
  complete.json  # manifest hash, cell definition, artifact checksum
  report.json    # deterministic machine-readable artifact
  cohorts.csv    # cohort distributions at recorded checkpoints
  report.md      # readable findings and gates
index.json       # matrix-level cell status index
```

### Ruleset labels

**Production truth:** `production` models the current low-level casualty rule: levels 1–9 receive the 0.1 incoming casualty multiplier, each attack has the existing 8% population cap, and there is no defender-wide daily cap or rebuild shield.

**Sensitivity assumption:** `weakLowLevelProtection` keeps the same rules but changes the low-level multiplier to 1.0. It is not a proposed live configuration; it measures the effect of removing that protection.

**Candidate rule:** `candidateSafety` keeps the production multiplier, adds a 20% start-of-day-population daily casualty cap, and adds a seven-day rebuilding shield. The shield ends early on outgoing PvP or at 50% of frozen pre-wipe strategic power. It is simulation-only and is not live behavior.

### Cohort and recruitment assumptions

The primary cohort is 15 active and 25 passive players. Active players contain 4 Farmers (2 greedy, 1 cautious, 1 adaptive), 4 attackers, 2 defenders, 2 spies, 1 sentry, and 2 balanced players. Passive players contain 8 Farmers (3/3/2), 3 attackers, 4 defenders, 2 spies, 2 sentries, and 6 balanced players.

Recruitment bands of 5, 15, 25, and 40 mean successful reward events per selected participant per day—not raw clicks. Every event gives one citizen and 250 hand gold. `self` gives rewards to the participant; `networkWeighted` is a declared 80/20 concentration sensitivity mode. Neither label claims that production routes currently share one unified cap.

### Reading results

`report.json` and `cohorts.csv` provide p05/median/p95 distributions by cohort, persona, and activity class at days 0, 1, 7, 14, 30, 60, 90, 180, 365, 545, and 730. Composite viability is the geometric mean of normalized income, combat power, clandestine power, and level; 1.0 is the same-day population median.

The runner flags balance gates rather than hiding failures. `--enforce-balance-gates` turns those findings into a non-zero cell status. An **invariant failure** is a simulator correctness failure (for example unsafe gold, NaN, duplicate player ID, or malformed state) and invalidates the run. A **balance-gate failure** is a tuning result: the run is valid, but the observed outcome misses a declared product target.

Do not interpret a simulation result as a retention forecast. It is a deterministic balance stress test with explicit behavioral and recruitment assumptions.
