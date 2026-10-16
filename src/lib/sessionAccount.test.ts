import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { isSessionAccountCurrent } = require('./sessionAccount');
const {
  invalidateRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');

const originalSetting = process.env.NEXT_PUBLIC_DISABLE_LOGIN;

describe('session account validation after database replacement', () => {
  beforeEach(() => {
    resetMockPrisma();
    process.env.NEXT_PUBLIC_DISABLE_LOGIN = 'false';
    invalidateRuntimeConfigCache();
  });
  afterEach(() => {
    if (originalSetting === undefined)
      delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    else process.env.NEXT_PUBLIC_DISABLE_LOGIN = originalSetting;
    invalidateRuntimeConfigCache();
  });

  it('invalidates an existing non-staff session during maintenance', async () => {
    process.env.NEXT_PUBLIC_DISABLE_LOGIN = 'true';
    invalidateRuntimeConfigCache();
    mockPrisma.users.findUnique.mockResolvedValue({
      email: 'player@example.com',
    });
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue(null);
    expect(
      await isSessionAccountCurrent({ id: 125, email: 'player@example.com' }),
    ).toBe(false);
  });

  it('retains an existing staff session during maintenance', async () => {
    process.env.NEXT_PUBLIC_DISABLE_LOGIN = 'true';
    invalidateRuntimeConfigCache();
    mockPrisma.users.findUnique.mockResolvedValue({
      email: 'staff@example.com',
    });
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue({ id: 7 });
    expect(
      await isSessionAccountCurrent({ id: 125, email: 'staff@example.com' }),
    ).toBe(true);
  });

  it('rejects an account removed by the import', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);
    expect(
      await isSessionAccountCurrent({ id: 36, email: 'old@example.com' }),
    ).toBe(false);
  });

  it('rejects an ID that now belongs to another account', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      email: 'imported@example.com',
    });
    expect(
      await isSessionAccountCurrent({ id: 36, email: 'old@example.com' }),
    ).toBe(false);
  });

  it('accepts matching identity with a numeric string ID', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      email: 'player@example.com',
    });
    expect(
      await isSessionAccountCurrent({ id: '125', email: 'Player@example.com' }),
    ).toBe(true);
    expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
      where: { id: 125 },
      select: { email: true },
    });
  });

  it('rejects malformed identities without querying the database', async () => {
    for (const value of [
      null,
      {},
      { id: '36junk', email: 'old@example.com' },
      { id: 36 },
      { id: 0, email: 'old@example.com' },
      { id: 36, email: '' },
    ]) {
      expect(await isSessionAccountCurrent(value)).toBe(false);
    }
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
  });

  it('does not misclassify a database failure as a missing account', async () => {
    mockPrisma.users.findUnique.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(
      isSessionAccountCurrent({ id: 36, email: 'old@example.com' }),
    ).rejects.toThrow('database unavailable');
  });
});
