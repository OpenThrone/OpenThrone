# Training

Last verified against code: 2026-11-06 (alpha a365a67d)

Training turns citizens into units for gold. You can also untrain units back into citizens for a partial refund, and convert units between tiers of the same type. The Training page shows prices after your discounts and what your fort lets you train.

Unit and cost numbers change with balance. They live in [Units.tsx](../../src/constants/Units.tsx); this page describes the rules and the shape only.

## Rules

### Unit types and tiers

- Six unit types: Citizen, Worker, Offense, Defense, Spy, Sentry. Citizens and Workers have one level.
- Offense, Defense, Spy and Sentry have three tiers each (levels 1 to 3). Hit points rise with the tier (10, 20, 30). The tier 1 combat units and the Worker have fixed prices; tier 2 and tier 3 cost several times more.
- Tier 2 and 3 are stronger per unit. Spy and Sentry tier 3 (Assassin, Inquisitor) are far stronger than their tier 2 in raw stats, so they are gated higher.
- Every unit definition has a `fortLevel`: the fort level that unlocks it. At this commit: Worker and all tier 1 units need fort level 1; Offense and Defense tier 2 and 3 need 4 and 7; Spy and Sentry tier 2 and 3 need 8 and 12.
- The unlock is the player's fort level, not the player level. The Training page lists units up to 4 fort levels ahead once the fort is at level 5, but shows them disabled; the server enforces the exact fort level.

### Training

- Each unit trained uses one citizen and the gold price. Both are checked under the player's row lock. The order fails as a whole if citizens, gold or any unlock is short.
- Price per unit: `cost - ceil(priceBonus% x cost)`, never below 0. `priceBonus` comes from Prices proficiency points (clamped to 0-100). A running event discount (`unitCostDiscountPercent`, at most 25% in total) is taken off that price, rounding the discount down. The total is rounded up to whole gold.
- The charge equals the Order Summary shown on the page (#347).
- Unknown unit types or levels are rejected, never priced at 0.
- Success writes a `SALE` bank-history row with type `TRAINING_TRAIN`, recomputes offense, defense, spy and sentry, and marks gameplay activity.

### Untraining

- Returns units to citizens one for one.
- Refund: 75% of the price-bonus-discounted price, rounded down for each unit line. Event discounts are not applied to refunds.
- Only regular (non-mercenary) stacks can be untrained. Mercenary and alliance troops cannot be cashed out as citizens or gold.
- Citizens are created if the player had none left. Writes `TRAINING_UNTRAIN` history and marks gameplay activity.

### Converting

- Moves units between tiers of the same type (for example Soldier to Knight). The same level, or a different type, is refused.
- No citizens are used.
- Upgrading costs the difference between the two discounted prices. Downgrading refunds 75% of the difference, rounded down.
- The target tier must be unlocked by the fort level, exactly as for training. Downgrading into an unlocked tier is allowed.
- Event discounts are not applied. Writes `TRAINING_CONVERSION` history. Does not mark gameplay activity.

### Mercenaries

Mercenary stacks are kept apart from regular stacks. Training, untraining and converting touch only regular units; matching mercenary stacks are preserved.

## Why it works this way

- Training and converting share one unlock check so a player cannot reach a locked tier through conversion ([Training.service.ts](../../src/services/Training.service.ts), `assertUnitUnlocked`).
- Price uses one shared function so the card, the Order Summary and the charge agree (#347, [units.ts](../../src/utils/units.ts)).
- Unknown units throw instead of costing 0, so a bad request cannot train for free (test "calculateTotalCost throws for unknown units instead of returning 0").
- Refunds are always 75% of the undiscounted price, not of an event-discounted one, and event discounts stop at 25%: a bigger discount would let players buy during an event and sell back at a profit (comments in [gameEvents.ts](../../src/constants/gameEvents.ts)). Game events are described in [game-events.md](game-events.md).
- Unit definitions are tuned so offense is attack-forward, defense is defense-forward and ranged keeps counterplay (see [Units.test.ts](../../src/constants/Units.test.ts)).

## Admin and settings

- No runtime setting changes training. Prices and unlocks are code constants.
- Administration, Events: `unitCostDiscountPercent` discounts training prices.
- Administration, Users, Upgrades editor: staff with Manage Users can set a player's units, items, battle upgrades, structure levels and proficiency points.

## Source

- [Training.service.ts](../../src/services/Training.service.ts)
- [units.ts](../../src/utils/units.ts)
- [Units.tsx](../../src/constants/Units.tsx)
- [UserUnitsService.ts](../../src/services/UserUnitsService.ts)
- [gameEvents.ts](../../src/constants/gameEvents.ts)
- [training API](../../src/pages/api/training) (train, untrain, convert)
- [training page](../../src/pages/battle/training.tsx)

## Tests

- [training.security.test.ts](../../src/services/__tests__/training.security.test.ts): fort unlock for train and convert, row lock, unknown units, refunds, citizens recreated on untrain, mercenary stacks preserved.
- [units.test.ts](../../src/utils/units.test.ts): charge matches the card price.
- [Units.test.ts](../../src/constants/Units.test.ts): tier stat shape.
- [trainingMax.test.ts](../../src/utils/trainingMax.test.ts) and [trainingPresets.test.ts](../../src/utils/trainingPresets.test.ts): the Max button and presets.
- [UserUnitsService.test.ts](../../src/services/__tests__/UserUnitsService.test.ts): totals and population.

## Known gaps

- Conversion rounds the price discount with `Math.round`; training rounds it with `Math.ceil`. A conversion can differ by up to 1 gold per unit from the difference of the two prices on the page.
- No test sends an event discount through `trainUnits` or checks that `convertUnits` and `untrainUnits` ignore it.
- Convert does not mark gameplay activity, so converting alone does not qualify an account for a flat daily-citizen event bonus.
