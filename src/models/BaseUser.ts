import type {
  UserBattleUpgrade,
  UserBonusPoints,
  UserItem,
  users as PrismaUser,
  UserStructureUpgrade,
  UserUnit,
} from '@prisma/client';

export type BaseUserRelations = {
  units?: UserUnit[];
  items?: UserItem[];
  structure_upgrades?: UserStructureUpgrade[];
  battle_upgrades?: UserBattleUpgrade[];
  bonus_points?: UserBonusPoints[];
};

type BaseUserData = PrismaUser &
  Partial<{
    UserUnit: UserUnit[];
    UserItem: UserItem[];
    UserStructureUpgrade: UserStructureUpgrade[];
    UserBattleUpgrade: UserBattleUpgrade[];
    UserBonusPoints: UserBonusPoints[];
  }>;

export const safeBigInt = (value: unknown): bigint => {
  if (value === null || value === undefined) return BigInt(0);
  if (typeof value === 'bigint') return value;

  const stringValue = String(value);
  const cleanValue = stringValue.replace(/n$/, '');

  try {
    return BigInt(cleanValue);
  } catch {
    return BigInt(0);
  }
};

export class BaseUser {
  public id: number;

  public displayName: string;

  public race: string;

  public class: string;

  public experience: number;

  public fortLevel: number;

  public fortHitpoints: number;

  public gold: bigint;

  public units: UserUnit[];

  public mercenaries: UserUnit[];

  public items: UserItem[];

  public structure_upgrades: UserStructureUpgrade[];

  public battle_upgrades: UserBattleUpgrade[];

  public bonus_points: UserBonusPoints[];

  public attackTurns: number;

  public stamina: number;

  public defensePressureToday: number;

  public defensePressureDate: Date | string | null;

  public spyPressureToday: number;

  public spyPressureDate: Date | string | null;

  public woundedUnits: unknown[];

  constructor(
    userData?: BaseUserData | null,
    relations: BaseUserRelations = {},
  ) {
    const safeUser = userData ?? null;

    this.id = safeUser?.id ?? 0;
    this.displayName = safeUser?.display_name ?? '';
    this.race = safeUser?.race ?? 'ELF';
    this.class = safeUser?.class ?? 'ASSASSIN';

    this.experience = safeUser?.experience ?? 0;
    this.fortLevel = safeUser?.fort_level ?? 0;
    this.fortHitpoints = safeUser?.fort_hitpoints ?? 0;
    this.gold = safeBigInt(safeUser?.gold);

    this.attackTurns = safeUser?.attack_turns ?? 0;
    this.stamina = safeUser?.stamina ?? 100;
    this.defensePressureToday = safeUser?.defense_pressure_today ?? 0;
    this.defensePressureDate = safeUser?.defense_pressure_date ?? null;
    this.spyPressureToday = safeUser?.spy_pressure_today ?? 0;
    this.spyPressureDate = safeUser?.spy_pressure_date ?? null;
    this.woundedUnits = Array.isArray(safeUser?.wounded_units)
      ? safeUser.wounded_units
      : [];

    const units = Array.isArray(relations.units)
      ? relations.units
      : Array.isArray(safeUser?.UserUnit)
        ? safeUser.UserUnit
        : [];

    this.units = units.filter((u) => !u.isMercenary);
    this.mercenaries = units.filter((u) => !!u.isMercenary);

    this.items = Array.isArray(relations.items)
      ? relations.items
      : Array.isArray(safeUser?.UserItem)
        ? safeUser.UserItem
        : [];

    this.structure_upgrades = Array.isArray(relations.structure_upgrades)
      ? relations.structure_upgrades
      : Array.isArray(safeUser?.UserStructureUpgrade)
        ? safeUser.UserStructureUpgrade
        : [];

    this.battle_upgrades = Array.isArray(relations.battle_upgrades)
      ? relations.battle_upgrades
      : Array.isArray(safeUser?.UserBattleUpgrade)
        ? safeUser.UserBattleUpgrade
        : [];

    this.bonus_points = Array.isArray(relations.bonus_points)
      ? relations.bonus_points
      : Array.isArray(safeUser?.UserBonusPoints)
        ? safeUser.UserBonusPoints
        : [];
  }

  toJSON() {
    return {
      id: this.id,
      displayName: this.displayName,
      race: this.race,
      class: this.class,
      experience: this.experience,
      fortLevel: this.fortLevel,
      fortHitpoints: this.fortHitpoints,
      gold: this.gold,
      attackTurns: this.attackTurns,
      stamina: this.stamina,
      defensePressureToday: this.defensePressureToday,
      defensePressureDate: this.defensePressureDate,
      spyPressureToday: this.spyPressureToday,
      spyPressureDate: this.spyPressureDate,
      woundedUnits: this.woundedUnits,
      units: this.units,
      mercenaries: this.mercenaries,
      items: this.items,
      structure_upgrades: this.structure_upgrades,
      battle_upgrades: this.battle_upgrades,
      bonus_points: this.bonus_points,
    };
  }
}
