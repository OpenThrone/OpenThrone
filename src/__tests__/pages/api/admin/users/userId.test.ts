import { describe, expect, it } from 'bun:test';

import {
  AdminUpdateError,
  buildFieldDiff,
  findMissingExpectations,
  findStaleFields,
  fortMaxHitpoints,
  GameplayPatchSchema,
  GameplaySchema,
  MAX_ECONOMY_LEVEL,
  MAX_FORT_LEVEL,
  MAX_HOUSE_LEVEL,
  resolveFortHitpoints,
  usedBonusPoints,
} from '@/pages/api/admin/users/[userId]';

const valid = {
  fortLevel: 2,
  fortHitpoints: 10,
  stamina: 50,
  maxStamina: 100,
  attackTurns: 10,
  houseLevel: 0,
  economyLevel: 0,
  race: 'ELF',
  class: 'FIGHTER',
  locale: 'en',
  bio: '',
};

describe('admin user gameplay validation', () => {
  it('accepts values inside game bounds', () => {
    expect(GameplaySchema.safeParse(valid).success).toBe(true);
    expect(
      GameplaySchema.safeParse({
        ...valid,
        fortLevel: MAX_FORT_LEVEL,
        houseLevel: MAX_HOUSE_LEVEL,
        economyLevel: MAX_ECONOMY_LEVEL,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['fortLevel', 0],
    ['fortLevel', MAX_FORT_LEVEL + 1],
    ['houseLevel', MAX_HOUSE_LEVEL + 1],
    ['economyLevel', MAX_ECONOMY_LEVEL + 1],
    ['maxStamina', 0],
    ['attackTurns', -1],
    ['race', 'DWARF'],
    ['class', 'BARD'],
    ['locale', 'fr'],
    ['bio', 'x'.repeat(2001)],
    ['stamina', 101],
  ])('rejects %s=%p', (field, value) => {
    expect(GameplaySchema.safeParse({ ...valid, [field]: value }).success).toBe(
      false,
    );
  });
});

describe('resolveFortHitpoints', () => {
  it('clamps HP when the level is lowered', () => {
    expect(resolveFortHitpoints(5, 1, 1_000_000)).toBe(fortMaxHitpoints(1));
  });

  it('rejects HP above the max when the level is not lowered', () => {
    expect(() => resolveFortHitpoints(1, 1, 1_000_000)).toThrow(
      AdminUpdateError,
    );
  });

  it('keeps valid HP', () => {
    expect(resolveFortHitpoints(1, 2, 1)).toBe(1);
  });
});

describe('buildFieldDiff', () => {
  it('records only changed fields with bigint as string', () => {
    expect(
      buildFieldDiff(
        { gold: 5n, race: 'ELF', bio: 'a' },
        { gold: 6n, race: 'ELF', bio: undefined },
      ),
    ).toEqual({ gold: { before: '5', after: '6' } });
  });
});

describe('findStaleFields', () => {
  it('flags fields whose loaded value no longer matches', () => {
    expect(
      findStaleFields(
        { gold: 10n, stamina: 5, email: 'A@x.io' },
        { gold: '10', stamina: 4, email: 'a@x.io ' },
      ),
    ).toEqual(['stamina']);
  });

  it('treats unknown keys as stale', () => {
    expect(findStaleFields({}, { bogus: 1 })).toEqual(['bogus']);
  });
});

describe('usedBonusPoints', () => {
  it('sums allocated proficiency levels', () => {
    expect(usedBonusPoints([{ level: 3 }, { level: 2 }, { level: null }])).toBe(
      5,
    );
  });
});

describe('GameplayPatchSchema', () => {
  it('accepts a single changed field but still enforces bounds', () => {
    expect(GameplayPatchSchema.safeParse({ stamina: 3 }).success).toBe(true);
    expect(
      GameplayPatchSchema.safeParse({ fortLevel: MAX_FORT_LEVEL + 1 }).success,
    ).toBe(false);
  });
});

describe('fort level expectations', () => {
  it('requires the loaded fort HP when the fort level changes', () => {
    const missing = findMissingExpectations({
      profile: {},
      stats: {},
      gameplay: { fortLevel: 2 },
      army: { units: [] },
      items: { items: [] },
      expected: { eraId: 1, fields: { fortLevel: 3 }, units: {}, items: {} },
    });
    expect(missing).toEqual(['fortHitpoints']);
  });
});
