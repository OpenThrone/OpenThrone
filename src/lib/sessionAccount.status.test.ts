import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { isSessionAccountStatusAllowed } = require('./sessionAccount');

const findFirst = vi.fn();

describe('session status gate after a moderation change', () => {
  beforeEach(() => {
    findFirst.mockReset();
    (mockPrisma as any).accountStatusHistory = { findFirst };
  });

  const record = (status: string, endDate: Date | null = null) => {
    findFirst.mockResolvedValue({ status, end_date: endDate });
  };

  it.each(['BANNED', 'SUSPENDED', 'VACATION', 'CLOSED'])(
    'refuses a session whose latest status is %s',
    async (status) => {
      record(status);
      expect(await isSessionAccountStatusAllowed(42)).toBe(false);
    },
  );

  it('refuses a blocking status that has no end date', async () => {
    record('BANNED', null);
    expect(await isSessionAccountStatusAllowed(42)).toBe(false);
  });

  it('refuses a blocking status whose end date is still in the future', async () => {
    record('SUSPENDED', new Date(Date.now() + 60_000));
    expect(await isSessionAccountStatusAllowed(42)).toBe(false);
  });

  it('allows a suspension that has already expired', async () => {
    record('SUSPENDED', new Date(Date.now() - 60_000));
    expect(await isSessionAccountStatusAllowed(42)).toBe(true);
  });

  it.each(['ACTIVE', 'IDLE', 'INACTIVE'])('allows status %s', async (s) => {
    record(s);
    expect(await isSessionAccountStatusAllowed(42)).toBe(true);
  });

  it('allows an account with no status history', async () => {
    findFirst.mockResolvedValue(null);
    expect(await isSessionAccountStatusAllowed(42)).toBe(true);
  });

  it('queries only the latest record that has started', async () => {
    record('ACTIVE');
    await isSessionAccountStatusAllowed(42);
    const args = findFirst.mock.calls[0][0];
    expect(args.where.user_id).toBe(42);
    expect(args.where.start_date.lte).toBeInstanceOf(Date);
    expect(args.orderBy).toEqual([{ start_date: 'desc' }, { id: 'desc' }]);
  });

  it('refuses malformed user IDs without querying', async () => {
    for (const id of [0, -1, 1.5, Number.NaN]) {
      expect(await isSessionAccountStatusAllowed(id)).toBe(false);
    }
    expect(findFirst).not.toHaveBeenCalled();
  });
});
