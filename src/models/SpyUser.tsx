import type { SpyUpgrades } from '@/constants';
import type { users as PrismaUser, UserUnit } from '@/lib/prisma-exports';
import { UserStatsService } from '@/services/UserStatsService';
import { UserUnitsService } from '@/services/UserUnitsService';
import type { UnitTotalsType } from '@/types/typings';
import { getLevelFromXP } from '@/utils/utilities';

import { BaseUser, type BaseUserRelations } from './BaseUser';

/** Models spy user behavior and derived game data. */
export class SpyUser extends BaseUser {
  private statsService: UserStatsService;

  private unitsService: UserUnitsService;

  public spy: number;

  public sentry: number;

  public goldInBank: bigint;

  constructor(userData?: PrismaUser | null, relations: BaseUserRelations = {}) {
    super(userData, relations);
    this.goldInBank = BigInt(userData?.gold_in_bank ?? 0);

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

    this.unitsService = new UserUnitsService({
      units: this.units,
      mercenaries: this.mercenaries,
      items: this.items,
      fortLevel: this.fortLevel,
      structure_upgrades: this.structure_upgrades,
    });

    this.spy = 0;
    this.sentry = 0;

    const stats = this.statsService.updateStats();
    this.spy = stats.spy.totalStats.MeleeAtkPower;
    this.sentry = stats.sentry.totalStats.MeleeDefPower;
  }

  get level(): number {
    return getLevelFromXP(this.experience);
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

  getLevelForUnit(type: UserUnit['type']): number {
    return this.unitsService.getLevelForUnit(type as any);
  }

  get unitTotals(): UnitTotalsType {
    return this.unitsService.getUnitTotals();
  }

  get spyLimits(): {
    infil: { perUser: number; perMission: number; perDay: number };
    assass: { perUser: number; perMission: number; perDay: number };
    stats: { level: number; all: (typeof SpyUpgrades)[number] | undefined };
  } {
    return this.unitsService.getSpyLimits();
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      level: this.level,
      spy: this.spy,
      sentry: this.sentry,
      goldInBank: this.goldInBank,
      unitTotals: this.unitTotals,
      spyLimits: this.spyLimits,
    };
  }
}
