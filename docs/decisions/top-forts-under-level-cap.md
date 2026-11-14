# The top forts step by two levels to fit under the level cap

Date: 2026-11-09. Rules: [Structures](../mechanics/structures.md#the-tracks).

## Decision

Fort level requirements rise by 5 player levels per fort up to Kingdom (fort level 19, level 90). The last five forts rise by 2: Kingdom Level 2 at 92, Kingdom Level 3 at 94, Empire at 96, Empire Level 2 at 98 and Empire Level 3 at 100, the level cap. The upgrade tracks keep their forts, so Housing Level 6, Ballistas and Forging unlock with Empire at level 96. Forgery Detection's fort is reachable too, but players still cannot buy the Sentry track (a separate known gap in [Structures](../mechanics/structures.md#known-gaps)).

## Reason given

At 5 levels per fort the three Empire forts needed levels 105, 110 and 115, but levels stop at 100. Nobody could build them, so the tiers on fort 22 were out of reach (#404). The owner asked to move those upgrades down the levels so players get a chance at them. Of three layouts offered, they chose this one over putting the four tiers on Kingdom Level 3 or opening all three Empire forts at level 100. With this layout, each top fort keeps its own step.

## What follows from it

- Kingdom Level 2 and Kingdom Level 3 open a little earlier (92 and 94 instead of 95 and 100). No current player is close: when this was decided, the highest active player was level 11.
- Meat Market stays on fort level 21 (Kingdom Level 3), where v0.13.1 put it.
- `src/constants/upgradeReachability.test.ts` fails if any fort needs more than the level cap or any tier sits behind an unreachable fort.
