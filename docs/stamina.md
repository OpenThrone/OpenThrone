# Stamina

Stamina is how fresh an army is for attacking. Only attacks spend it; spy
missions are free. Attacks are never blocked: the cost is capped at the
current balance, and below `stamina.penaltyThreshold` the attacker's offense
falls linearly to `stamina.minOffensePercent` at zero (the battle report shows
the cut as "Low stamina: −N% offense"). The browser estimates recovery and the
cost of the selected attack from the shared formula; the server is
authoritative for every attack.

## Default rules

- Maximum balance: 100 stamina (per player, `maxStamina`).
- Recovery: 5 stamina every 10 minutes, in whole intervals; empty to full in
  3h 20m.
- Attack cost: `ceil((baseCost + turns × perTurnCost) × drain)`, where
  `drain` falls from 1 to 0.5 across the offensive upgrades
  (`staminaDrainFactor`). Default: 2 + 0.5 per turn, so 10 turns cost 7.
- Offense penalty: below 50 stamina, down to 80% offense at zero.

The server setting `stamina.enabled` turns stamina costs and the offense
penalty on or off. When off, attacks cost no stamina. `stamina.recoveryEnabled`
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
