import { describe, expect, test } from 'bun:test';

import {
  AdminUpgradesUpdateSchema,
  buildUpgradesPatch,
  diffByKey,
  findMissingExpectations,
  findStaleUpgrades,
  missingItems,
  missingUnits,
  snapshotUpgrades,
  STRUCTURE_MAX_LEVEL,
  UNIT_CATALOG,
  validateUpgradesUpdate,
} from './adminUpgrades';

const parse = (body: Record<string, unknown>) =>
  AdminUpgradesUpdateSchema.parse({ expected: { eraId: null }, ...body });

describe('admin upgrades validation', () => {
  test('accepts a structure level at the max and rejects one above', () => {
    const max = STRUCTURE_MAX_LEVEL.ARMORY;
    expect(
      validateUpgradesUpdate(
        parse({ structureUpgrades: [{ type: 'ARMORY', level: max }] }),
        1,
      ),
    ).toEqual([]);
    expect(
      validateUpgradesUpdate(
        parse({ structureUpgrades: [{ type: 'ARMORY', level: max + 1 }] }),
        1,
      ),
    ).toHaveLength(1);
  });

  test('schema rejects negative quantities and level 0 structures', () => {
    expect(
      AdminUpgradesUpdateSchema.safeParse({
        battleUpgrades: [{ type: 'OFFENSE', level: 1, quantity: -1 }],
      }).success,
    ).toBe(false);
    expect(
      AdminUpgradesUpdateSchema.safeParse({
        structureUpgrades: [{ type: 'SPY', level: 0 }],
      }).success,
    ).toBe(false);
  });

  test('rejects unknown battle upgrade levels', () => {
    const errors = validateUpgradesUpdate(
      parse({ battleUpgrades: [{ type: 'OFFENSE', level: 99, quantity: 1 }] }),
      1,
    );
    expect(errors[0]).toContain('Unknown battle upgrade');
  });

  test('caps bonus point total at player level, merging untouched types', () => {
    const update = parse({ bonusPoints: [{ type: 'OFFENSE', level: 5 }] });
    expect(
      validateUpgradesUpdate(update, 10, [{ type: 'DEFENSE', level: 5 }]),
    ).toEqual([]);
    expect(
      validateUpgradesUpdate(update, 10, [{ type: 'DEFENSE', level: 6 }]),
    ).toHaveLength(1);
    // Replacing a type's level does not double count it.
    expect(
      validateUpgradesUpdate(update, 5, [{ type: 'OFFENSE', level: 5 }]),
    ).toEqual([]);
  });

  test('rejects unknown bonus types and duplicates', () => {
    const errors = validateUpgradesUpdate(
      parse({
        bonusPoints: [
          { type: 'BOGUS', level: 0 },
          { type: 'OFFENSE', level: 0 },
          { type: 'OFFENSE', level: 0 },
        ],
      }),
      100,
    );
    expect(errors).toContain('Unknown bonus type BOGUS');
    expect(errors).toContain('Duplicate bonus point types');
  });

  test('only catalog units and items may be added', () => {
    expect(
      validateUpgradesUpdate(
        parse({
          addUnits: [{ type: 'OFFENSE', level: 1, quantity: 10 }],
          addItems: [
            { type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 1 },
          ],
        }),
        1,
      ),
    ).toEqual([]);
    expect(
      validateUpgradesUpdate(
        parse({
          addUnits: [{ type: 'CITIZEN', level: 3, quantity: 1 }],
          addItems: [
            { type: 'WEAPON', usage: 'OFFENSE', level: 999, quantity: 1 },
          ],
        }),
        1,
      ),
    ).toHaveLength(2);
  });
});

describe('admin upgrades catalog helpers', () => {
  test('missingUnits ignores mercenary rows', () => {
    const missing = missingUnits([
      { type: 'OFFENSE', level: 1, isMercenary: true },
      { type: 'CITIZEN', level: 1 },
    ]);
    expect(missing.some((u) => u.type === 'OFFENSE' && u.level === 1)).toBe(
      true,
    );
    expect(missing.some((u) => u.type === 'CITIZEN')).toBe(false);
    expect(missing).toHaveLength(UNIT_CATALOG.length - 1);
  });

  test('missingItems excludes owned rows', () => {
    const missing = missingItems([
      { type: 'WEAPON', usage: 'OFFENSE', level: 1 },
    ]);
    expect(
      missing.some(
        (i) => i.type === 'WEAPON' && i.usage === 'OFFENSE' && i.level === 1,
      ),
    ).toBe(false);
  });

  test('diffByKey reports only changes', () => {
    const diff = diffByKey(
      [
        { k: 'a', v: 1 },
        { k: 'b', v: 2 },
      ],
      [
        { k: 'a', v: 1 },
        { k: 'b', v: 3 },
        { k: 'c', v: 0 },
      ],
      (r) => r.k,
      (r) => r.v,
    );
    expect(diff).toEqual({
      b: { before: 2, after: 3 },
      c: { before: null, after: 0 },
    });
  });
});

