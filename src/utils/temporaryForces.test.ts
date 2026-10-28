import { describe, expect, test } from 'bun:test';

import { ItemTypes } from '@/constants/Items';
import {
  assertForceTierUnlocked,
  DEFAULT_FORCE_POLICY,
  extendForceContract,
  FORCE_DAY_MS,
  forceExpiration,
  ForcePolicySchema,
  isForceContractUsable,
  MERCENARY_ARMY_SHARE_PERCENT,
  mercenaryShareCap,
  mercenaryTierFeatureKey,
  parseForceLoadout,
  planForceEnforcement,
  splitForcePillage,
} from '@/utils/temporaryForces';

const now = new Date('2026-10-21T12:00:00Z');
const active = {
  status: 'ACTIVE',
  survivingQuantity: 6,
  startsAt: new Date(now.getTime() - FORCE_DAY_MS),
  expiresAt: new Date(now.getTime() + FORCE_DAY_MS),
  unitPriceGold: 100n,
};
const kit = (role: 'OFFENSE' | 'SPY') =>
  [
    ...new Set(
      ItemTypes.filter((item) => item.usage === role).map((item) => item.type),
    ),
  ].map((type) => ({
    type,
    level: ItemTypes.find((item) => item.type === type && item.usage === role)!
      .level,
  }));

describe('temporary force contracts', () => {
  test('expiry is enforced at the exact timestamp without a cleanup tick', () => {
    expect(isForceContractUsable(active, now)).toBe(true);
    expect(isForceContractUsable(active, active.expiresAt)).toBe(false);
    expect(
      isForceContractUsable({ ...active, startsAt: active.expiresAt }, now),
    ).toBe(false);
    for (const status of [
      'REQUESTED',
      'RECALLED',
      'EXPIRED',
      'DISMISSED',
      'DEPLETED',
    ])
      expect(isForceContractUsable({ ...active, status }, now)).toBe(false);
  });
  test('renewal charges only surviving troops and extends the original expiry', () => {
    const renewal = extendForceContract(active, 2, now);
    expect(renewal.gold).toBe(1200n);
    expect(renewal.expiresAt.getTime()).toBe(
      active.expiresAt.getTime() + 2 * FORCE_DAY_MS,
    );
    expect(active.survivingQuantity).toBe(6);
  });
  test('renewal cannot resurrect an expired/depleted contract or extend forever', () => {
    expect(() => extendForceContract(active, 1, active.expiresAt)).toThrow(
      'no longer active',
    );
    expect(() =>
      extendForceContract({ ...active, survivingQuantity: 0 }, 1, now),
    ).toThrow();
    expect(() => extendForceContract(active, 30, now)).toThrow('horizon');
    expect(() => forceExpiration(now, 1.5)).toThrow();
  });
  test('borrowers must unlock their own troop tier, including actual spy thresholds', () => {
    expect(() => assertForceTierUnlocked('OFFENSE', 2, 1)).toThrow(
      'not unlocked',
    );
    expect(() => assertForceTierUnlocked('OFFENSE', 2, 4)).not.toThrow();
    expect(() => assertForceTierUnlocked('SPY', 3, 7)).toThrow('not unlocked');
    expect(() => assertForceTierUnlocked('SPY', 3, 12)).not.toThrow();
    expect(() => assertForceTierUnlocked('OFFENSE', 4, 30)).toThrow();
  });
  test('requires a real full loadout, with no duplicate or nonexistent items', () => {
    const equipment = kit('OFFENSE');
    expect(parseForceLoadout('OFFENSE', equipment)).toHaveLength(6);
    expect(parseForceLoadout('OFFENSE', [...equipment].reverse())).toEqual(
      parseForceLoadout('OFFENSE', equipment),
    );
    expect(
      JSON.stringify(
        parseForceLoadout(
          'OFFENSE',
          equipment.map(({ type, level }) => ({ level, type })),
        ),
      ),
    ).toBe(JSON.stringify(parseForceLoadout('OFFENSE', equipment)));
    expect(() => parseForceLoadout('OFFENSE', equipment.slice(1))).toThrow(
      'every supported',
    );
    expect(() =>
      parseForceLoadout(
        'OFFENSE',
        equipment.map(() => equipment[0]),
      ),
    ).toThrow();
    expect(() =>
      parseForceLoadout(
        'OFFENSE',
        equipment.map((item) => ({ ...item, level: 20 })),
      ),
    ).toThrow('Unknown equipment');
    // Spies have no shield in the existing catalogue; do not invent one.
    expect(parseForceLoadout('SPY', kit('SPY'))).toHaveLength(5);
  });
});

describe('mercenary unlock tiers and army share', () => {
  test('each tier maps to its economy upgrade feature', () => {
    expect(mercenaryTierFeatureKey(1)).toBe('MERCENARY_HALL');
    expect(mercenaryTierFeatureKey(2)).toBe('MERCENARY_COMPANIES');
    expect(mercenaryTierFeatureKey(3)).toBe('MERCENARY_ELITE');
    expect(() => mercenaryTierFeatureKey(0)).toThrow('Invalid mercenary tier');
    expect(() => mercenaryTierFeatureKey(4)).toThrow('Invalid mercenary tier');
  });
  test('the share cap floors at half the trained army and never rounds up', () => {
    expect(MERCENARY_ARMY_SHARE_PERCENT).toBe(50);
    expect(mercenaryShareCap(0)).toBe(0);
    expect(mercenaryShareCap(1)).toBe(0);
    expect(mercenaryShareCap(2)).toBe(1);
    expect(mercenaryShareCap(199)).toBe(99);
    expect(mercenaryShareCap(200)).toBe(100);
    expect(() => mercenaryShareCap(-1)).toThrow();
    expect(() => mercenaryShareCap(1.5)).toThrow();
  });
});

