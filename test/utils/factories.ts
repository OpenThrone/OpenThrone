import type { PlayerUnit, StructureUpgrade } from '@/types/typings';

// Small helpers to create typed fixtures for tests.
export function playerUnit(type: PlayerUnit['type'], level = 1, quantity = 1): PlayerUnit {
  // Return a fully shaped PlayerUnit to match normalized Prisma relation objects used in production
  return {
    id: 0,
    userId: 0,
    type,
    level,
    quantity,
    isMercenary: false,
  } as unknown as PlayerUnit;
}

export function structureUpgrade(type: StructureUpgrade['type'], level = 1): StructureUpgrade {
  return { type, level } as unknown as StructureUpgrade;
}

// PlayerItem and PlayerBattleUpgrade factory helpers
export function playerItem(type: string, level = 1, quantity = 1) {
  return {
    id: 0,
    userId: 0,
    type,
    level,
    quantity,
  } as unknown as any;
}

export function playerBattleUpgrade(type: string, level = 1, quantity = 1) {
  return {
    id: 0,
    userId: 0,
    type,
    level,
    quantity,
  } as unknown as any;
}

export type UserFixtureOptions = Partial<{
  units: PlayerUnit[];
  structure_upgrades: StructureUpgrade[];
  fortLevel: number;
  fortHitpoints: number;
  race: string;
  class: string;
}>;

export function userFixture(opts: UserFixtureOptions = {}) {
  return {
    units: opts.units ?? [playerUnit('CITIZEN', 1, 100)],
    items: [],
    structure_upgrades: opts.structure_upgrades ?? [],
    bonus_points: [],
    battle_upgrades: [],
    stats: [],
    fortLevel: opts.fortLevel ?? 1,
    fortHitpoints: opts.fortHitpoints ?? 100,
    race: opts.race ?? 'HUMAN',
    class: opts.class ?? 'FIGHTER',
  };
}

// Helper to convert an array of PlayerUnit into the legacy nested map format used by
// some older tests: { OFFENSE: {1: qty, 2: qty }, DEFENSE: { ... } }
export function unitsToLegacyMap(units: PlayerUnit[]) {
  const map: Record<string, Record<number, number>> = {};
  units.forEach(u => {
    if (!map[u.type]) map[u.type] = {};
    map[u.type][u.level] = (map[u.type][u.level] || 0) + u.quantity;
  });
  return map;
}

const factories = { playerUnit, structureUpgrade, userFixture };
export default factories;
