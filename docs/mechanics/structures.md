# Structures

Last verified against code: 2026-11-06 (alpha 43c5fff7)

Structures are permanent upgrades you buy with gold: your fort, housing, economy, offense, spy and armory tracks, plus a racial track. The fort level is the key to everything else: most other upgrades, higher unit tiers and several features need a minimum fort level. Battle upgrades (siege gear and similar) and fort repair are separate purchases and are covered here too.

Costs and stat tables live in constants and change with balance: [Fortifications.tsx](../../src/constants/Fortifications.tsx), [Structure_Upgrades.tsx](../../src/constants/Structure_Upgrades.tsx), [Battle_Upgrades.tsx](../../src/constants/Battle_Upgrades.tsx), [RacialPerks.ts](../../src/constants/RacialPerks.ts). This page describes the rules and the shape.

## Rules

### Buying a structure upgrade

`POST /api/structures/upgrades`, body `{ currentPage, index }`, where `currentPage` is one of `fortifications`, `houses`, `economy`, `offense`, `armory`, `spy`, `racial`.

- Levels are bought one at a time, in order. Asking for any other level is refused ("Current level is N").
- The server locks the player's row, checks the gates below, checks gold, then deducts the price. The price is the table price: the Prices proficiency bonus and event discounts do not apply. There is no sell or refund path.
- Success writes a `SALE` bank-history row with type `<TRACK>_UPGRADE` (for example `FORTIFICATIONS_UPGRADE`).
- Gates use "at least": a requirement of fort level 7 is met by fort level 7 or higher.

### The tracks

| Track | Levels | Starts at | What it needs | What it gives |
| --- | --- | --- | --- | --- |
| Fortifications | 24 (Manor to Empire Level 3) | level 1 | Player level (5 x (level - 1) at this commit) | Gold per turn, defense bonus %, hit points, casualty mitigation, repair price |
| Housing | 7 (0 to 6) | level 0 | Fort level | Citizens per day (see [economy.md](economy.md)) |
| Economy | 7 (Farm to Meat Market) | index 0 | Fort level | Gold per Worker, bank deposits per day, friend transfer limits, feature unlocks |
| Offense (siege) | 22 | level 1 | Fort level | Offense bonus %, lower stamina drain per attack turn |
| Spy | 22 | level 1 | Fort level | Spy bonus %, mission limits: intel from level 1, infiltrations from level 7, assassinations from level 16 |
| Armory | 6 | level 1 | Fort level | Higher item tiers (see [armory.md](armory.md)), casualty mitigation % |
| Racial | 4 tiers | tier 0 | Fort level (see [progression.md](progression.md)) | Race perks |

Notes:

- Fortifications are the only track gated by player level, not fort level. The fort's `levelRequirement` is 0, 5, 10, ... 115. This is why Structure Upgrades has nothing to buy before player level 5.
- Buying a fort level sets fort hit points to the new level's maximum.
- Tier 1 of offense, spy and armory is free and everyone has it. New accounts also get a Sentry row at level 1.
- The offense and fort bonuses are added to your offense and defense bonus percentages. How they combine in battle is a combat rule.

### Fort repair

`POST /api/account/repair`, body `{ repairPoints }`. Each point costs the current fort level's `costPerRepairPoint`. The server caps the repair at the missing hit points and charges only for the points actually restored. Refused when the fort is at full health or gold is short. The price is not discounted. Writes `FORT_REPAIR` history and marks gameplay activity.

### Battle upgrades

`POST /api/battle/upgrades` buys or sells siege gear and its spy and sentry counterparts. There are four types (Offense, Defense, Spy, Sentry) and two levels of each.

- To buy, the matching structure level must reach the upgrade's `SiegeUpgradeLevel` (6 for all upgrades at this commit). Offense and Defense upgrades use the Offense structure. Spy and Sentry upgrades use the Spy structure.
- The player level and the player's units must also meet `minUnitLevel` (2 at this commit): the player must own at least one unit of that type at that tier or higher.
- Each upgrade covers `unitsCovered` units. You can own many, to cover more units.
- Price: table cost less the Prices proficiency bonus, rounded up per line. No event discount.
- Selling refunds 75% of that price, rounded down. You can only sell what you own.
- A line holds at most 10,000. Duplicate lines in one order are merged first.
- Writes `BATTLE_UPGRADES_BUY` or `BATTLE_UPGRADES_SELL` history.

### Feature unlocks

Some features need an upgrade level, checked by the server with `hasFeature`:

| Feature | Needs |
| --- | --- |
| Gold transfers to friends | Economy index 3 (Coal Mine) |
| Mercenary hall | Fort level 2 (Village) |
| Mercenary companies | Fort level 4 (Outpost) |
| Elite mercenaries | Fort level 7 (Stronghold) |
| Dungeon | Fort level 13 (Citadel) |
| Reanimation | Undead race and fort level 5 |

