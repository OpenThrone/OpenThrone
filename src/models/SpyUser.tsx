import type { UserStructureUpgrade, UserUnit, users as PrismaUser } from '@prisma/client';

import { SpyUpgrades } from '@/constants';
import { UserStatsService } from '@/services/UserStatsService';
import { UserUnitsService } from '@/services/UserUnitsService';
import { getLevelFromXP } from '@/utils/utilities';
import type { Item, PlayerUnit, UnitTotalsType } from '@/types/typings';

import { BaseUser, type BaseUserRelations } from './BaseUser';

export class SpyUser extends BaseUser {
  private statsService: UserStatsService;
  private unitsService: UserUnitsService;

  public spy: number;
  public sentry: number;

  constructor(userData?: PrismaUser | null, relations: BaseUserRelations = {}) {
    super(userData, relations);

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
      unitTotals: this.unitTotals,
      spyLimits: this.spyLimits,
    };
  }
}

export class SpyUserModel {
  units: PlayerUnit[] | null;
  items: Item[] | null;
  fort_level: number | null;
  fort_hitpoints: number | null;
  goldInBank: bigint | null;

  constructor(
    defender: {
      units?: PlayerUnit[] | null;
      items?: Item[] | null;
      fortLevel?: number | null;
      fortHitpoints?: number | null;
      goldInBank?: bigint | null;
    },
    intelPercentage: number,
  ) {
    // Explicitly set each property based on the defender's properties
    this.units = defender.units
      ? (defender.units.map((unit) => ({
          ...(unit as any),
          quantity: Math.ceil(((unit as any).quantity * intelPercentage) / 100),
        })) as PlayerUnit[])
      : [];
    this.items = defender.items
      ? (defender.items.map((item) => ({
          ...(item as any),
          quantity: Math.ceil(((item as any).quantity * intelPercentage) / 100),
        })) as Item[])
      : [];
    this.fort_level = defender.fortLevel !== null && defender.fortLevel !== undefined
      ? Math.ceil((defender.fortLevel * intelPercentage) / 100)
      : null;
    this.fort_hitpoints = defender.fortHitpoints !== null && defender.fortHitpoints !== undefined
      ? Math.ceil((defender.fortHitpoints * intelPercentage) / 100)
      : null;
    this.goldInBank = defender.goldInBank !== null && defender.goldInBank !== undefined
      ? defender.goldInBank // * BigInt(intelPercentage)) / BigInt(100)
      : BigInt(0);
  }
}