describe('alliance force contribution policies', () => {
  test('loan and general tax use the higher rate, once, without floating point', () => {
    const gross = 9_007_199_254_740_993n;
    const split = splitForcePillage(gross, 500, [1000, 700]);
    expect(split.rateBps).toBe(1000);
    expect(split.contribution).toBe(gross / 10n);
    expect(split.contribution + split.net).toBe(gross);
    expect(splitForcePillage(99n, 500, [1000]).contribution).toBe(9n);
  });
  test('defensive-only loans do not raise the rate on attacks they do not join', () => {
    expect(splitForcePillage(1000n, 500, []).contribution).toBe(50n);
    expect(splitForcePillage(1000n, 0, []).contribution).toBe(0n);
    expect(() => splitForcePillage(-1n, 0, [])).toThrow();
    expect(() => splitForcePillage(100n, 10001, [])).toThrow();
  });
  test('collection, fines, automatic lending and expulsion default to disabled', () => {
    expect(DEFAULT_FORCE_POLICY.lendingMode).toBe('MANUAL');
    expect(DEFAULT_FORCE_POLICY.enforcement).toEqual({
      suspendOverdue: false,
      autoCollectAfterDays: null,
      fineGold: '0',
      expelAfterDays: null,
    });
  });
  test('rejects duplicate role rules and a fine without a collection grace period', () => {
    const allowance = {
      roleId: 1,
      maxBorrowed: 10,
      maxTermDays: 7,
      pillageRateBps: 0,
      loanRateBps: 500,
    };
    expect(() =>
      ForcePolicySchema.parse({ roleAllowances: [allowance, allowance] }),
    ).toThrow('Duplicate');
    expect(() =>
      ForcePolicySchema.parse({ enforcement: { fineGold: '50' } }),
    ).toThrow('grace');
    expect(() =>
      ForcePolicySchema.parse({
        enforcement: { autoCollectAfterDays: 3, expelAfterDays: 3 },
      }),
    ).toThrow('Expulsion');
  });
  const obligation = {
    kind: 'GOLD' as const,
    outstanding: 100n,
    dueAt: new Date(now.getTime() - 3 * FORCE_DAY_MS),
    fineAssessedAt: null,
    finalWarningAt: null,
  };
  const rules = ForcePolicySchema.parse({
    enforcement: {
      suspendOverdue: true,
      autoCollectAfterDays: 3,
      fineGold: '10',
      expelAfterDays: 5,
    },
  }).enforcement;
  test('collects only available funds, leaving a partial debt and one fixed fine', () => {
    const plan = planForceEnforcement(obligation, rules, now, true, 30n);
    expect(plan.payment).toBe(30n);
    expect(plan.remaining).toBe(70n);
    expect(plan.fineGold).toBe(10n);
    expect(plan.suspendBorrowing).toBe(true);
    expect(plan.expel).toBe(false);
    expect(
      planForceEnforcement(
        { ...obligation, fineAssessedAt: now },
        rules,
        now,
        true,
        0n,
      ).fineGold,
    ).toBe(0n);
    const settled = planForceEnforcement(
      { ...obligation, fineAssessedAt: now },
      rules,
      now,
      true,
      100n,
    );
    expect(settled.remaining).toBe(0n);
    expect(settled.overdue).toBe(false);
    expect(settled.suspendBorrowing).toBe(false);
  });
  test('never collects early, overcollects, or pursues a former member', () => {
    expect(
      planForceEnforcement(
        obligation,
        rules,
        new Date(now.getTime() - 1),
        true,
        100n,
      ).payment,
    ).toBe(0n);
    const exactDue = { ...obligation, dueAt: now };
    expect(planForceEnforcement(exactDue, rules, now, true, 100n).overdue).toBe(
      false,
    );
    expect(
      planForceEnforcement(obligation, rules, now, true, 1000n).payment,
    ).toBe(100n);
    const former = planForceEnforcement(obligation, rules, now, false, 1000n);
    expect(former.payment).toBe(0n);
    expect(former.fineGold).toBe(0n);
    expect(former.expel).toBe(false);
  });
  test('only designated troop availability counts; a gold balance is not a troop conversion', () => {
    const plan = planForceEnforcement(
      { ...obligation, kind: 'TROOPS', outstanding: 10n },
      rules,
      now,
      true,
      2n,
    );
    expect(plan.payment).toBe(2n);
    expect(plan.remaining).toBe(8n);
  });
  test('automatic expulsion needs a prior final warning and an unpaid balance', () => {
    const later = new Date(now.getTime() + 3 * FORCE_DAY_MS);
    expect(planForceEnforcement(obligation, rules, later, true, 0n).expel).toBe(
      false,
    );
    expect(
      planForceEnforcement(
        { ...obligation, finalWarningAt: now },
        rules,
        later,
        true,
        0n,
      ).expel,
    ).toBe(true);
    expect(
      planForceEnforcement(
        { ...obligation, finalWarningAt: now },
        rules,
        later,
        true,
        100n,
      ).expel,
    ).toBe(false);
  });
});
