# Reanimation and captives

Last verified against code: 2026-11-06 (alpha d59b12d9)

Two after-battle systems turn dead troops into something else. A kingdom with a dungeon takes some of the defender's fallen as captives, who can be ransomed, released or pressed into service. An Undead kingdom raises a share of the fallen, its own and the enemy's, as level 1 units. They share a battle hook, so they are documented together.

Both tunings are constants; read them in [Captives.ts](../../src/constants/Captives.ts) and [Reanimation.ts](../../src/constants/Reanimation.ts). Racial upgrade changes to both are in [progression.md](progression.md).

## Rules

### Order inside a battle

After casualties are decided, in the same transaction and under the locks the battle already holds: first the captives hook, then Elf Sanctuary, then reanimation. The reanimated units are added to rosters after the battle's own unit updates, so nothing is overwritten. None of these steps changes the battle's outcome or loot.

A defender who is protected as a new player, or whose account is not ACTIVE (for example on vacation), is exempt from all three.

### Captives: taking them

A battle takes captives only when all of these hold:

- `SHOW_DUNGEON` is on (default off). When it is off, nothing is captured; the units die.
- The attacker won and the defender's fort reached 0 hit points (a breach).
- The attacker has a dungeon: fort level 13 or higher (the `DUNGEON` feature, Citadel).
- The defender is not exempt (see above).

Then:

- The dungeon takes 10% of the defender's killed combat units, floored once on the battle total (not per stack). A Goblin with Raiders takes 12% to 18%.
- Only the defender's own trained Offense, Defense, Spy and Sentry units count. Citizens, Workers, mercenaries, and any alliance or contract force rows never do.
- The total is split across the killed stacks proportionally (largest remainder), so splitting stacks cannot dodge it.
- Capacity is 200 captives at fort level 13, plus 50 for each fort level above (Goblin Raiders add 25% to 100%). Captures beyond free space die as before.
- Each stack is one captive row (captor, source, unit type and tier, quantity, time, era).

### Captives: what happens next

All actions use `POST /api/kingdom/dungeon/actions` with `{ action, captiveId, operationId }` (a UUID). A retry with the same `operationId` replays the stored result; reusing it for different terms is refused. Captives from an earlier era are refused. `GET /api/kingdom/dungeon` returns both sides of the panel.

| Action | Who | Rule |
| --- | --- | --- |
| Ransom | The source (captured player) | Pays 40% of the unit's base cost per unit (rounded up) from gold on hand. The captor gets half (Goblin Raiders: 55% to 70%); the rest is burned. Units return to the source at their original tier. |
| Release | The captor | Free. Units return to the source at their original tier and the source gains 2 kingdom morale (capped at 100). |
| Convert | The captor | Only after 72 hours in the dungeon and while the captor still has the dungeon. Costs 25% of base cost per unit, rounded up. Units join the captor's army at the highest tier of their type, at or below the original tier, that the captor's fort has unlocked. |
| Escape | Automatic | The daily pass returns captives to the source as level 1 citizens when they have been held 7 days, or when the captor no longer has the dungeon (fort below 13). |

An era rollover or an admin current-era reset deletes every captive without returning anyone. Each action writes a `DUNGEON` bank-history row and a captive event (`CAPTURED`, `RANSOMED`, `RELEASED`, `CONVERTED`, `ESCAPED`).

### Reanimation

Reanimation applies to a side when all of these hold:

- Its race is Undead and its fort level is 5 or higher (the `REANIMATION` feature).
- `ENABLE_REANIMATION` is on (default on).
- The defender is not exempt, and an attack was resolved against them. Either side can be the Undead one.

What rises, as level 1 units of the same type as the fallen:

- Own pool: 8% of the Undead side's own fallen combat units at fort level 5, plus 0.5 percentage points per fort level above 5, up to 15% (reached at fort 19).
- Enemy pool: 4% of the opponent's dead at fort 5, plus 0.5 points per level, up to 8% (reached at fort 13).
- Necropolis (Undead racial tier 1 to 4) adds 1 to 4 percentage points to both pools.
- Each pool is floored once on the fallen total, then split across the fallen stacks (largest remainder).
- Only trained Offense, Defense, Spy and Sentry units of the player's own army are dead. Citizens, Workers, mercenaries and force rows never rise. Units taken captive are not dead and are taken out of the pools. Units an Elf's Sanctuary recovered are also removed.
- Hallowed Ground: when an Undead attacker fights a non-Undead defender with a racial tier, a share of the attacker's own-dead pool is blocked (20% to 65% by tier). Only the attacker's own pool is blocked.

