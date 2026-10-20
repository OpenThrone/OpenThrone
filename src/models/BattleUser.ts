import { UnitTypes } from '@/constants';
import type { users as PrismaUser, UserUnit } from '@/lib/prisma-exports';
import { UserStatsService } from '@/services/UserStatsService';
import type { FortHealth } from '@/types/typings';
import {
  getProtectionStatus,
  PROTECTION_LEVEL_LIMIT,
  type ProtectionEraInput,
  type ProtectionSettings,
  type ProtectionStatus,
} from '@/utils/battleProtection';
import type { DetailedCalculatedStrength } from '@/utils/combatStrength';
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

  private readonly protectionFields: {
    eraJoinedAt: Date | string | null;
    createdAt: Date | string | null;
    protectionForfeitedEraId: number | null;
    eventCitizensReceived: number;
  };

  private protectionContext: {
    era: ProtectionEraInput | null;
    settings: ProtectionSettings;
  } | null = null;

  constructor(userData?: PrismaUser | null, relations: BaseUserRelations = {}) {
    super(userData, relations);

    this.protectionFields = {
      eraJoinedAt: userData?.era_joined_at ?? null,
      createdAt: userData?.created_at ?? null,
      protectionForfeitedEraId: userData?.protection_forfeited_era_id ?? null,
      eventCitizensReceived: userData?.event_citizens_received ?? 0,
    };

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

  /** Supplies the era and admin settings the shared protection rule needs (see BattleProtection.service). */
  setProtectionContext(
    era: ProtectionEraInput | null,
    settings: ProtectionSettings,
  ): this {
    this.protectionContext = { era, settings };
    return this;
  }

  /** Shared protection status; null until a protection context is supplied. */
  getProtectionStatus(now: Date = new Date()): ProtectionStatus | null {
    if (!this.protectionContext) return null;
    const allUnits = [...this.allUnits, ...this.allMercenaries];
    return getProtectionStatus(
      {
        experience: this.experience,
        population: allUnits.reduce(
          (sum, unit) => sum + (unit.quantity || 0),
          0,
        ),
        houseLevel: this.houseLevel,
        ...this.protectionFields,
      },
      this.protectionContext.era,
      this.protectionContext.settings,
      now,
    );
  }

  /**
   * Uses the shared rule when a protection context was supplied; otherwise
   * (replays, simulators, snapshots) falls back to the level-only rule.
   */
  isProtected(): boolean {
    return (
      this.getProtectionStatus()?.protected ??
      this.level < PROTECTION_LEVEL_LIMIT
    );
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
