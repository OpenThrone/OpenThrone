# Armory

Last verified against code: 2026-11-06 (alpha d59b12d9)

The Armory is where you buy weapons and armor for your troops, sell them back, and upgrade stock to a higher tier. Which items you can buy depends on your Armory structure level and your race. Every change to your item counts is also recorded in the item ledger, which a daily check uses to catch bugs.

Item stats and prices change with balance. They live in [Items.tsx](../../src/constants/Items.tsx); this page describes the rules and the shape only.

## Rules

### Items

- An item has a usage (Offense, Defense, Spy, Sentry), a slot type (Weapon, Helm, Bracers, Shield, Boots, Armor), a tier (level 1 up to 7), a gold cost, a race and an `armoryLevel`.
- Race is `ALL` for almost every item. A few top-tier items are restricted to Human or Elf (at this commit: Long Sword and Great Sword for Humans, Elven Longbow for Elves).
- `armoryLevel` is the Armory structure level needed to buy or upgrade into the item. Higher tiers need a higher Armory level (see [structures.md](structures.md)).
- Stock is stored per player as a count per (type, usage, level). Race variants of the same tier share one stack.
- A count of items covers that many units. How gear adds to army strength is a combat rule, not an economy rule.

### Prices

- Item price: `cost - ceil(priceBonus% x cost)`. `priceBonus` comes from Prices proficiency points, clamped to 0-100.
- Buying also takes any running armory event discount (`armoryCostDiscountPercent`, at most 25%; the discount rounds down), then each line rounds up to whole gold.
- Selling and upgrading never use the event discount.

### Buying

`POST /api/armory/equip`, body `{ userId, items: [{ type, usage, level, quantity }] }`. All lines succeed or none do. Under the player's row lock the server checks, for each line:

1. The item exists for that type, usage and level.
2. It is available to the player's race (`ALL` or the player's race).
3. The player's Armory level is at least the item's `armoryLevel`.

Then the total must be affordable. Success adds to the stacks, recomputes army stats, writes a `SALE` bank-history row with type `ARMORY_EQUIP`, records `ARMORY_BUY` in the item ledger, and marks gameplay activity.

### Selling

`POST /api/armory/unequip`, same body. The player must own the quantity. The refund is 75% of the price-bonus-discounted price, rounded down per line. Selling is not blocked by race or Armory level. Writes `ARMORY_UNEQUIP` history and records `ARMORY_SELL`.

### Upgrading

`POST /api/armory/upgrade`, body `{ userId, conversions: [{ fromItem, toItem, conversionAmount }] }`, up to 100 conversions per order. An item id is `<usage>_<item id>`, for example `OFFENSE_DAGGER`.

- The source and target must share usage and slot type, and the target must be a higher tier. Downgrades, same tier and cross-slot chains are refused.
- The target must be available to the player's race and Armory level.
- Per unit, the price is the discounted target cost minus the discounted cost of the source tier's cheapest definition. Tiers that several race variants share are credited at the cheapest one.
- A positive difference costs gold. A negative difference refunds 75% of it, rounded down.
- Costs and refunds across all conversions are summed, then the player must have enough gold for the total cost. Inventory is applied conversion by conversion, so the same source cannot be spent twice.
- Writes `ARMORY_UPGRADE` history (with cost and refund) and records `ARMORY_UPGRADE` in the item ledger. The client never supplies prices.

### Mercenaries

The mercenary hire and dismiss routes under `/api/armory` forward to the mercenary service (`/api/mercenaries`). They are not covered here.

## Item ledger and daily item check

Every change to a player's item counts writes a signed row to the item ledger next to the balance change, in the same transaction. The reasons are `ARMORY_BUY`, `ARMORY_SELL`, `ARMORY_UPGRADE`, `ADMIN_EDIT`, `ADMIN_GRANT`, `FORCE_CONTRIBUTION` (items given to a temporary force) and `ACCOUNT_RESET`. Writers record what the operation meant to do, not a diff of the saved rows.

Once per OT calendar day, after the daily cron request (even if the daily pass failed), the check runs on one consistent database snapshot:

