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

  constructor(userData?: PrismaUser | null, relations: BaseUserRelations = {}) {
    const safeUser = userData ?? null;

    this.id = safeUser?.id ?? 0;
    this.displayName = safeUser?.display_name ?? '';
    this.race = (safeUser?.race as any) ?? 'ELF';
    this.class = (safeUser?.class as any) ?? 'ASSASSIN';

    this.experience = safeUser?.experience ?? 0;
    this.fortLevel = safeUser?.fort_level ?? 0;
    this.fortHitpoints = safeUser?.fort_hitpoints ?? 0;
    this.gold = safeBigInt(safeUser?.gold);

    this.attackTurns = safeUser?.attack_turns ?? 0;
    this.stamina = (safeUser as any)?.stamina ?? 100;

    const units = Array.isArray(relations.units)
      ? relations.units
      : Array.isArray((safeUser as any)?.UserUnit)
        ? ((safeUser as any).UserUnit as UserUnit[])
        : [];

    this.units = units.filter((u) => !u.isMercenary);
    this.mercenaries = units.filter((u) => !!u.isMercenary);

    this.items = Array.isArray(relations.items)
      ? relations.items
      : Array.isArray((safeUser as any)?.UserItem)
        ? ((safeUser as any).UserItem as UserItem[])
        : [];

    this.structure_upgrades = Array.isArray(relations.structure_upgrades)
      ? relations.structure_upgrades
      : Array.isArray((safeUser as any)?.UserStructureUpgrade)
        ? ((safeUser as any).UserStructureUpgrade as UserStructureUpgrade[])
        : [];

    this.battle_upgrades = Array.isArray(relations.battle_upgrades)
      ? relations.battle_upgrades
      : Array.isArray((safeUser as any)?.UserBattleUpgrade)
        ? ((safeUser as any).UserBattleUpgrade as UserBattleUpgrade[])
        : [];

    this.bonus_points = Array.isArray(relations.bonus_points)
      ? relations.bonus_points
      : Array.isArray((safeUser as any)?.UserBonusPoints)
        ? ((safeUser as any).UserBonusPoints as UserBonusPoints[])
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
      units: this.units,
      mercenaries: this.mercenaries,
      items: this.items,
      structure_upgrades: this.structure_upgrades,
      battle_upgrades: this.battle_upgrades,
      bonus_points: this.bonus_points,
    };
  }
}