describe('admin upgrades stale-edit protection', () => {
  const row = {
    currentEraId: 2,
    UserStructureUpgrade: [{ type: 'OFFENSE', level: 3 }],
    UserBattleUpgrade: [{ type: 'OFFENSE', level: 1, quantity: 10 }],
    UserBonusPoints: [{ type: 'INCOME', level: 4 }],
    UserUnit: [{ type: 'OFFENSE', level: 1, isMercenary: true }],
    UserItem: [{ type: 'WEAPON', usage: 'OFFENSE', level: 1 }],
  };

  test('schema requires an expected block with eraId', () => {
    expect(AdminUpgradesUpdateSchema.safeParse({}).success).toBe(false);
    expect(AdminUpgradesUpdateSchema.safeParse({ expected: {} }).success).toBe(
      false,
    );
  });

  test('every supplied row needs an expectation', () => {
    const update = parse({
      structureUpgrades: [{ type: 'SPY', level: 2 }],
      battleUpgrades: [{ type: 'OFFENSE', level: 1, quantity: 5 }],
      addUnits: [{ type: 'OFFENSE', level: 1, quantity: 1 }],
      expected: { eraId: 2, battle: { OFFENSE_1: 10 } },
    });
    expect(findMissingExpectations(update)).toEqual([
      'structure SPY',
      'unit OFFENSE_1',
    ]);
  });

  test('matching expectations are not stale', () => {
    const update = parse({
      expected: {
        eraId: 2,
        structure: { OFFENSE: 3, SPY: null },
        battle: { OFFENSE_1: 10 },
        bonus: { INCOME: 4 },
        // Only a mercenary row exists, so the permanent row is still absent.
        units: { OFFENSE_1: null },
      },
    });
    expect(findStaleUpgrades(update.expected, snapshotUpgrades(row))).toEqual(
      [],
    );
  });

  test('a purchase made while the panel was open is stale', () => {
    const update = parse({
      expected: {
        eraId: 1,
        battle: { OFFENSE_1: 9 },
        structure: { SPY: null },
        items: { WEAPON_OFFENSE_1: null },
      },
    });
    expect(
      findStaleUpgrades(update.expected, snapshotUpgrades(row)).sort(),
    ).toEqual(['battle OFFENSE_1', 'currentEraId', 'item WEAPON_OFFENSE_1']);
  });

  test('patch sends only changed rows with their loaded values', () => {
    const loaded = {
      structure: { OFFENSE: 3 },
      battle: { OFFENSE_1: 10 },
      bonus: { INCOME: 4 },
    };
    const patch = buildUpgradesPatch(
      loaded,
      {
        structure: { OFFENSE: 3, SPY: 2, SENTRY: 1 },
        battle: { OFFENSE_1: 10, DEFENSE_2: 7, SPY_1: 0 },
        bonus: { INCOME: 4, OFFENSE: 0 },
      },
      { structure: 1, battle: 0, bonus: 0 },
      2,
      [{ type: 'WORKER', level: 1, quantity: 3 }],
      [],
    );
    expect(patch.structureUpgrades).toEqual([{ type: 'SPY', level: 2 }]);
    expect(patch.battleUpgrades).toEqual([
      { type: 'DEFENSE', level: 2, quantity: 7 },
    ]);
    expect(patch.bonusPoints).toEqual([]);
    expect(patch.expected).toEqual({
      eraId: 2,
      structure: { SPY: null },
      battle: { DEFENSE_2: null },
      bonus: {},
      units: { WORKER_1: null },
      items: {},
    });
    const parsed = AdminUpgradesUpdateSchema.parse(patch);
    expect(findMissingExpectations(parsed)).toEqual([]);
  });
});