- The first ever run is a baseline: it stores every non-zero balance as a checkpoint and reports nothing.
- Later runs compare each balance with `checkpoint + changes recorded since`. A missing row and a zero row are the same balance.
- Each unexplained difference is stored as a mismatch (with the drift) and the checkpoint moves to the real balance, so each problem is listed once.
- The check never changes a player's items and never throws. Entries from a missed or failed run stay unconsumed and are picked up by the next run. A second run on the same day is skipped.

New code that writes `UserItem` must record to the ledger. A test fails if an unlisted file writes `UserItem`.

## Why it works this way

- Conversion prices come from per-item values, so any cycle of conversions pays at least as much as it refunds (comment on `quoteItemConversion`; test "armoryConversion.cycles").
- The server prices conversions itself and does not accept caller-supplied prices (test "does not accept caller-supplied conversion prices").
- The ledger needs writers to record intent rather than diffs, so a bad write shows up as drift ([ItemLedger.service.ts](../../src/services/ItemLedger.service.ts), CHANGELOG "Daily item check (#370)").
- Event discounts stop at 25% because selling refunds 75%: a bigger discount would let players buy during an event and sell back at a profit (comment in [gameEvents.ts](../../src/constants/gameEvents.ts)).
- The check is report-only and independent of the daily pass (comment in the daily cron handler).

## Admin and settings

- Administration, Events: `armoryCostDiscountPercent`.
- Administration, Users, Upgrades editor (Manage Users): edit a player's items; each change is recorded as `ADMIN_EDIT` or `ADMIN_GRANT`.
- Administration, Ledgers, Item drift (View Economy): the mismatch list. Nothing is corrected automatically. Clean days appear in the Cron run log.

## Source

- [Armory.service.ts](../../src/services/Armory.service.ts)
- [ItemLedger.service.ts](../../src/services/ItemLedger.service.ts)
- [armoryPricing.ts](../../src/utils/armoryPricing.ts)
- [armoryUpgradeSchema.ts](../../src/utils/armoryUpgradeSchema.ts)
- [Items.tsx](../../src/constants/Items.tsx)
- [UserUnitsService.ts](../../src/services/UserUnitsService.ts) (`getAvailableItemTypes`)
- [armory API](../../src/pages/api/armory) (equip, unequip, upgrade)
- [daily cron API](../../src/pages/api/cronJobs/daily.ts)
- [ledgers admin API](../../src/pages/api/admin/ledgers/[kind].ts)

## Tests

- [Items.test.ts](../../src/constants/Items.test.ts): every item needs an Armory level a player can reach.
- [armory.security.test.ts](../../src/services/__tests__/armory.security.test.ts): Armory level and race gates, the sell refund amount, row lock, combined upgrade pricing, all-or-nothing upgrades, caller prices ignored.
- [armoryConversion.cycles.test.ts](../../src/services/__tests__/armoryConversion.cycles.test.ts): no gold gain from conversion cycles.
- [armory-upgrade-api.test.ts](../../src/__tests__/armory-upgrade-api.test.ts): upgrade route rejects other users, empty orders, wrong methods.
- [armoryOrder.test.ts](../../src/utils/armoryOrder.test.ts): client order planning (Max, shared tiers, reserved gold).
- [ItemLedger.service.test.ts](../../src/services/__tests__/ItemLedger.service.test.ts): merging of deltas and the comparison logic.
- [itemLedger.test.ts](../../test/integration/itemLedger.test.ts): baseline, buy/sell/upgrade explained, resets and era rollovers, drift reported once, same-day rerun, concurrent runs.
- [item-ledger-writers.test.ts](../../src/__tests__/item-ledger-writers.test.ts): every `UserItem` writer is on the instrumented list.

## Known gaps

- The Long Sword (Human, 1,500 bonus) is the strongest weapon in the game and has no equivalent for other races. The next best racial weapons, the Great Sword and Elven Longbow, have a 1,200 bonus.
- No test covers the event discount through `equipItems`.
- Selling (`unequipItems`) has no race or Armory level check.
