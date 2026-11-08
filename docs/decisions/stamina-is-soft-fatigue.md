# Stamina is soft fatigue, not a second attack counter

Date: 2026-10-28. Shipped in PR #253. Rules: [Stamina](../mechanics/stamina.md).

## Decision

Stamina is how worn the attacking army is right now. It must never block play. Attacks always go through, and low stamina changes how well the army performs.

## Why

Each meter has its own job: morale is how the kingdom feels across days, defense pressure is how worn the garrison is today, and stamina is how worn the attacking army is right now.

- Low stamina lowers the assault contest and the loot gate. It does not scale casualties or damage.
- Upgrades reduce the stamina an attack costs rather than raising the 100-point cap.
- Recovery stays on the existing wall-clock rule (5 every 10 minutes by default) instead of a per-turn grant. It is more flexible and already had admin controls.
