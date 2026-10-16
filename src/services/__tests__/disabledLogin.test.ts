import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
const logAction = vi.fn();
vi.mock('@/utils/auditLogger', () => ({
  logActionStrict: vi.fn(async () => undefined),
  logAction,
  getRequestIp: () => '127.0.0.1',
}));
silenceLogger();
const { AuthService } = require('../Auth.service');
const { invalidateRuntimeConfigCache } = require('../RuntimeConfig.service');
const { authOptions } = require('../../pages/api/auth/[...nextauth]');

const { authorize } = authOptions.providers[0].options;
const argon2 = require('argon2');

const originalLogin = process.env.NEXT_PUBLIC_DISABLE_LOGIN;
const originalCaptcha = process.env.NEXT_PUBLIC_DISABLE_TURNSTILE;

// Synthetic fixture; this is deliberately not a real hash or account.
const blockedAccount = {
  id: 125,
  email: 'blocked@example.com',
  password_hash: 'synthetic-placeholder',
  last_active: null,
};

describe('blocked login has no activity side effects', () => {
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The login policy is revealed only after the password matches.
    verifySpy = vi.spyOn(argon2, 'verify').mockResolvedValue(true);
    resetMockPrisma();
    invalidateRuntimeConfigCache();
    logAction.mockClear();
    process.env.NEXT_PUBLIC_DISABLE_LOGIN = 'true';
    process.env.NEXT_PUBLIC_DISABLE_TURNSTILE = 'true';
    mockPrisma.users.findUnique.mockResolvedValue(blockedAccount);
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue(null);
    installRateLimitStore(mockPrisma, vi);
  });
  afterEach(() => {
    verifySpy.mockRestore();
    if (originalLogin === undefined)
      delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    else process.env.NEXT_PUBLIC_DISABLE_LOGIN = originalLogin;
    invalidateRuntimeConfigCache();
    if (originalCaptcha === undefined)
      delete process.env.NEXT_PUBLIC_DISABLE_TURNSTILE;
    else process.env.NEXT_PUBLIC_DISABLE_TURNSTILE = originalCaptcha;
  });

  it('rejects NextAuth credentials before status writes, password migration, activity and success logging', async () => {
    await expect(
      authorize(
        {
          email: blockedAccount.email,
          password: 'synthetic-password',
        },
        { headers: {} },
      ),
    ).rejects.toThrow('Login is disabled');
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('applies the same ordering to the auth service', async () => {
    expect(
      await AuthService.validateCredentials(
        blockedAccount.email,
        'synthetic-password',
        undefined,
        '127.0.0.1',
      ),
    ).toEqual({ error: 'Login is disabled' });
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });
});