Daily cap: 2% of the side's trained combat army (not mercenaries), floored; Necropolis raises it to 2.5% to 4%. The cap is measured at the side's first eligible battle of the game day and kept for the whole day, so training or releasing afterwards does not change it. Own fallen rise first; the enemy's dead fill what is left. Excess is lost, never carried over. The day total is stored on the player (`reanimated_today`, `reanimation_day`, `reanimation_cap`) and cleared by an era reset.

`GET /api/kingdom/reanimation` shows the Undead player their own count and cap for the day. Other players and shared viewers are not shown how many rose.

## Why it works this way

- Rounding on the total, not per stack, makes splitting stacks worthless for dodging or farming (constants comments; tests "rounding on the battle total makes stack-splitting worthless").
- A captive "sits in a dungeon, not in a grave", so it cannot also rise ([Reanimation.ts](../../src/constants/Reanimation.ts), `deadCombatRows`).
- Half of every ransom is burned "so ransoms can never be used to funnel gold between kingdoms" ([Captives.service.ts](../../src/services/Captives.service.ts); constants comment "anti gold-funnel"; test "a ransom never increases the pair's combined gold").
- Converted captives and defectors never keep a tier the new fort has not unlocked ([Captives.ts](../../src/constants/Captives.ts), `demotedUnitLevel`).
- Force rows (alliance contingents, mercenary contracts) belong to their sender, so they are never captured or raised (constants comments).
- The daily cap basis is stamped at the first battle of the day so a small army cannot be inflated with an alt or by training after the fact (test "an Undead attacker with a small army cannot farm a huge alt past its 2% cap"; service comment).
- Dungeon actions lock both players in ascending id order, the same order attacks use, so they cannot deadlock a battle ([Captives.service.ts](../../src/services/Captives.service.ts)).

## Admin and settings

- Administration, System: Runtime Settings: `SHOW_DUNGEON` (default off) and `ENABLE_REANIMATION` (default on).
- Administration, Users: the main user editor sets fort level and race.
- A battle void can reverse the captures and reanimation of the voided battle ([BattleVoid.service.ts](../../src/services/BattleVoid.service.ts)).

## Source

- [Captives.ts](../../src/constants/Captives.ts)
- [Captives.service.ts](../../src/services/Captives.service.ts)
- [Reanimation.ts](../../src/constants/Reanimation.ts)
- [Reanimation.service.ts](../../src/services/Reanimation.service.ts)
- [Sanctuary.service.ts](../../src/services/Sanctuary.service.ts)
- [RacialPerks.ts](../../src/constants/RacialPerks.ts)
- [FeatureUnlocks.ts](../../src/constants/FeatureUnlocks.ts)
- [AttackService.ts](../../src/services/AttackService.ts) (the battle hooks)
- [CronJob.service.ts](../../src/services/CronJob.service.ts) (daily escape pass)
- [dungeon API](../../src/pages/api/kingdom/dungeon) (index, actions) and [reanimation API](../../src/pages/api/kingdom/reanimation.ts)

## Tests

- [Captives.test.ts](../../src/constants/Captives.test.ts): capacity, capture rounding, price and timing helpers, tier demotion.
- [captives.test.ts](../../test/integration/captives.test.ts): capture conditions (dungeon, protected, vacation, repelled, hidden dungeon), ransom, release, convert, escape, era clearing, races between actions.
- [captivesEdges.test.ts](../../test/integration/captivesEdges.test.ts): concurrency, replay, capacity edges, malformed orders, cross-era and third-party refusals.
- [Reanimation.test.ts](../../src/constants/Reanimation.test.ts): shares, caps, rounding, which rows count.
- [reanimation.test.ts](../../test/integration/reanimation.test.ts): shares in play, day cap across battles, switches, exemptions, captured units excluded, privacy of counts.
- [reanimationEdges.test.ts](../../test/integration/reanimationEdges.test.ts): alt farming, stack splitting, mercenaries and forces, day boundary, race or fort change mid-day, shared ledger.
- [racialPerks.test.ts](../../test/integration/racialPerks.test.ts): Raiders, Necropolis, Hallowed and Sanctuary effects.

## Known gaps

- The combat ruleset tables still carry an Undead `resurrection` block (unlock level 5, attack and defense rates). Nothing reads it; the live rules are in [Reanimation.ts](../../src/constants/Reanimation.ts).