The UI shows an economy-gated tier only once it is built or can be bought next. Structure Upgrades appears at player level 5. Battle Upgrades appears once any of its upgrades is unlocked. Dungeon and reanimation also have admin switches (`SHOW_DUNGEON`, `ENABLE_REANIMATION`).

## Why it works this way

- The service gates mirror the UI checks (`>=` requirement), noted in the comment at the top of the gate code in [Structure.service.ts](../../src/services/Structure.service.ts), so the page and the server cannot disagree.
- Battle upgrade gates are shared with the page and the army simulator through one helper so they cannot drift ([battleUpgradeStructure.ts](../../src/utils/battleUpgradeStructure.ts)). The CHANGELOG records "SENTRY upgrades unlock with the SPY structure".
- Structure purchases are listed under the Sale filter of the bank history (#346).

## Admin and settings

- Administration, Users (Manage Users): the main user editor sets fort, housing and economy levels. The Upgrades editor sets the offense, spy, sentry and armory structure levels and battle upgrades. Values are bounded to the table lengths. No admin screen edits the racial tier.
- Administration, System: Runtime Settings: `SHOW_DUNGEON`, `ENABLE_REANIMATION`.

## Source

- [Structure.service.ts](../../src/services/Structure.service.ts)
- [Battle.service.ts](../../src/services/Battle.service.ts) (`manageBattleUpgrades`)
- [Account.service.ts](../../src/services/Account.service.ts) (`repairFortification`)
- [FeatureUnlocks.ts](../../src/constants/FeatureUnlocks.ts)
- [menuUnlocks.ts](../../src/utils/menuUnlocks.ts)
- [battleUpgradeStructure.ts](../../src/utils/battleUpgradeStructure.ts)
- [UserStatsService.ts](../../src/services/UserStatsService.ts) (fort health, bonuses from structures)
- [UserUnitsService.ts](../../src/services/UserUnitsService.ts) (spy mission limits)
- [Fortifications.tsx](../../src/constants/Fortifications.tsx)
- [Structure_Upgrades.tsx](../../src/constants/Structure_Upgrades.tsx)
- [Battle_Upgrades.tsx](../../src/constants/Battle_Upgrades.tsx)
- [structures API](../../src/pages/api/structures/upgrades.ts), [repair API](../../src/pages/api/account/repair.ts), [battle upgrades API](../../src/pages/api/battle/upgrades.ts)

## Tests

- [AccountService.rules.test.ts](../../src/services/__tests__/AccountService.rules.test.ts): fort repair clamping and the full-health refusal.
- [structure.security.test.ts](../../src/services/__tests__/structure.security.test.ts): gates for fortifications, housing, economy, offense, armory and spy, sequential order, affordability, row lock.
- [racialPerks.test.ts](../../test/integration/racialPerks.test.ts): racial purchases enforce race, fort level, gold, order and replay safety.
- [FeatureUnlocks.test.ts](../../src/constants/FeatureUnlocks.test.ts): unlock rules, including the mercenary hall at the Village and Undead-only reanimation.
- [menuUnlocks.test.ts](../../src/utils/menuUnlocks.test.ts): when the Structure and Battle Upgrades menus appear.
- [battleUpgrades.security.test.ts](../../src/services/__tests__/battleUpgrades.security.test.ts): buy gates, sell at 75%, quantity limits, row lock.
- [battleUpgrades.distribution.test.ts](../../src/services/__tests__/battleUpgrades.distribution.test.ts): coverage of `unitsCovered`.
- [battleUpgradeStructure.test.ts](../../src/utils/battleUpgradeStructure.test.ts): which structure unlocks which type.
- [AccountService.locks.test.ts](../../src/services/__tests__/AccountService.locks.test.ts): repair charges per point and refuses when the locked balance is short.
- [history.structures.api.test.ts](../../src/__tests__/pages/api/bank/history.structures.api.test.ts): purchases appear in bank history.
- [fortDamage.test.ts](../../src/utils/fortDamage.test.ts): wall art by health band.

## Known gaps

- Players cannot buy the Sentry structure track: `StructureService` accepts no `sentry` type. Every account has a Sentry row at level 1 (0% bonus), and only the admin editor changes it. Sentry battle upgrades unlock with the Spy structure.
- The Goblin `fortRepairCostMultiplier` (0.95) exists in the combat ruleset tables, but fort repair never uses it.
- Some constants comments name fort tiers that differ from the level they sit on (for example the Armory 'Leather Armory 2' comment says Stronghold Level 3 for fort level 10, which is Fortress). The numbers are what the server uses.
