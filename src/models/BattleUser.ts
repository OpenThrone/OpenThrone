import { UnitTypes } from '@/constants';
import type { users as PrismaUser, UserUnit } from '@/lib/prisma-exports';
import { UserStatsService } from '@/services/UserStatsService';
import type { FortHealth } from '@/types/typings';
import type { DetailedCalculatedStrength } from '@/utils/attackFunctions';
import { getLevelFromXP } from '@/utils/utilities';

import { BaseUser, type BaseUserRelations } from './BaseUser';

/** Models battle user behavior and derived game data. */
export class BattleUser extends BaseUser {
  private statsService: UserStatsService;

  public offense: number;

  public defense: number;

  public spy: number;

  public sentry: number;

  private readonly allUnits: UserUnit[];

  private readonly allMercenaries: UserUnit[];

  constructor(userData?: PrismaUser | null, relations: BaseUserRelations = {}) {
    super(userData, relations);

    this.allUnits = this.units;
    this.allMercenaries = this.mercenaries;

    this.units = this.filterUnlockedUnits(this.allUnits);
    this.mercenaries = this.filterUnlockedUnits(this.allMercenaries);

    this.statsService = new UserStatsService({
      experience: this.experience,
      units: [...this.units, ...this.mercenaries],
      items: this.items,
      bonus_points: this.bonus_points,
      structure_upgrades: this.structure_upgrades,
      battle_upgrades: this.battle_upgrades,
      fortLevel: this.fortLevel,
      fortHitpoints: this.fortHitpoints,
      race: this.race,
      class: this.class,
    });

    this.offense = 0;
    this.defense = 0;
    this.spy = 0;
    this.sentry = 0;
    this.updateStats();
  }

  get level(): number {
    return getLevelFromXP(this.experience);
  }

  isProtected(): boolean {
    return this.level <= 9;
  }

  getFortHealth(): FortHealth {
    return this.statsService.getFortHealth();
  }

  get playerBonuses() {
    return this.statsService.getPlayerBonuses();
  }

  get attackBonus(): number {
    return this.statsService.getAttackBonus();
  }

  get defenseBonus(): number {
    return this.statsService.getDefenseBonus();
  }

  get spyBonus(): number {
    return this.statsService.getSpyBonus();
  }

  get sentryBonus(): number {
    return this.statsService.getSentryBonus();
  }

  updateStats() {
    const s = this.statsService.updateStats();
    this.offense = s.offense.totalStats.MeleeAtkPower;
    this.defense = s.defense.totalStats.MeleeDefPower;
    this.spy = s.spy.totalStats.MeleeAtkPower;
    this.sentry = s.sentry.totalStats.MeleeDefPower;
  }

  getDetailedArmyStat(
    type: 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY',
  ): DetailedCalculatedStrength {
    return this.statsService.calculateArmyStat(type as any) as any;
  }

  canAttack(targetLevel: number): boolean {
    if (process.env.NEXT_PUBLIC_ENABLE_ATTACKING === 'false') return false;
    const levelRange = parseInt(
      process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5',
      10,
    );
    return (
      this.level >= targetLevel - levelRange &&
      this.level <= targetLevel + levelRange
    );
  }

  getUnitsForDbUpdate(): UserUnit[] {
    return this.allUnits;
  }

  getMercenariesForDbUpdate(): UserUnit[] {
    return this.allMercenaries;
  }

  private filterUnlockedUnits(units: UserUnit[]): UserUnit[] {
    return (Array.isArray(units) ? units : []).filter((unit) => {
      const unitInfo = UnitTypes.find(
        (info) => info.type === unit.type && info.level === (unit.level || 1),
      );
      if (!unitInfo) return true;
      return (unitInfo.fortLevel ?? 1) <= (this.fortLevel ?? 0);
    });
  }

  get population(): number {
    const allUnits = [...(this.units || []), ...(this.mercenaries || [])];
    return allUnits.reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      level: this.level,
      population: this.population,
      offense: this.offense,
      defense: this.defense,
      spy: this.spy,
      sentry: this.sentry,
    };
  }
}
