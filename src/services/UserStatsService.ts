import { getLevelFromXP } from '@/utils/utilities';
import { stringifyObj } from '@/utils/numberFormatting';
import { z } from 'zod';
import type {
  PlayerBonus,
  UnitType,
  FortHealth,
} from '@/types/typings';
import {
  UserUnit,
  UserItem,
  UserBattleUpgrade,
  UserStructureUpgrade,
  UserBonusPoints,
} from '@prisma/client';
import type { ItemType } from '@/types/typings';
import { CalculatedStrength, DetailedCalculatedStrength } from '@/utils/attackFunctions';

interface ArmyStatBreakdown {
  total: number;
  units: Array<{
    name: string;
    quantity: number;
    bonus: number;
    subtotal: number;
  }>;
  items: Array<{
    name: string;
    quantity: number;
    bonus: number;
    subtotal: number;
  }>;
  battleUpgrades: Array<{
    name: string;
    quantity: number;
    bonus: number;
    subtotal: number;
  }>;
  bonuses: Array<{
    name: string;
    percent: number;
    appliedTo: number;
    bonusAmount: number;
  }>;
  finalTotal: number;
}

import {
  BattleUpgrades,
  Bonuses,
  Fortifications,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
  UnitTypes,
  ItemTypes,
  levelXPArray,
} from '../constants';

const UserDataSchema = z.object({
  experience: z.number().optional(),
  units: z.array(z.any()).optional(),
  items: z.array(z.any()).optional(),
  bonus_points: z.array(z.any()).optional(),
  structure_upgrades: z.array(z.any()).optional(),
  battle_upgrades: z.array(z.any()).optional(),
  fortLevel: z.number().optional(),
  fortHitpoints: z.number().optional(),
  race: z.string().optional(),
  class: z.string().optional(),
});

export class UserStatsService {
  private experience: number;
  private units: UserUnit[];
  private items: UserItem[];
  private bonus_points: UserBonusPoints[];
  private structure_upgrades: UserStructureUpgrade[];
  private battle_upgrades: UserBattleUpgrade[];
  private fortLevel: number;
  private fortHitpoints: number;
  private race: string;
  private class: string;

  constructor(userData: {
    experience?: number;
    units?: UserUnit[];
    items?: UserItem[];
    bonus_points?: UserBonusPoints[];
    structure_upgrades?: UserStructureUpgrade[];
    battle_upgrades?: UserBattleUpgrade[];
    fortLevel?: number;
    fortHitpoints?: number;
    race?: string;
    class?: string;
  } = {}) {
    const validatedData = UserDataSchema.parse(userData);
    this.experience = validatedData.experience ?? 0;
    this.units = Array.isArray(validatedData.units) ? validatedData.units : [];
    this.items = Array.isArray(validatedData.items) ? validatedData.items : [];
    this.bonus_points = Array.isArray(validatedData.bonus_points) ? validatedData.bonus_points : [];
    this.structure_upgrades = Array.isArray(validatedData.structure_upgrades) ? validatedData.structure_upgrades : [];
    this.battle_upgrades = Array.isArray(validatedData.battle_upgrades) ? validatedData.battle_upgrades : [];
    this.fortLevel = validatedData.fortLevel ?? 0;
    this.fortHitpoints = validatedData.fortHitpoints ?? 0;
    this.race = validatedData.race ?? 'ELF';
    this.class = validatedData.class ?? 'ASSASSIN';
  }

  calculateLevel(): number {
    return getLevelFromXP(this.experience);
  }

  xpRequiredForLevel(level: number): number {
    const levelInfo = levelXPArray.find(l => l.level === level);
    return levelInfo?.xp ?? Infinity;
  }

  xpToNextLevel(): number {
    const nextLevelXP = this.xpRequiredForLevel(this.calculateLevel() + 1);
    return nextLevelXP === Infinity ? 0 : Math.max(0, nextLevelXP - this.experience);
  }

  getPlayerBonuses(): PlayerBonus[] {
    return Bonuses.filter(
      (bonus) => bonus.race === this.race || bonus.race === this.class
    );
  }

  getIncomeBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'INCOME')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'INCOME')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    return baseBonus + pointsBonus;
  }

  getAttackBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'OFFENSE')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'OFFENSE')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    const structureBonus = this.structure_upgrades
      .filter(upgrade => upgrade.type === 'OFFENSE')
      .map(upgrade => OffensiveUpgrades.find(u => u.level === upgrade.level)?.offenseBonusPercentage ?? 0)
      .reduce((sum, bonus) => sum + bonus, 0);

    return baseBonus + pointsBonus + structureBonus;
  }

  getDefenseBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'DEFENSE')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'DEFENSE')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    const fortBonus = Fortifications.find(f => f.level === this.fortLevel)?.defenseBonusPercentage ?? 0;

    return baseBonus + pointsBonus + fortBonus;
  }

  getIntelBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'INTEL')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'INTEL')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    return baseBonus + pointsBonus;
  }

  getSpyBonus(): number {
    const spyLevel = this.getSpyLevel();
    const structureBonus = SpyUpgrades.find(u => u.level === spyLevel)?.offenseBonusPercentage ?? 0;
    return structureBonus + this.getIntelBonus();
  }

  getSentryBonus(): number {
    const sentryLevel = this.getSentryLevel();
    const structureBonus = SentryUpgrades.find(u => u.level === sentryLevel)?.defenseBonusPercentage ?? 0;
    return structureBonus + this.getIntelBonus();
  }

  getCasualtyBonus(): number {
    return this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'CASUALTY')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);
  }

  getPriceBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'PRICES')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'PRICES')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    return baseBonus + pointsBonus;
  }

  getAvailableProficiencyPoints(): number {
    return Math.max(0, this.calculateLevel() - this.getUsedProficiencyPoints());
  }

  getUsedProficiencyPoints(): number {
    return this.bonus_points.reduce((acc, bonus) => acc + (bonus.level || 0), 0);
  }

  calculateArmyStat(type: UnitType): DetailedCalculatedStrength {
    const sortedItems = this.getSortedItems(type);
    const sortedUnits = this.getSortedUnits(type);

    const baseStats = this.calculateUnitStats(sortedUnits, type);
    const itemStats = this.calculateItemStats(sortedItems, sortedUnits);
    const upgradeStats = this.calculateBattleUpgradeStats(sortedUnits, type);

    const combinedStats: CalculatedStrength = {
      MeleeAtkPower: baseStats.MeleeAtkPower + itemStats.MeleeAtkPower + upgradeStats.MeleeAtkPower,
      MeleeDefPower: baseStats.MeleeDefPower + itemStats.MeleeDefPower + upgradeStats.MeleeDefPower,
      RangedAtkPower: baseStats.RangedAtkPower + itemStats.RangedAtkPower + upgradeStats.RangedAtkPower,
      RangedDefPower: baseStats.RangedDefPower + itemStats.RangedDefPower + upgradeStats.RangedDefPower,
    };

    if (process.env.DEBUG_USER_STATS) {
      console.log(`[UserStats] calculateArmyStat type=${type} BASE=${JSON.stringify(baseStats)} ITEMS=${JSON.stringify(itemStats)} UPGRADES=${JSON.stringify(upgradeStats)} COMBINED=${JSON.stringify(combinedStats)}`);
    }

    const totalStats = this.applyBonuses(type, combinedStats);

    return {
      baseStats,
      itemStats,
      upgradeStats,
      totalStats,
    };
  }

  updateStats(): { offense: DetailedCalculatedStrength; defense: DetailedCalculatedStrength; spy: DetailedCalculatedStrength; sentry: DetailedCalculatedStrength } {
    return {
      offense: this.calculateArmyStat('OFFENSE'),
      defense: this.calculateArmyStat('DEFENSE'),
      spy: this.calculateArmyStat('SPY'),
      sentry: this.calculateArmyStat('SENTRY'),
    };
  }

  getFortHealth(): FortHealth {
    const maxHP = Fortifications.find(f => f.level === this.fortLevel)?.hitpoints ?? 0;
    const currentHP = this.fortHitpoints ?? 0;
    return {
      current: currentHP,
      max: maxHP,
      percentage: maxHP > 0 ? Math.floor((currentHP / maxHP) * 100) : 0,
    };
  }

  private getSortedItems(type: UnitType): UserItem[] {
    return JSON.parse(JSON.stringify(
      this.items.filter(item => item.usage === type).sort((a, b) => b.level - a.level)
    ));
  }

  private getSortedUnits(type: UnitType): UserUnit[] {
    return JSON.parse(JSON.stringify(
      this.units.filter(unit => unit.type === type).sort((a, b) => b.level - a.level)
    ));
  }

  private calculateUnitStats(sortedUnits: UserUnit[], requestedType?: string): CalculatedStrength {
    const stats: CalculatedStrength = { MeleeAtkPower: 0, MeleeDefPower: 0, RangedAtkPower: 0, RangedDefPower: 0 };

    sortedUnits.forEach(unit => {
      const unitInfo = UnitTypes.find(u => u.type === unit.type && u.level === unit.level);
      if (unitInfo) {
        const q = unit.quantity ?? 0;
        const ma = (unitInfo.MeleeAtkPower || 0) * q;
        const md = (unitInfo.MeleeDefPower || 0) * q;
        const ra = (unitInfo.RangedAtkPower || 0) * q;
        const rd = (unitInfo.RangedDefPower || 0) * q;

        stats.MeleeAtkPower += ma;
        stats.MeleeDefPower += md;
        stats.RangedAtkPower += ra;
        stats.RangedDefPower += rd;

        if (process.env.DEBUG_USER_STATS) {
          console.log(`[UserStats] unit ${unit.type}@${unit.level} x${q} => MA:${ma} MD:${md} RA:${ra} RD:${rd}`);
        }
      }
    });

    // Include mercenaries in unit stats calculation
    // Mercenaries are already included in sortedUnits when present with isMercenary flag,
    // so additional separate processing would double-count them. No-op here.

    // Handle citizen/worker contribution for defense/sentry if no dedicated units
    if ((requestedType === 'DEFENSE' || requestedType === 'SENTRY') && stats.MeleeDefPower === 0 && stats.RangedDefPower === 0) {
      this.units
        .filter(u => u.type === 'CITIZEN' || u.type === 'WORKER')
        .forEach(unit => {
          const info = UnitTypes.find(t => t.type === unit.type && t.level === unit.level);
          if (info) {
            // Apply a small effectiveness multiplier for collateral units
            const effectiveness = 0.1;
            const q = unit.quantity ?? 0;
            const md = (info.MeleeDefPower || 0) * q * effectiveness;
            const rd = (info.RangedDefPower || 0) * q * effectiveness;
            stats.MeleeDefPower += md;
            stats.RangedDefPower += rd;
            if (process.env.DEBUG_USER_STATS) {
              console.log(`[UserStats] collateral ${unit.type}@${unit.level} x${q} (eff=${effectiveness}) => MD:${md} RD:${rd}`);
            }
          }
        });
    }

    return stats;
  }

  private calculateItemStats(sortedItems: UserItem[], sortedUnits: UserUnit[]): CalculatedStrength {
    const stats: CalculatedStrength = { MeleeAtkPower: 0, MeleeDefPower: 0, RangedAtkPower: 0, RangedDefPower: 0 };
    const itemCoverage: Map<string, number> = new Map(); // Track how many of each item type (by ID) have been "used"

    // Process regular units
    sortedUnits.forEach(unit => {
      if (unit.quantity <= 0) return;

      const equippedItemTypes: Set<ItemType> = new Set(); // Track equipped item types for this unit
      
      // Filter items usable by this unit and sort by level (highest first)
      const usableItems = sortedItems
        .filter(item => item.usage === unit.type && item.level <= unit.level)
        .sort((a, b) => b.level - a.level);

      usableItems.forEach(item => {
        const itemInfo = ItemTypes.find(i => i.id === String(item.id)); // Find by unique ID, cast to string
        if (!itemInfo || equippedItemTypes.has(item.type)) return; // Only one of each item type (WEAPON, HELM, etc.) per unit

        const currentCoverage = itemCoverage.get(String(item.id)) || 0; // Cast to string
        const availableItemQuantity = item.quantity - currentCoverage;

        if (availableItemQuantity > 0) {
          // Apply item stats for one unit
          const ma = (itemInfo.MeleeAtkPower || 0);
          const md = (itemInfo.MeleeDefPower || 0);
          const ra = (itemInfo.RangedAtkPower || 0);
          const rd = (itemInfo.RangedDefPower || 0);

          stats.MeleeAtkPower += ma;
          stats.MeleeDefPower += md;
          stats.RangedAtkPower += ra;
          stats.RangedDefPower += rd;

          if (process.env.DEBUG_USER_STATS) {
            console.log(`[UserStats] item ${item.type} (id=${item.id}, lvl=${item.level}) applied => MA:${ma} MD:${md} RA:${ra} RD:${rd}`);
          }

          itemCoverage.set(String(item.id), currentCoverage + 1); // Cast to string
          equippedItemTypes.add(item.type);
        }
      });
    });

    // Mercenaries are accounted for in sortedUnits; item allocation will already
    // have been handled in the regular unit processing above. No-op here.

    return stats;
  }

  private calculateBattleUpgradeStats(sortedUnits: UserUnit[], type: UnitType): CalculatedStrength {
    const stats: CalculatedStrength = { MeleeAtkPower: 0, MeleeDefPower: 0, RangedAtkPower: 0, RangedDefPower: 0 };
    const upgradeCoverage: Map<string, number> = new Map(); // Track how many units each upgrade has covered

    const applicableUpgrades = this.battle_upgrades
      .filter(up => up.type === type)
      .sort((a, b) => b.level - a.level);

    if (process.env.DEBUG_USER_STATS) {
      console.log(`[UserStats] calculateBattleUpgradeStats type=${type} sortedUnits=${sortedUnits.length} applicableUpgrades=${applicableUpgrades.length}`);
      console.log(`[UserStats] battle_upgrades sample: ${JSON.stringify(applicableUpgrades.slice(0,5))}`);
      console.log(`[UserStats] sortedUnits sample: ${JSON.stringify(sortedUnits.slice(0,5))}`);
    }

    // Determine the player's siege level (ability to use battle upgrades).
    // Siege level is represented by the player's OFFENSE structure upgrade level.
    const siegeLevel = this.structure_upgrades.find(s => s.type === 'OFFENSE')?.level ?? 0;
    if (process.env.DEBUG_USER_STATS) {
      console.log(`[UserStats] siegeLevel=${siegeLevel}`);
    }

    // Temporary safety gate: battle-upgrade math is complex and under active
    // development. Allow disabling it entirely via env so we can iterate and
    // keep the test-suite stable.
    if (process.env.ENABLE_BATTLE_UPGRADES === '0') {
      if (process.env.DEBUG_USER_STATS) {
        console.log('[UserStats] battle upgrades are disabled via ENABLE_BATTLE_UPGRADES env flag; skipping computation');
      }
      return stats;
    }

    // Process regular units using an aggregate per-upgrade distribution strategy.
    // For each upgrade level, compute total upgrade "stat pool" (upgrade.quantity * upgradeInfo.*)
    // and scale it by how many matching units exist relative to the upgrade's total coverage capacity.
    applicableUpgrades.forEach(upgrade => {
      const upgradeInfo = BattleUpgrades.find(bu => bu.type === upgrade.type && bu.level === upgrade.level);
      if (!upgradeInfo || upgrade.quantity <= 0) return;
      // Skip upgrades that are not yet unlocked by the player's siege level
      if (upgradeInfo.SiegeUpgradeLevel && siegeLevel < upgradeInfo.SiegeUpgradeLevel) {
        if (process.env.DEBUG_USER_STATS) {
          console.log(`[UserStats] skipping upgrade ${upgrade.type}@${upgrade.level} (requires siege ${upgradeInfo.SiegeUpgradeLevel}, player siege ${siegeLevel})`);
        }
        return;
      }

      // Total number of units this upgrade set can cover
      const totalUpgradeUnitCapacity = (upgrade.quantity || 0) * (upgradeInfo.unitsCovered || 1);

      // Total number of matching units present (respecting minUnitLevel)
      const totalMatchingUnits = sortedUnits
        .filter(u => u.level >= (upgradeInfo.minUnitLevel || 0))
        .reduce((sum, u) => sum + (u.quantity || 0), 0);

      if (totalMatchingUnits <= 0 || totalUpgradeUnitCapacity <= 0) {
        if (process.env.DEBUG_USER_STATS) {
          console.log(`[UserStats] upgrade ${upgrade.type}@${upgrade.level} has no matching units or zero capacity`);
        }
        return;
      }

      // Units actually covered is the lesser of units present and capacity
      const unitsCovered = Math.min(totalMatchingUnits, totalUpgradeUnitCapacity);

      // Apply per-equipped-unit semantics: each equipped unit receives the upgrade's stat bonuses
      // Stats in BattleUpgrades are defined as the TOTAL stats for the full coverage.
      // So we divide by unitsCovered to get per-unit stats.
      const coveragePerUpgrade = upgradeInfo.unitsCovered || 1;
      const appliedMeleeAtk = ((upgradeInfo.MeleeAtkPower || 0) / coveragePerUpgrade) * unitsCovered;
      const appliedMeleeDef = ((upgradeInfo.MeleeDefPower || 0) / coveragePerUpgrade) * unitsCovered;
      const appliedRangedAtk = ((upgradeInfo.RangedAtkPower || 0) / coveragePerUpgrade) * unitsCovered;
      const appliedRangedDef = ((upgradeInfo.RangedDefPower || 0) / coveragePerUpgrade) * unitsCovered;

      stats.MeleeAtkPower += appliedMeleeAtk;
      stats.MeleeDefPower += appliedMeleeDef;
      stats.RangedAtkPower += appliedRangedAtk;
      stats.RangedDefPower += appliedRangedDef;

      if (process.env.DEBUG_USER_STATS) {
        console.log(`[UserStats] upgrade ${upgrade.type}@${upgrade.level} qty=${upgrade.quantity} capacity=${totalUpgradeUnitCapacity} matchingUnits=${totalMatchingUnits} covered=${unitsCovered} => +MA:${appliedMeleeAtk} MD:${appliedMeleeDef} RA:${appliedRangedAtk} RD:${appliedRangedDef}`);
      }
    });

    // Mercenaries are included in `sortedUnits` (they have isMercenary flag),
    // so any upgrade coverage applied above to `sortedUnits` already accounts
    // for mercenaries. Having a separate mercenary pass would double-count.

    return stats;
  }

  private applyBonuses(type: UnitType, currentStats: CalculatedStrength): CalculatedStrength {
    let bonusPercent = 0;
    switch (type) {
      case 'OFFENSE': bonusPercent = this.getAttackBonus(); break;
      case 'DEFENSE': bonusPercent = this.getDefenseBonus(); break;
      case 'SPY': bonusPercent = this.getSpyBonus(); break;
      case 'SENTRY': bonusPercent = this.getSentryBonus(); break;
    }
    const multiplier = (1 + bonusPercent / 100);
    return {
      MeleeAtkPower: Math.ceil(currentStats.MeleeAtkPower * multiplier),
      MeleeDefPower: Math.ceil(currentStats.MeleeDefPower * multiplier),
      RangedAtkPower: Math.ceil(currentStats.RangedAtkPower * multiplier),
      RangedDefPower: Math.ceil(currentStats.RangedDefPower * multiplier),
    };
  }

  private getSpyLevel(): number {
    return this.structure_upgrades.find(s => s.type === 'SPY')?.level ?? 0;
  }

  private getSentryLevel(): number {
    return this.structure_upgrades.find(s => s.type === 'SENTRY')?.level ?? 0;
  }
}