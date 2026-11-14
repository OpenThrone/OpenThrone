# Progression

Last verified against code: 2026-11-12 (alpha 8ffa50de)

Progression is how a kingdom grows over an era: experience (XP) raises your level, each level gives a proficiency point, your race and class give permanent bonuses, and a racial upgrade track adds a perk for your race. Player level and fort level together decide what you can buy and use.

Tables (XP per level, race and class bonuses, racial tier tuning) live in constants and rulesets: [XPLevels.tsx](../../src/constants/XPLevels.tsx), [Bonuses.tsx](../../src/constants/Bonuses.tsx), [RacialPerks.ts](../../src/constants/RacialPerks.ts).

## Rules

### XP and levels

- Level is derived from XP: the highest level whose XP threshold is reached. There are 100 levels. Level 1 starts at 0 XP; thresholds then rise with every level. Above level 100, level stays 100. Each account's level and "XP to next level" come from [UserStatsService.ts](../../src/services/UserStatsService.ts).
- Levels, race bonuses and class bonuses are read from the combat ruleset in force (a frozen copy of the constants). At this commit the ruleset tables and the constants have identical values for levels, bonuses and housing.
- XP only comes from battles, for both the attacker and the defender. Spy missions give no XP. An active game event can multiply battle XP (`xpMultiplier`). The balance is capped so XP cannot pass the database integer limit.
- The XP formula (turns committed, level gap, closeness, morale, fort breach, defender share, anti-camping ramp) is a battle rule. It is in [attackFunctions.ts](../../src/utils/attackFunctions.ts) and [battle-spy-workflow-reference.md](../battle-spy-workflow-reference.md). Per committed turn, XP tapers down as the attacker's level rises, in bands.
- The time a player reached their current level is stamped each time a XP change moves the level (`level_reached_at`). The battle rules use it for the anti-camping ramp.
- A battle void can remove XP, so level can go down.

### Proficiency points

- A player has `level - points spent` proficiency points to spend. They get one more with each level.
- Five proficiency types: Offense, Defense, Intel, Prices, Income.
- `POST /api/account/bonusPoints`, body `{ changeQueue: { <TYPE>: { change } } }`. Only increases are accepted. A negative total or any point removal is refused: spending is permanent and there is no refund or respec for players.
- A type tops out at 75 points.
- The server locks the row and re-checks the balance inside the lock.
- Each point has diminishing returns. The bonus multiplier is `1 + 0.35 x p / (p + 250)` for `p` points, so 75 points give about +8.1%. The bonus adds to the percentage bonuses from race, class and structures.
- Offense and Defense raise those army bonuses. Intel raises the spy and sentry bonuses. Income raises gold per turn. Prices lowers training, armory and battle upgrade prices; the total price bonus is clamped to 0-100%, so costs can never go negative.
- If XP drops and the level falls below the points already spent, available points show 0. Spent points are not taken back.

### Race and class

- Race (Elf, Human, Goblin, Undead) and class (Fighter, Cleric, Assassin, Thief) are chosen at registration. No player-facing route changes them; the admin user editor can.
- Each race and each class gives a flat +5% bonus:

| Source | Bonus |
| --- | --- |
| Human, Undead, Fighter | Offense |
| Elf, Goblin, Cleric | Defense |
| Thief | Income |
| Assassin | Intel (spy and sentry strength) |

- Races also have small combat multipliers (for example Human 2% on offense, defense and spy; Elf 5% on spy and sentry; Goblin 3% more gold from raids). They live in the combat ruleset and apply in battle.

### Racial upgrades

A fourth upgrade track, bought on Structures, Upgrades (see [structures.md](structures.md)). It exists for all four races. Tiers I to IV are bought in order. Each needs a fort level and gold, and the tier is stored on the player.

| Race | Perk | What each tier adds |
| --- | --- | --- |
| Human | Discipline | Desertion falls to 75%, 60%, 45%, 30% of normal; the kingdom morale floor rises by 5 per tier |
| Elf | Sanctuary | A share of your fallen defenders return after a battle (5% to 12%), up to a daily cap of your army (2% to 3%); units return at their own level; captives are not counted |
| Goblin | Raiders | More units captured (12% to 18%, base 10%), a bigger dungeon (+25% to +100%), a bigger captor share of ransoms (55% to 70%, base 50%) |
| Undead | Necropolis | Both reanimation pools gain 1 to 4 percentage points, and the daily cap of the army rises from 2% (no tier) to between 2.5% and 4% |

Hallowed Ground comes free with every tier for Elf, Human and Goblin: it blocks a share of an Undead attacker's own-dead pool (20%, 35%, 50%, 65%). Undead do not get it.

Cost and fort level by tier: 1,000,000 / 4,000,000 / 12,000,000 / 30,000,000 gold at fort level 5 / 9 / 13 / 17. Goblins need fort level 13 / 15 / 17 / 19 instead.

The perks are used by [KingdomMorale.service.ts](../../src/services/KingdomMorale.service.ts), [Captives.service.ts](../../src/services/Captives.service.ts), [Reanimation.service.ts](../../src/services/Reanimation.service.ts) and [Sanctuary.service.ts](../../src/services/Sanctuary.service.ts). Captives and reanimation are in [reanimation-and-captives.md](reanimation-and-captives.md).

### What unlocks, by level

