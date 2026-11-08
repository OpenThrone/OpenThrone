import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
vi.mock('@/utils/auditLogger', () => ({
  logActionStrict: vi.fn(async () => undefined),
  logAction: vi.fn(async () => undefined),
  getRequestIp: () => '127.0.0.1',
}));
silenceLogger();
const { AuthService } = require('../Auth.service');
const { invalidateRuntimeConfigCache } = require('../RuntimeConfig.service');
const { authOptions } = require('../../pages/api/auth/[...nextauth]');

const { authorize } = authOptions.providers[0].options;
const argon2 = require('argon2');

const originalCaptcha = process.env.NEXT_PUBLIC_DISABLE_TURNSTILE;

// Synthetic fixture; this is deliberately not a real hash or account.
const account = {
  id: 126,
  email: 'player@example.com',
  display_name: 'Player',
  password_hash: 'synthetic-placeholder',
  last_active: null,
  twoFactorSecret: null,
  alliance_memberships: [],
};

describe('login with a capitalised email', () => {
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    verifySpy = vi.spyOn(argon2, 'verify').mockResolvedValue(true);
    resetMockPrisma();
    invalidateRuntimeConfigCache();
    process.env.NEXT_PUBLIC_DISABLE_TURNSTILE = 'true';
    mockPrisma.users.findUnique.mockResolvedValue(account);
    // Like Prisma, an update whose email matches no row throws.
    mockPrisma.users.update = vi.fn(async ({ where }: any) => {
      if (where.email !== undefined && where.email !== account.email) {
        throw new Error('Record to update not found.');
      }
      return account;
    });
    installRateLimitStore(mockPrisma, vi);
  });
  afterEach(() => {
    verifySpy.mockRestore();
    invalidateRuntimeConfigCache();
    if (originalCaptcha === undefined)
      delete process.env.NEXT_PUBLIC_DISABLE_TURNSTILE;
    else process.env.NEXT_PUBLIC_DISABLE_TURNSTILE = originalCaptcha;
  });

  it('signs in through NextAuth and records activity on the stored row', async () => {
    const user = await authorize(
      { email: 'Player@Example.com', password: 'synthetic-password' },
      { headers: {} },
    );
    expect(user?.id).toBe(account.id);
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: account.email } }),
    );
  });

  it('signs in through the auth service', async () => {
    const result = await AuthService.validateCredentials(
      'Player@Example.com',
      'synthetic-password',
      undefined,
      '127.0.0.1',
    );
    expect(result?.error).toBeUndefined();
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: account.email } }),
    );
  });
});
