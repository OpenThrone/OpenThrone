import { afterEach, describe, expect, it, mock } from 'bun:test';

const findFirst = mock(async () => null as any);
mock.module('@/lib/prisma', () => ({
  default: { accountStatusHistory: { findFirst } },
}));

const { getTargetAvailability, UNTARGETABLE_STATUSES } =
  await import('@/services/AttackValidationService');

describe('getTargetAvailability', () => {
  afterEach(() => findFirst.mockReset());

  it('allows a player with no status row or an expired one', async () => {
    findFirst.mockResolvedValueOnce(null);
    expect(await getTargetAvailability(7)).toEqual({ ok: true, status: null });
    findFirst.mockResolvedValueOnce({
      status: 'VACATION',
      end_date: new Date(Date.now() - 1000),
    });
    expect(await getTargetAvailability(7)).toEqual({ ok: true, status: null });
  });

  it('blocks every untargetable status and allows the rest', async () => {
    for (const status of UNTARGETABLE_STATUSES) {
      findFirst.mockResolvedValueOnce({ status, end_date: null });
      expect((await getTargetAvailability(7)).ok).toBe(false);
    }
    for (const status of ['ACTIVE', 'IDLE', 'INACTIVE']) {
      findFirst.mockResolvedValueOnce({ status, end_date: null });
      expect(await getTargetAvailability(7)).toEqual({ ok: true, status });
    }
  });

  it('uses the transaction client when one is supplied', async () => {
    const txFind = mock(async () => ({ status: 'BANNED', end_date: null }));
    const tx = { accountStatusHistory: { findFirst: txFind } } as any;
    expect((await getTargetAvailability(7, tx)).ok).toBe(false);
    expect(txFind).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
