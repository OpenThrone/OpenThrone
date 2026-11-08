# Battle protection

Last verified against code: 2026-11-06 (alpha d59b12d9)

New kingdoms are protected for a while. Protection is a gold shield with softer battle damage, not immunity: other players can still attack you, kill units and damage your fort. It ends on its own as you grow.

## Rules

### Who is protected

One shared rule decides, used by battles, the daily morale pass, the target list and the sidebar meter. A player is protected until the first of these is true:

| Limit | Default | Setting |
|---|---|---|
| Level | Level 10 or higher ends protection | `era.protectionLevelLimit` (1 to 1000) |
| Population | Total population reaches the threshold below | `recruit.internalDailyCap`, `recruit.dailyCap` |
| Time | `durationDays` game days after you joined the era | `era.protectionDurationDays` (1 to 60) |

- Level comes from experience. The reason reported follows this order: level, then population, then time.
- Time runs from `era_joined_at`. For old rows without it, the later of the era start and the account's creation date is used. With no era known, only the level and population limits apply.
- Duration counts game days, so an accelerated server shortens it.
- The population threshold is:

```
starting citizens + days x (housing citizens per day + internal recruit cap + external recruit cap) + citizens received from events
```

  Starting citizens come from the era's saved start settings (50 by default). Housing citizens per day come from the player's housing level (1 per day at level 0). Recruit caps default to 250 internal and 25 external. With defaults and housing level 0 the threshold is 3,914 population. Citizens handed out by timed events raise the threshold by the same amount, so an event never ends protection by itself.
- Population is every unit and mercenary, citizens and workers included.
- Attacking never ends protection. An older database field recording a forfeiture is ignored.
- The status is recalculated each time it is read. It is not a one-way switch.
- Where no protection data is available (replays, simulators), a player counts as protected below level 10.

### What protection does in battle

When the defender is protected:

- **Damage is halved** before casualty budgeting (`PROTECTED_DAMAGE_MULTIPLIER` 0.5).
- **Losses are capped** at 1.5% of the population at the start of the battle, with a minimum of 1 (`PROTECTED_LOSS_CAP_SHARE`). This is on top of the normal casualty budget.
- **Gold is shielded.** Only the first 100,000 gold on hand is shielded (`PROTECTED_GOLD_ALLOWANCE`). Raiders take a cap share of that slice multiplied by 0.1 at level 1, rising in a straight line to 1.0 at level 10 (`PROTECTED_LOOT_MULTIPLIER`, `PROTECTION_TAPER_END_LEVEL`). Gold above 100,000 is raided at the normal rate, and below level 10 it pays 80% (`PROTECTED_LEVEL_LOOT_FACTOR`).
- **Daily gold ceiling.** All attackers together may take at most 50% of a protected defender's start-of-day gold per game day (`DAILY_GOLD_PILLAGE_SHARE_CAP`). An unprotected defender has no daily ceiling.
- **No morale change in battle.** The defender's kingdom morale does not move (see [morale.md](morale.md)).
- **No battle side effects.** No dungeon captives are taken, no Undead reanimation runs, and no Elf Sanctuary recovery runs against a protected defender.
- **Fort and units still take damage.** A won assault still removes fort hit points and kills units, within the caps above.

The protected status used is the one at battle time, saved in the battle log as `defender_protected` with the reason, end time, level and population numbers.

### What protection does elsewhere

- The daily morale pass skips protected players, so they take no inactivity decay and no desertion.
- A protected player cannot receive defectors.
- Protection does not affect spy missions. See [spying.md](spying.md).
- Protected players can attack each other and anyone else.
- The player's own status is served to the client with the user data and drives the sidebar meter. The meter shows the limit that is furthest along (time, population or level).

### Other ways to be off the battlefield

These are not protection, but they stop attacks and spy missions entirely: account status vacation, closed, banned, suspended, timed out or resetting. A target who has not been active since the current era began also cannot be attacked.

## Why it works this way

