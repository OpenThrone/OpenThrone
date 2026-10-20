import { z } from 'zod';

import type {
  UserBattleUpgrade,
  UserBonusPoints,
  UserItem,
  UserStructureUpgrade,
  UserUnit,
} from '@/lib/prisma-exports';
import type { FortHealth, PlayerBonus, UnitType } from '@/types/typings';
import {
  calculateBonusPointMultiplier,
  getBonusPointLevel,
} from '@/utils/balance/v5Combat';
import {
  calculateCombatBreakdown,
  calculateCombatStrength,
  type CombatBreakdown,
  type CombatStrengthUser,
  type DetailedCalculatedStrength,
} from '@/utils/combatStrength';
import { getLevelFromXP } from '@/utils/utilities';

import {
  Bonuses,
  Fortifications,
  levelXPArray,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
} from '../constants';

const UserDataSchema = z.object({
  experience: z.number().optional(),
  units: z.array(z.any()).optional(),
  mercenaries: z.array(z.any()).optional(),
  items: z.array(z.any()).optional(),
  bonus_points: z.array(z.any()).optional(),
  structure_upgrades: z.array(z.any()).optional(),
  battle_upgrades: z.array(z.any()).optional(),
  fortLevel: z.number().optional(),
  fortHitpoints: z.number().optional(),
  race: z.string().optional(),
  class: z.string().optional(),
});

/** Encapsulates user stats data access and domain operations. */
export class UserStatsService {
  private experience: number;

  private units: UserUnit[];

  private mercenaries: UserUnit[];

  private items: UserItem[];

  private bonus_points: UserBonusPoints[];

  private structure_upgrades: UserStructureUpgrade[];

  private battle_upgrades: UserBattleUpgrade[];

  private fortLevel: number;

  private fortHitpoints: number;

  private race: string;

  private class: string;

  constructor(
    userData: {
      experience?: number;
      units?: UserUnit[];
      mercenaries?: UserUnit[];
      items?: UserItem[];
      bonus_points?: UserBonusPoints[];
      structure_upgrades?: UserStructureUpgrade[];
      battle_upgrades?: UserBattleUpgrade[];
      fortLevel?: number;
      fortHitpoints?: number;
      race?: string;
      class?: string;
    } = {},
  ) {
    const validatedData = UserDataSchema.parse(userData);
    this.experience = validatedData.experience ?? 0;
    this.units = Array.isArray(validatedData.units) ? validatedData.units : [];
    this.mercenaries = validatedData.mercenaries ?? [];
    this.items = Array.isArray(validatedData.items) ? validatedData.items : [];
    this.bonus_points = Array.isArray(validatedData.bonus_points)
      ? validatedData.bonus_points
      : [];
    this.structure_upgrades = Array.isArray(validatedData.structure_upgrades)
      ? validatedData.structure_upgrades
      : [];
    this.battle_upgrades = Array.isArray(validatedData.battle_upgrades)
      ? validatedData.battle_upgrades
      : [];
    this.fortLevel = validatedData.fortLevel;
    this.fortHitpoints = validatedData.fortHitpoints ?? 0;
    this.race = validatedData.race ?? 'ELF';
    this.class = validatedData.class ?? 'ASSASSIN';
  }

  calculateLevel(): number {
    return getLevelFromXP(this.experience);
  }

  xpRequiredForLevel(level: number): number {
    const levelInfo = levelXPArray.find((l) => l.level === level);
    return levelInfo?.xp ?? Infinity;
  }

  xpToNextLevel(): number {
    const nextLevelXP = this.xpRequiredForLevel(this.calculateLevel() + 1);
    return nextLevelXP === Infinity
      ? 0
      : Math.max(0, nextLevelXP - this.experience);
  }

  getPlayerBonuses(): PlayerBonus[] {
    return Bonuses.filter(
      (bonus) => bonus.race === this.race || bonus.race === this.class,
    );
  }

  getIncomeBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'INCOME')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus =
      (calculateBonusPointMultiplier(
        getBonusPointLevel(this.bonus_points, 'INCOME'),
      ) -
        1) *
      100;

    return baseBonus + pointsBonus;
  }

  getAttackBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'OFFENSE')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus =
      (calculateBonusPointMultiplier(
        getBonusPointLevel(this.bonus_points, 'OFFENSE'),
      ) -
        1) *
      100;

    const structureBonus = this.structure_upgrades
      .filter((upgrade) => upgrade.type === 'OFFENSE')
      .map(
        (upgrade) =>
          OffensiveUpgrades.find((u) => u.level === upgrade.level)
            ?.offenseBonusPercentage ?? 0,
      )
      .reduce((sum, bonus) => sum + bonus, 0);

    return baseBonus + pointsBonus + structureBonus;
  }

  getDefenseBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'DEFENSE')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus =
      (calculateBonusPointMultiplier(
        getBonusPointLevel(this.bonus_points, 'DEFENSE'),
      ) -
        1) *
      100;

    const fortBonus =
      Fortifications.find((f) => f.level === this.fortLevel)
        ?.defenseBonusPercentage ?? 0;

    return baseBonus + pointsBonus + fortBonus;
  }

  getIntelBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'INTEL')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus =
      (calculateBonusPointMultiplier(
        getBonusPointLevel(this.bonus_points, 'INTEL'),
      ) -
        1) *
      100;

    return baseBonus + pointsBonus;
  }

  getSpyBonus(): number {
    const spyLevel = this.getSpyLevel();
    const structureBonus =
      SpyUpgrades.find((u) => u.level === spyLevel)?.offenseBonusPercentage ??
      0;
    return structureBonus + this.getIntelBonus();
  }

  getSentryBonus(): number {
    const sentryLevel = this.getSentryLevel();
    const structureBonus =
      SentryUpgrades[sentryLevel - 1]?.defenseBonusPercentage ?? 0;
    return structureBonus + this.getIntelBonus();
  }

  getCasualtyBonus(): number {
    return this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'CASUALTY')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);
  }

  /**
   * Total price discount as a percentage (10 means 10% off).
   * Clamped to [0, 100] so every cost formula `cost - (bonus / 100) * cost`
   * stays within [0, cost]; a total above 100 would otherwise yield negative costs.
   */
  getPriceBonus(): number {
    const baseBonus = this.getPlayerBonuses()
      .filter((bonus) => bonus.bonusType === 'PRICES')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus =
      (calculateBonusPointMultiplier(
        getBonusPointLevel(this.bonus_points, 'PRICES'),
      ) -
        1) *
      100;

    const total = baseBonus + pointsBonus;
    return Number.isFinite(total) ? Math.min(100, Math.max(0, total)) : 0;
  }

  getAvailableProficiencyPoints(): number {
    return Math.max(0, this.calculateLevel() - this.getUsedProficiencyPoints());
  }

  getUsedProficiencyPoints(): number {
    return this.bonus_points.reduce(
      (acc, bonus) => acc + (bonus.level || 0),
      0,
    );
  }

  private combatUser(): CombatStrengthUser {
    return {
      units: this.units,
      mercenaries: this.mercenaries,
      items: this.items,
      battle_upgrades: this.battle_upgrades,
      structure_upgrades: this.structure_upgrades,
      fortLevel: this.fortLevel,
      race: this.race,
      attackBonus: this.getAttackBonus(),
      defenseBonus: this.getDefenseBonus(),
      spyBonus: this.getSpyBonus(),
      sentryBonus: this.getSentryBonus(),
    };
  }

  calculateArmyStat(type: UnitType): DetailedCalculatedStrength {
    return calculateCombatStrength(this.combatUser(), type, {
      collateralFallback: true,
    });
  }

  calculateArmyStatBreakdown(type: 'OFFENSE' | 'DEFENSE'): CombatBreakdown {
    return calculateCombatBreakdown(this.combatUser(), type, {
      collateralFallback: true,
    });
  }

  updateStats(): {
    offense: DetailedCalculatedStrength;
    defense: DetailedCalculatedStrength;
    spy: DetailedCalculatedStrength;
    sentry: DetailedCalculatedStrength;
  } {
    return {
      offense: this.calculateArmyStat('OFFENSE'),
      defense: this.calculateArmyStat('DEFENSE'),
      spy: this.calculateArmyStat('SPY'),
      sentry: this.calculateArmyStat('SENTRY'),
    };
  }

  getFortHealth(): FortHealth {
    const maxHP =
      Fortifications.find((f) => f.level === this.fortLevel)?.hitpoints ?? 0;
    const currentHP = this.fortHitpoints ?? 0;
    return {
      current: currentHP,
      max: maxHP,
      percentage: maxHP > 0 ? Math.floor((currentHP / maxHP) * 100) : 0,
    };
  }

  private getSpyLevel(): number {
    return this.structure_upgrades.find((s) => s.type === 'SPY')?.level ?? 0;
  }

  private getSentryLevel(): number {
    return this.structure_upgrades.find((s) => s.type === 'SENTRY')?.level ?? 0;
  }
}
