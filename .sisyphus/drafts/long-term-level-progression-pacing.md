# Draft: Long-Term Level Progression Pacing

## Requirements (confirmed)
- Target level 100 should be a "2-3 year plan", possibly longer.
- Early game should unlock the main full game "without any nerfs/protections" after a few days/weeks.
- Higher-level gameplay should unlock over a few weeks to months.
- Endgame should require years of grinding and maneuvering.
- Turns should set the global ceiling for attacks/day and XP potential/day.
- Spying already spends turns, so aggressive attackers may trade scouting value against direct XP progression.

## Technical Decisions
- Treat progression pacing as the primary baseline before tuning attacker/defender win rates.
- Use the live XP ladder (`levelXPArray`) as the source of truth, not the simulator's current `level * 1000` approximation.
- Model personas explicitly: Attack + Loot, Generate Wealth + Defense, Well Rounded, Spy/Intel Control, Casual.
- Evaluate XP/day, days/level, attacks/day, turn allocation, and win rate by persona matchup.
- Level 100 target: idealized near-perfect Attack + Loot player should take roughly 36 months.
- First tuning lever: fix XP formula and simulator accuracy before changing `levelXPArray`.

## Research Findings
- Live turn cadence: 1 attack turn every 30 minutes = 48 turns/day maximum.
- Live level 100 threshold: 5,251,000 XP.
- Current attack XP makes low-turn wins far more XP-efficient per turn than high-turn wins.
- Current simulator levels with `xpNeeded = player.level * 1000`, which does not match live `levelXPArray`.
- Current simulator hardcodes `DAILY_CITIZEN_GRANT = 250`; live daily cron applies `recruitBonus`/housing value unless the 250 comes from another flow.

## Open Questions
- Should low-turn attacks give negligible XP, or should XP/turn be roughly normalized across turn sizes?
- What level range marks "main full game without nerfs/protections"?
- What level bands should unlock higher-level gameplay systems?

## Scope Boundaries
- INCLUDE: XP pacing, turn economy, simulator persona redesign, calibration targets.
- INCLUDE: verifying daily citizen/turn assumptions against live cron/user flows.
- EXCLUDE: immediate combat damage/loot tuning until progression baseline is set.