- The rework made protection last a number of days per era, end earlier at a population cap or level 10, and show a sidebar meter (CHANGELOG v0.3.0). Attacking used to forfeit it; that rule is gone (`battleProtection.ts`).
- Event citizens raise the population limit so an admin event never ends protection by itself (issue #89, `battleProtection.ts`).
- The population threshold is a housing and recruiting estimate of what a player can gain per day, so growth faster than that ends protection (issue #97, `battleProtection.ts`).
- The shield is limited to a gold allowance so a hoard cannot hide behind protection (`attackFunctions.ts`).
- The shield tapers with level and is the only part that scales with level, so the level ramp does not stack on it (`attackFunctions.ts`).
- Damage against protected defenders is halved because the old floored 10% was replaced (`v5Combat.ts` comment: "was a floored 10%").
- Protected players get a hard per-battle loss cap instead of a damage floor, so attacks still visibly land but never gut a starting army (`attackFunctions.ts`).

## Admin and settings

- Runtime Settings (`/home/admin/settings`): `era.protectionDurationDays` (default 14, hidden from the public config), `era.protectionLevelLimit` (default 10), `recruit.internalDailyCap` (default 250), `recruit.dailyCap` (external, default 25).
- Starting citizens come from the era's start settings (Administration, Eras).
- The gold shield numbers, damage multiplier and loss cap are code constants in `v5Combat.ts` inside the combat ruleset. Changing one means a new ruleset version.

## Source

- [battleProtection.ts](../../src/utils/battleProtection.ts): the shared rule, threshold, shield facts, progress
- [BattleProtection.service.ts](../../src/services/BattleProtection.service.ts): loads the era and settings
- [BattleUser.ts](../../src/models/BattleUser.ts): `isProtected` for battles
- [AttackService.ts](../../src/services/AttackService.ts): applies protection to damage, gold, morale and aftermath
- [attackFunctions.ts](../../src/utils/attackFunctions.ts): loss cap, shield split, loot, damage multiplier
- [v5Combat.ts](../../src/utils/balance/v5Combat.ts): protection constants
- [KingdomMorale.service.ts](../../src/services/KingdomMorale.service.ts): morale exemption
- [General.service.ts](../../src/services/General.service.ts): status served to the client
- [AttackValidationService.ts](../../src/services/AttackValidationService.ts): untargetable account statuses
- [runtimeSettings.ts](../../src/constants/runtimeSettings.ts): adjustable values

## Tests

- [attackFunctions.test.ts](../../src/utils/attackFunctions.test.ts): protected defenders take halved damage.
- [battleProtection.test.ts](../../src/utils/battleProtection.test.ts): each limit, event citizens, legacy rows, accelerated days, threshold formula
- [BattleProtection.service.test.ts](../../src/services/BattleProtection.service.test.ts): internal plus external recruit caps in the threshold
- [attackFunctions.goldPillage.test.ts](../../src/utils/attackFunctions.goldPillage.test.ts): shield allowance, taper from 0.1 to 1.0, 80% exposed rate
- [combatInvariants.property.test.ts](../../src/utils/combatInvariants.property.test.ts): protected loss cap
- [AttackService.test.ts](../../src/services/__tests__/AttackService.test.ts): a protected attacker keeps protection
- [kingdomMorale.test.ts](../../test/integration/kingdomMorale.test.ts): protected defenders are exempt from battle morale and daily decay
- [targetAvailability.test.ts](../../src/services/__tests__/targetAvailability.test.ts): untargetable statuses

## Known gaps

- Population is counted two ways. Battles count units plus mercenaries. The target list and the sidebar summary add up every unit row. The daily morale pass and the defector check count only non-mercenary rows. A player near the population threshold with mercenaries can read as protected in one place and not another.
- No test pins the "no captives, reanimation or Sanctuary against protected defenders" rule directly.
- Because the status is recalculated, losing population can put a player back under the threshold and protect them again. No test or comment says whether that is intended.
- There is no new-player "sanctuary". In code, `Sanctuary` is the Elf racial upgrade that recovers some fallen defenders (`Sanctuary.service.ts`).
- `how-to-play` and the player FAQ say protection ends "at level 10"; the level is an adjustable setting, though the Your First Kingdom guide reads it live.
