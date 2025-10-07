import { getLevelFromXP } from '@/utils/utilities';
import { stringifyObj } from '@/utils/numberFormatting';
import type {
  PlayerBonus,
  PlayerUnit,
  PlayerItem,
  PlayerBattleUpgrade,
  StructureUpgrade,
  PlayerStat,
  UnitType,
  BonusPointsItem,
  FortHealth,
} from '@/types/typings';

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

export class UserStatsService {
  private experience: number;
  private units: PlayerUnit[];
  private items: PlayerItem[];
  private bonus_points: BonusPointsItem[];
  private structure_upgrades: StructureUpgrade[];
  private battle_upgrades: PlayerBattleUpgrade[];
  private stats: PlayerStat[];
  private fortLevel: number;
  private fortHitpoints: number;
  private race: string;
  private class: string;

  constructor(userData: {
    experience?: number;
    units?: PlayerUnit[];
    items?: PlayerItem[];
    bonus_points?: BonusPointsItem[];
    structure_upgrades?: StructureUpgrade[];
    battle_upgrades?: PlayerBattleUpgrade[];
    stats?: PlayerStat[];
    fortLevel?: number;
    fortHitpoints?: number;
    race?: string;
    class?: string;
  } = {}) {
    this.experience = userData.experience ?? 0;
    this.units = Array.isArray(userData.units) ? userData.units : [];
    this.items = Array.isArray(userData.items) ? userData.items : [];
    this.bonus_points = Array.isArray(userData.bonus_points) ? userData.bonus_points : [];
    this.structure_upgrades = Array.isArray(userData.structure_upgrades) ? userData.structure_upgrades : [];
    this.battle_upgrades = Array.isArray(userData.battle_upgrades) ? userData.battle_upgrades : [];
    this.stats = Array.isArray(userData.stats) ? userData.stats : [];
    this.fortLevel = userData.fortLevel ?? 0;
    this.fortHitpoints = userData.fortHitpoints ?? 0;
    this.race = userData.race ?? 'ELF';
    this.class = userData.class ?? 'ASSASSIN';
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

  statistics(type: PlayerStat['type'], subType: string): number {
    if (!this.stats) return 0;
    const statValue = this.stats.find(stat => stat.type === type && stat.subtype === subType)?.stat;
    return typeof statValue === 'number' ? statValue : 0;
  }

  getAttacksWon(): number {
    return this.statistics('OFFENSE', 'WON');
  }

  getDefendsWon(): number {
    return this.statistics('DEFENSE', 'WON');
  }

  calculateArmyStat(type: UnitType): number {
    const sortedItems = this.getSortedItems(type);
    const sortedUnits = this.getSortedUnits(type);
    let totalStat = 0;
    const unitCoverage = new Map<number, number>();

    totalStat += this.calculateUnitStats(sortedUnits, type);
    totalStat += this.calculateItemStats(sortedItems, sortedUnits, unitCoverage);
    totalStat += this.calculateBattleUpgradeStats(sortedUnits, type, unitCoverage);

    totalStat = this.applyBonuses(type, totalStat);
    return Math.ceil(totalStat);
  }

  getArmyStatBreakdown(type: UnitType): ArmyStatBreakdown {
    const sortedItems = this.getSortedItems(type);
    const sortedUnits = this.getSortedUnits(type);
    let totalStat = 0;
    const unitCoverage = new Map<number, number>();

    // Units
    const unitsBreakdown = sortedUnits.map(unit => {
      const unitInfo = UnitTypes.find(u => u.type === unit.type && u.level === unit.level);
      const bonus = unitInfo?.bonus ?? 0;
      const subtotal = bonus * (unit.quantity ?? 0);
      return {
        name: unitInfo?.name || `${unit.type} L${unit.level}`,
        quantity: unit.quantity ?? 0,
        bonus,
        subtotal,
      };
    });
    const unitsTotal = unitsBreakdown.reduce((sum, u) => sum + u.subtotal, 0);

    // Items
    const itemsBreakdown: ArmyStatBreakdown['items'] = [];
    const itemCountsByTypeLevel: { [itemType: string]: { [level: number]: number } } = {};
    sortedUnits.forEach((unit, unitIndex) => {
      if (unit.quantity <= 0) return;
      const unitCurrentCoverage = unitCoverage.get(unitIndex) || 0;
      let unitNeedsCoverage = unit.quantity - unitCurrentCoverage;
      if (unitNeedsCoverage <= 0) return;

      const itemTypesForUsage = Array.from(
        new Set(sortedItems.filter(item => item.usage === unit.type).map(item => item.type))
      );
      itemTypesForUsage.forEach(itemType => {
        let unitsLeftForType = unitNeedsCoverage;
        const itemsOfType = sortedItems
          .filter(item => item.usage === unit.type && item.type === itemType)
          .sort((a, b) => b.level - a.level);
        itemsOfType.forEach(item => {
          if (unitsLeftForType <= 0) return;
          const itemInfo = ItemTypes.find(
            w => w.level === item.level && w.usage === item.usage && w.type === item.type
          );
          if (!itemInfo) return;
          if (!itemCountsByTypeLevel[item.type]) itemCountsByTypeLevel[item.type] = {};
          if (!itemCountsByTypeLevel[item.type][item.level]) itemCountsByTypeLevel[item.type][item.level] = 0;
          const availableItemQuantity = item.quantity - itemCountsByTypeLevel[item.type][item.level];
          if (availableItemQuantity <= 0) return;
          const quantityToApply = Math.min(unitsLeftForType, availableItemQuantity);
          itemsBreakdown.push({
            name: itemInfo.name,
            quantity: quantityToApply,
            bonus: itemInfo.bonus ?? 0,
            subtotal: (itemInfo.bonus ?? 0) * quantityToApply,
          });
          itemCountsByTypeLevel[item.type][item.level] += quantityToApply;
          unitsLeftForType -= quantityToApply;
        });
      });
      unitCoverage.set(unitIndex, unit.quantity - unitNeedsCoverage);
    });
    const itemsTotal = itemsBreakdown.reduce((sum, i) => sum + i.subtotal, 0);

    // Battle Upgrades
    const battleUpgradesBreakdown: ArmyStatBreakdown['battleUpgrades'] = [];
    const applicableUpgrades = this.battle_upgrades
      .filter(up => up.type === type)
      .sort((a, b) => b.level - a.level);

    applicableUpgrades.forEach(upgrade => {
      const upgradeInfo = BattleUpgrades.find(
        bu => bu.type === upgrade.type && bu.level === upgrade.level
      );
      if (!upgradeInfo || upgrade.quantity <= 0) return;
      let remainingUpgradeQuantity = upgrade.quantity;
      sortedUnits.forEach((unit, unitIndex) => {
        if (remainingUpgradeQuantity <= 0) return;
        if (unit.quantity <= 0 || unit.level < upgradeInfo.minUnitLevel) return;
        const unitCurrentCoverage = unitCoverage.get(unitIndex) || 0;
        const unitNeedsCoverage = unit.quantity - unitCurrentCoverage;
        if (unitNeedsCoverage <= 0) return;
        const maxUnitsUpgradeable = remainingUpgradeQuantity * upgradeInfo.unitsCovered;
        const unitsToUpgrade = Math.min(unitNeedsCoverage, maxUnitsUpgradeable);
        if (unitsToUpgrade > 0) {
          battleUpgradesBreakdown.push({
            name: upgradeInfo.name,
            quantity: unitsToUpgrade,
            bonus: upgradeInfo.bonus ?? 0,
            subtotal: (upgradeInfo.bonus ?? 0) * unitsToUpgrade,
          });
          unitCoverage.set(unitIndex, unitCurrentCoverage + unitsToUpgrade);
          remainingUpgradeQuantity -= Math.ceil(unitsToUpgrade / upgradeInfo.unitsCovered);
        }
      });
    });
    const battleUpgradesTotal = battleUpgradesBreakdown.reduce((sum, b) => sum + b.subtotal, 0);

    // Bonuses
    let bonusPercent = 0;
    let bonusSources: ArmyStatBreakdown['bonuses'] = [];
    switch (type) {
      case 'OFFENSE':
        bonusPercent = this.getAttackBonus();
        bonusSources = [
          ...this.getPlayerBonuses()
            .filter(b => b.bonusType === 'OFFENSE')
            .map(b => ({
              name: b.bonusType,
              percent: b.bonusAmount ?? 0,
              appliedTo: unitsTotal + itemsTotal + battleUpgradesTotal,
              bonusAmount: ((b.bonusAmount ?? 0) / 100) * (unitsTotal + itemsTotal + battleUpgradesTotal),
            })),
          ...this.bonus_points
            .filter(b => b.type === 'OFFENSE')
            .map(b => ({
              name: b.type,
              percent: b.level ?? 0,
              appliedTo: unitsTotal + itemsTotal + battleUpgradesTotal,
              bonusAmount: ((b.level ?? 0) / 100) * (unitsTotal + itemsTotal + battleUpgradesTotal),
            })),
        ];
        break;
      case 'DEFENSE':
        bonusPercent = this.getDefenseBonus();
        bonusSources = [
          ...this.getPlayerBonuses()
            .filter(b => b.bonusType === 'DEFENSE')
            .map(b => ({
              name: b.bonusType,
              percent: b.bonusAmount ?? 0,
              appliedTo: unitsTotal + itemsTotal + battleUpgradesTotal,
              bonusAmount: ((b.bonusAmount ?? 0) / 100) * (unitsTotal + itemsTotal + battleUpgradesTotal),
            })),
          ...this.bonus_points
            .filter(b => b.type === 'DEFENSE')
            .map(b => ({
              name: b.type,
              percent: b.level ?? 0,
              appliedTo: unitsTotal + itemsTotal + battleUpgradesTotal,
              bonusAmount: ((b.level ?? 0) / 100) * (unitsTotal + itemsTotal + battleUpgradesTotal),
            })),
        ];
        break;
      case 'SPY':
        bonusPercent = this.getSpyBonus();
        bonusSources = [
          ...this.getPlayerBonuses()
            .filter(b => b.bonusType === 'INTEL')
            .map(b => ({
              name: b.bonusType,
              percent: b.bonusAmount ?? 0,
              appliedTo: unitsTotal + itemsTotal + battleUpgradesTotal,
              bonusAmount: ((b.bonusAmount ?? 0) / 100) * (unitsTotal + itemsTotal + battleUpgradesTotal),
            })),
          ...this.bonus_points
            .filter(b => b.type === 'INTEL')
            .map(b => ({
              name: b.type,
              percent: b.level ?? 0,
              appliedTo: unitsTotal + itemsTotal + battleUpgradesTotal,
              bonusAmount: ((b.level ?? 0) / 100) * (unitsTotal + itemsTotal + battleUpgradesTotal),
            })),
        ];
        break;
      case 'SENTRY':
        bonusPercent = this.getSentryBonus();
        bonusSources = [
          ...this.getPlayerBonuses()
            .filter(b => b.bonusType === 'INTEL')
            .map(b => ({
              name: b.bonusType,
              percent: b.bonusAmount ?? 0,
              appliedTo: unitsTotal + itemsTotal + battleUpgradesTotal,
              bonusAmount: ((b.bonusAmount ?? 0) / 100) * (unitsTotal + itemsTotal + battleUpgradesTotal),
            })),
          ...this.bonus_points
            .filter(b => b.type === 'INTEL')
            .map(b => ({
              name: b.type,
              percent: b.level ?? 0,
              appliedTo: unitsTotal + itemsTotal + battleUpgradesTotal,
              bonusAmount: ((b.level ?? 0) / 100) * (unitsTotal + itemsTotal + battleUpgradesTotal),
            })),
        ];
        break;
    }
    const preBonusTotal = unitsTotal + itemsTotal + battleUpgradesTotal;
    const bonusAmount = preBonusTotal * (bonusPercent / 100);
    const finalTotal = preBonusTotal + bonusAmount;

    return {
      total: preBonusTotal,
      units: unitsBreakdown,
      items: itemsBreakdown,
      battleUpgrades: battleUpgradesBreakdown,
      bonuses: bonusSources,
      finalTotal: Math.ceil(finalTotal),
    };
  }

  updateStats(): { offense: number; defense: number; spy: number; sentry: number } {
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

  private getSortedItems(type: UnitType): PlayerItem[] {
    return JSON.parse(JSON.stringify(
      this.items.filter(item => item.usage === type).sort((a, b) => b.level - a.level)
    ));
  }

  private getSortedUnits(type: UnitType): PlayerUnit[] {
    return JSON.parse(JSON.stringify(
      this.units.filter(unit => unit.type === type).sort((a, b) => b.level - a.level)
    ));
  }

  private calculateUnitStats(sortedUnits: PlayerUnit[], requestedType?: string): number {
    // Primary calculation for units of the requested type (sortedUnits provided by caller)
    let stat = sortedUnits.reduce((acc, unit) => {
      const unitInfo = UnitTypes.find(u => u.type === unit.type && u.level === unit.level);
      return acc + (unitInfo?.bonus ?? 0) * (unit.quantity ?? 0);
    }, 0);

    // Parity behavior: some legacy calculations counted contributions from basic population
    // (CITIZEN / WORKER) toward defensive stats. If caller requested DEFENSE and there
    // were no explicit DEFENSE units, include a minimal contribution from citizens/workers.
    if ((requestedType === 'DEFENSE' || requestedType === 'SENTRY') && stat === 0) {
      // Inspect overall units on the user (this.units) and include simple contributions
      const popContribution = this.units
        .filter(u => u.type === 'CITIZEN' || u.type === 'WORKER')
        .reduce((acc, unit) => {
          const info = UnitTypes.find(t => t.type === unit.type && t.level === unit.level);
          const bonus = info?.bonus ?? 0;
          return acc + bonus * (unit.quantity ?? 0) * 0.1; // small fraction to represent militia/civilians
        }, 0);
      // Add a scaled-down contribution so defense isn't zero for populated defenders
      stat += Math.ceil(popContribution);
    }

    return stat;
  }

  private calculateItemStats(sortedItems: PlayerItem[], sortedUnits: PlayerUnit[], unitCoverage: Map<number, number>): number {
    let totalStat = 0;
    const itemCountsByTypeLevel: { [itemType: string]: { [level: number]: number } } = {};

    sortedUnits.forEach((unit, unitIndex) => {
      if (unit.quantity <= 0) return;
      const unitCurrentCoverage = unitCoverage.get(unitIndex) || 0;
      let unitNeedsCoverage = unit.quantity - unitCurrentCoverage;
      if (unitNeedsCoverage <= 0) return;

      const itemTypesForUsage = Array.from(new Set(sortedItems.filter(item => item.usage === unit.type && item.level <= unit.level).map(item => item.type)));
      
      itemTypesForUsage.forEach(itemType => {
        let unitsLeftForType = unitNeedsCoverage;
        const itemsOfType = sortedItems.filter(item => item.usage === unit.type && item.type === itemType && item.level <= unit.level).sort((a, b) => b.level - a.level);
        itemsOfType.forEach(item => {
          if (unitsLeftForType <= 0) return;
          const itemInfo = ItemTypes.find(w => w.level === item.level && w.usage === item.usage && w.type === item.type);
          if (!itemInfo) return;
          if (!itemCountsByTypeLevel[item.type]) itemCountsByTypeLevel[item.type] = {};
          if (!itemCountsByTypeLevel[item.type][item.level]) itemCountsByTypeLevel[item.type][item.level] = 0;
          const availableItemQuantity = item.quantity - itemCountsByTypeLevel[item.type][item.level];
          if (availableItemQuantity <= 0) return;
          const quantityToApply = Math.min(unitsLeftForType, availableItemQuantity);
          
          totalStat += (itemInfo.bonus ?? 0) * quantityToApply;
          itemCountsByTypeLevel[item.type][item.level] += quantityToApply;
          unitsLeftForType -= quantityToApply;
        });
      });
      unitCoverage.set(unitIndex, unit.quantity - unitNeedsCoverage);
    });
    return totalStat;
  }

  private calculateBattleUpgradeStats(sortedUnits: PlayerUnit[], type: UnitType, unitCoverage: Map<number, number>): number {
    let totalStat = 0;
    const applicableUpgrades = this.battle_upgrades
      .filter(up => up.type === type)
      .sort((a, b) => b.level - a.level);

    applicableUpgrades.forEach(upgrade => {
      const upgradeInfo = BattleUpgrades.find(bu => bu.type === upgrade.type && bu.level === upgrade.level);
      if (!upgradeInfo || upgrade.quantity <= 0) return;

      let remainingUpgradeQuantity = upgrade.quantity;

      sortedUnits.forEach((unit, unitIndex) => {
        if (remainingUpgradeQuantity <= 0) return;
        if (unit.quantity <= 0 || unit.level < upgradeInfo.minUnitLevel) return;

        const unitCurrentCoverage = unitCoverage.get(unitIndex) || 0;
        const unitNeedsCoverage = unit.quantity - unitCurrentCoverage;
        if (unitNeedsCoverage <= 0) return;

        const maxUnitsUpgradeable = remainingUpgradeQuantity * upgradeInfo.unitsCovered;

        const unitsToUpgrade = Math.min(unitNeedsCoverage, maxUnitsUpgradeable);

        if (unitsToUpgrade > 0) {
          totalStat += (upgradeInfo.bonus ?? 0) * unitsToUpgrade;

          unitCoverage.set(unitIndex, unitCurrentCoverage + unitsToUpgrade);
          remainingUpgradeQuantity -= Math.ceil(unitsToUpgrade / upgradeInfo.unitsCovered);
        }
      });
    });

    return totalStat;
  }

  private applyBonuses(type: UnitType, totalStat: number): number {
    let bonusPercent = 0;
    switch (type) {
      case 'OFFENSE': bonusPercent = this.getAttackBonus(); break;
      case 'DEFENSE': bonusPercent = this.getDefenseBonus(); break;
      case 'SPY': bonusPercent = this.getSpyBonus(); break;
      case 'SENTRY': bonusPercent = this.getSentryBonus(); break;
    }
    return totalStat * (1 + bonusPercent / 100);
  }

  private getSpyLevel(): number {
    return this.structure_upgrades.find(s => s.type === 'SPY')?.level ?? 0;
  }

  private getSentryLevel(): number {
    return this.structure_upgrades.find(s => s.type === 'SENTRY')?.level ?? 0;
  }
}