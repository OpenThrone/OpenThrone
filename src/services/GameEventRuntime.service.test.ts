import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

import {
  applyEventDiscount,
  combineEventEffects,
  DEFAULT_GAME_EVENT_MODIFIERS,
  multiplyCount,
  refundFromDiscountedCost,
} from '@/constants/gameEvents';

installMockPrisma(vi);
const { getGameEventModifiers, invalidateGameEventModifiers } =
  await import('@/services/GameEventRuntime.service');
const { CreateEventSchema } = await import('@/services/GameEvent.service');

const row = (config: unknown, extra: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Event',
  description: null,
  startsAt: new Date('2026-10-10T00:00:00.000Z'),
  endsAt: null,
  eraId: null,
  config,
  ...extra,
});

describe('getGameEventModifiers', () => {
  beforeEach(() => {
    invalidateGameEventModifiers();
    mockPrisma.gameEvent = { findMany: vi.fn().mockResolvedValue([]) };
  });

  it('transaction readers bypass global pending work and do not publish uncommitted effects', async () => {
    let finishGlobal: (rows: unknown[]) => void = () => undefined;
    mockPrisma.gameEvent.findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishGlobal = resolve;
        }),
    );
    const pendingGlobal = getGameEventModifiers();
    const tx = {
      gameEvent: {
        findMany: vi.fn(async () => [
          row({ citizenMultiplier: 2, citizenMultiplierScope: 'RECRUITING' }),
        ]),
      },
    };
    expect(
      (await getGameEventModifiers(tx as any)).recruitCitizenMultiplier,
    ).toBe(2);
    finishGlobal([]);
    expect((await pendingGlobal).recruitCitizenMultiplier).toBe(1);
    expect((await getGameEventModifiers()).recruitCitizenMultiplier).toBe(1);
  });

  it('combines running events and caps multipliers at ten', async () => {
    mockPrisma.gameEvent.findMany.mockResolvedValue([
      row({ goldMultiplier: 4 }),
      row({ goldMultiplier: 4 }),
      row({ xpMultiplier: 2.5 }),
      row({ xpMultiplier: 0.1 }),
      row({ xpMultiplier: 0.1 }),
    ]);

    const modifiers = await getGameEventModifiers();
    expect(modifiers.goldMultiplier).toBe(10);
    expect(modifiers.xpMultiplier).toBe(0.1);
    expect(mockPrisma.gameEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          startsAt: expect.objectContaining({ lte: expect.any(Date) }),
          type: { in: ['GOLD_MODIFIER', 'CUSTOM'] },
          AND: [
            { OR: [{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }] },
            { OR: [{ eraId: null }, { era: { endDate: null } }] },
          ],
        }),
        take: 100,
      }),
    );
  });

  it('marks daily citizen grants from era-bound events', async () => {
    mockPrisma.gameEvent.findMany.mockResolvedValue([
      row(
        { dailyCitizenBonus: 100, dailyCitizenActivityHours: 48 },
        { eraId: 2 },
      ),
      row({ dailyCitizenBonus: 50 }, { endsAt: new Date('2026-10-12') }),
    ]);

    expect((await getGameEventModifiers()).dailyCitizenGrants).toEqual([
      { amount: 100, activityHours: 48, eraBound: true },
      { amount: 50, activityHours: 24, eraBound: false },
    ]);
  });

  it('caches results and returns safe defaults when the database fails', async () => {
    mockPrisma.gameEvent.findMany.mockResolvedValue([row({ xpMultiplier: 3 })]);
    await getGameEventModifiers();
    await getGameEventModifiers();
    expect(mockPrisma.gameEvent.findMany).toHaveBeenCalledTimes(1);

    invalidateGameEventModifiers();
    mockPrisma.gameEvent.findMany.mockRejectedValue(
      new Error('synthetic database failure'),
    );
    expect(await getGameEventModifiers()).toEqual(DEFAULT_GAME_EVENT_MODIFIERS);
  });
});