Player level matters directly in these places; everything else uses fort level or economy level.

| What | Rule |
| --- | --- |
| Fort levels | Fort level N needs player level 5 x (N - 1) up to Kingdom (fort 19, level 90): Village at 5, Town at 10. The last five forts step by 2, to Empire Level 3 at level 100 |
| Structure Upgrades menu | Player level 5 (the first fort level with a requirement) |
| New-player protection (see [protection.md](protection.md)) | Ends at level 10 by default (`era.protectionLevelLimit`), or earlier by days or population |
| Battle upgrades | Player level at least the upgrade's `minUnitLevel` (2) and the structure level 6 |
| Friend gold transfers | `friend.transferMinLevel` (default 5) and the Coal Mine economy upgrade |

Because feature unlocks use fort or economy levels, the lowest player level a feature can open at follows from the fort it needs: reanimation and the first racial tier at player level 20 (fort 5), the dungeon at 60 (fort 13), gold transfers at 50 (Coal Mine needs fort 11). The helper `getFeaturePlayerLevel` computes this for the UI.

## Why it works this way

- The level table starts at 0 XP: "level 1 starts at zero; 4000 was never a boundary" (comment in [XPLevels.tsx](../../src/constants/XPLevels.tsx)).
- XP per turn tapers gently because turns cap how fast anyone can earn XP (48 a day); a steep taper put level 100 out of reach, and balance-sim runs put the fastest players at about 30 to 34 months (comment on `calculateProgressionXpPerTurn`).
- Proficiency spend serializes on the user row so two requests cannot spend the same point (comment in `updateBonusPoints`).
- Total price bonus is clamped to 0-100 so a cost never goes negative (comment on `getPriceBonus`).
- Hallowed Ground is the answer to Undead reanimation for every other race (CHANGELOG "Racial upgrades").

## Admin and settings

- Administration, Users, Upgrades editor (Manage Users): proficiency levels (0 to 75 each), the offense, spy, sentry and armory structure levels, units, items and battle upgrades. The main user editor sets race, class, fort, housing and economy levels. No admin screen edits the racial tier.
- Administration, Events: `xpMultiplier`.
- Administration, System: Runtime Settings: `friend.transferMinLevel`, `era.protectionLevelLimit`.
- Administration, Balance simulator: runs balance simulations against the rules (see [era-progression-stress-test.md](../era-progression-stress-test.md)).

## Source

- [UserStatsService.ts](../../src/services/UserStatsService.ts)
- [Account.service.ts](../../src/services/Account.service.ts) (`updateBonusPoints`)
- [bonusPoints API](../../src/pages/api/account/bonusPoints.ts)
- [v5Combat.ts](../../src/utils/balance/v5Combat.ts) (`calculateBonusPointMultiplier`)
- [XPLevels.tsx](../../src/constants/XPLevels.tsx)
- [Bonuses.tsx](../../src/constants/Bonuses.tsx)
- [classBonuses.ts](../../src/utils/classBonuses.ts)
- [RacialPerks.ts](../../src/constants/RacialPerks.ts)
- [FeatureUnlocks.ts](../../src/constants/FeatureUnlocks.ts)
- [levelReachedAt.ts](../../src/utils/levelReachedAt.ts)
- [combatRulesets.ts](../../src/utils/balance/combatRulesets.ts) and [combat-v9 tables](../../src/utils/balance/combat-v9/tables.json)
- [Structure.service.ts](../../src/services/Structure.service.ts) (racial purchases)

## Tests

- [AccountService.rules.test.ts](../../src/services/__tests__/AccountService.rules.test.ts): the 75-point cap, refused decreases and the over-budget check.
- [UserStatsService.test.ts](../../src/services/__tests__/UserStatsService.test.ts): level and XP to next level, income bonus from proficiency, price bonus clamp.
- [AccountService.locks.test.ts](../../src/services/__tests__/AccountService.locks.test.ts): proficiency writes lock the row and re-check the balance.
- [levels.test.tsx](../../src/__tests__/pages/home/levels.test.tsx): Levels page controls.
- [levelReachedAt.test.ts](../../src/utils/levelReachedAt.test.ts): level change stamping and game days at level.
- [battleExperience.test.ts](../../src/utils/battleExperience.test.ts) and [battleXpFairness.test.ts](../../src/utils/battleXpFairness.test.ts): XP per turn taper and fairness.
- [RacialPerks.test.ts](../../src/constants/RacialPerks.test.ts): tier tuning for every perk.
- [racialPerks.test.ts](../../test/integration/racialPerks.test.ts): each perk in play, purchase rules, Hallowed and Sanctuary.
- [FeatureUnlocks.test.ts](../../src/constants/FeatureUnlocks.test.ts): unlock rules.

## Known gaps

- Race `incomeMultiplier` (Human 1.02, Goblin 1.05) and `citizenRecoveryMultiplier` (Goblin 1.05) exist in the ruleset tables but no code reads them. The Goblin `fortRepairCostMultiplier` is also unused.
- The ruleset `resurrection` block for the Undead (unlock level 5, attack and defense rates) is never read; the live reanimation rules come from [Reanimation.ts](../../src/constants/Reanimation.ts).
- Changing a player's race in the admin editor leaves their racial tier unchanged; the tier only takes effect for the race it was bought for.
