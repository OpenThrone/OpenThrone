import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { getGameEventModifiers, invalidateGameEventModifiers } =
  await import('@/services/GameEventRuntime.service');
const { CreateEventSchema } = await import('@/services/GameEvent.service');

describe('getGameEventModifiers', () => {
  beforeEach(() => {
    invalidateGameEventModifiers();
    mockPrisma.gameEvent = { findMany: vi.fn().mockResolvedValue([]) };
  });

  it('combines active supported modifiers and caps the result at ten', async () => {
    mockPrisma.gameEvent.findMany.mockResolvedValue([
      { type: 'GOLD_MODIFIER', config: { goldMultiplier: 4 } },
      { type: 'GOLD_MODIFIER', config: { goldMultiplier: 4 } },
      { type: 'CUSTOM', config: { xpMultiplier: 2.5 } },
      { type: 'CUSTOM', config: { xpMultiplier: 0.1 } },
      { type: 'CUSTOM', config: { xpMultiplier: 0.1 } },
      { type: 'TURN_MODIFIER', config: { goldMultiplier: 8, xpMultiplier: 8 } },
    ]);

    expect(await getGameEventModifiers()).toEqual({
      goldMultiplier: 10,
      xpMultiplier: 0.1,
    });
    expect(mockPrisma.gameEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          startsAt: expect.objectContaining({ lte: expect.any(Date) }),
          endsAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
        take: 100,
      }),
    );
  });

  it('caches results and returns safe defaults when the database fails', async () => {
    mockPrisma.gameEvent.findMany.mockResolvedValue([
      { type: 'CUSTOM', config: { xpMultiplier: 3 } },
    ]);
    await getGameEventModifiers();
    await getGameEventModifiers();
    expect(mockPrisma.gameEvent.findMany).toHaveBeenCalledTimes(1);

    invalidateGameEventModifiers();
    mockPrisma.gameEvent.findMany.mockRejectedValue(
      new Error('synthetic database failure'),
    );
    expect(await getGameEventModifiers()).toEqual({
      goldMultiplier: 1,
      xpMultiplier: 1,
    });
  });
});

describe('game event modifier validation', () => {
  const base = {
    key: 'xp-weekend',
    name: 'XP weekend',
    type: 'CUSTOM',
    startsAt: '2026-10-10T00:00:00.000Z',
    endsAt: '2026-10-11T00:00:00.000Z',
  };

  it('accepts supported XP modifiers and rejects out-of-range or unsupported modifier configs', () => {
    expect(
      CreateEventSchema.safeParse({ ...base, config: { xpMultiplier: 2 } })
        .success,
    ).toBe(true);
    expect(
      CreateEventSchema.safeParse({ ...base, config: { xpMultiplier: 0 } })
        .success,
    ).toBe(false);
    expect(
      CreateEventSchema.safeParse({
        ...base,
        type: 'TURN_MODIFIER',
        config: { xpMultiplier: 2 },
      }).success,
    ).toBe(false);
  });
});