describe('combineEventEffects', () => {
  it('applies the citizen multiplier to the scope the admin chose', () => {
    const daily = combineEventEffects([
      { config: { citizenMultiplier: 2, citizenMultiplierScope: 'DAILY' } },
    ]);
    expect(daily.dailyCitizenMultiplier).toBe(2);
    expect(daily.recruitCitizenMultiplier).toBe(1);

    const recruiting = combineEventEffects([
      {
        config: { citizenMultiplier: 2, citizenMultiplierScope: 'RECRUITING' },
      },
    ]);
    expect(recruiting.dailyCitizenMultiplier).toBe(1);
    expect(recruiting.recruitCitizenMultiplier).toBe(2);

    const both = combineEventEffects([{ config: { citizenMultiplier: 3 } }]);
    expect(both.dailyCitizenMultiplier).toBe(3);
    expect(both.recruitCitizenMultiplier).toBe(3);
  });

  it('adds bonus turns up to ten and compounds discounts up to 25%', () => {
    const result = combineEventEffects([
      { config: { extraTurnsPerTick: 6, unitCostDiscountPercent: 20 } },
      { config: { extraTurnsPerTick: 6, unitCostDiscountPercent: 10 } },
      { config: { armoryCostDiscountPercent: 10 } },
      { config: { armoryCostDiscountPercent: 10 } },
    ]);
    expect(result.extraTurnsPerTick).toBe(10);
    expect(result.unitCostDiscountPercent).toBe(25);
    expect(result.armoryCostDiscountPercent).toBeCloseTo(19);
  });

  it('ignores invalid or unknown effects instead of applying them', () => {
    const result = combineEventEffects([
      {
        config: {
          xpMultiplier: 50,
          unitCostDiscountPercent: 90,
          somethingElse: 3,
          goldMultiplier: 2,
        },
      },
    ]);
    expect(result.xpMultiplier).toBe(1);
    expect(result.unitCostDiscountPercent).toBe(0);
    expect(result.goldMultiplier).toBe(2);
  });
});

describe('event pricing helpers', () => {
  it('discounts integer prices and keeps refunds at 75% of the full price', () => {
    expect(applyEventDiscount(1000, 0)).toBe(1000);
    expect(applyEventDiscount(1000, 25)).toBe(750);
    expect(applyEventDiscount(999, 10)).toBe(900);
    expect(refundFromDiscountedCost(750, 25)).toBe(750);
    expect(refundFromDiscountedCost(1000, 0)).toBe(750);
  });

  it('multiplies counts fairly for fractional multipliers', () => {
    expect(multiplyCount(1, 2)).toBe(2);
    expect(multiplyCount(10, 1)).toBe(10);
    expect(multiplyCount(1, 1.5, () => 0.4)).toBe(2);
    expect(multiplyCount(1, 1.5, () => 0.6)).toBe(1);
  });
});

describe('game event validation', () => {
  const base = {
    key: 'xp-weekend',
    name: 'XP weekend',
    type: 'CUSTOM',
    startsAt: '2026-10-10T00:00:00.000Z',
    endsAt: '2026-10-11T00:00:00.000Z',
  };
  const ok = (data: Record<string, unknown>) =>
    CreateEventSchema.safeParse({ ...base, ...data }).success;

  it('accepts supported effects and rejects out-of-range or unsupported configs', () => {
    expect(ok({ config: { xpMultiplier: 2 } })).toBe(true);
    expect(
      ok({
        config: {
          citizenMultiplier: 2,
          citizenMultiplierScope: 'RECRUITING',
          extraTurnsPerTick: 1,
          unitCostDiscountPercent: 25,
        },
      }),
    ).toBe(true);
    expect(ok({ config: { xpMultiplier: 0 } })).toBe(false);
    expect(ok({ config: { unitCostDiscountPercent: 26 } })).toBe(false);
    expect(ok({ config: { extraTurnsPerTick: 11 } })).toBe(false);
    expect(ok({ config: { bogus: 1 } })).toBe(false);
    expect(ok({ type: 'TURN_MODIFIER', config: { xpMultiplier: 2 } })).toBe(
      false,
    );
  });

  it('requires an effect and either an end time or the era binding', () => {
    expect(ok({ config: {} })).toBe(false);
    expect(ok({ config: { xpMultiplier: 1 } })).toBe(false);
    expect(ok({ endsAt: null, config: { xpMultiplier: 2 } })).toBe(false);
    expect(
      ok({
        endsAt: null,
        untilEraEnd: true,
        config: { dailyCitizenBonus: 100 },
      }),
    ).toBe(true);
    expect(
      ok({ endsAt: '2026-10-09T00:00:00.000Z', config: { xpMultiplier: 2 } }),
    ).toBe(false);
  });
});
