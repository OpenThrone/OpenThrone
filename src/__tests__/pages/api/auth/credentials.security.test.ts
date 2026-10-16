import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import speakeasy from 'speakeasy';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import type { RateLimitStore } from 'test/utils/rateLimitStore';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);

let currentStatus = 'ACTIVE';
function setAccountStatus(status: string) {
  currentStatus = status;
  mockPrisma.accountStatusHistory = {
    findFirst: vi.fn(async () => ({
      status: currentStatus,
      start_date: new Date(0),
      end_date: null,
    })),
    create: vi.fn(async () => ({})),
  };
}

const logAction = vi.fn();
vi.mock('@/utils/auditLogger', () => ({
  logActionStrict: vi.fn(async () => undefined),
  logAction,
  getRequestIp: () => 'unused-by-login',
}));
silenceLogger();
const {
  authOptions,
  createAuthOptions,
} = require('../../../../pages/api/auth/[...nextauth]');
const { AccountService } = require('../../../../services/Account.service');

const CLIENT_IP = '203.0.113.9';
/** authorize as built for one request from `clientIp` (see the API handler). */
const authorizeFrom = (clientIp?: string) =>
  createAuthOptions({ clientIp }).providers[0].options.authorize;
const authorize = authorizeFrom(CLIENT_IP);
const argon2 = require('argon2');

const DASHBOARD_TEST_ORIGIN = 'https://dashboard-test.openthrone.dev';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const ENV_KEYS = [
  'NEXT_PUBLIC_TURNSTILE_SECRET',
  'NEXT_PUBLIC_URL_ROOT',
  'DISABLE_TURNSTILE',
  'NEXT_PUBLIC_DISABLE_TURNSTILE',
  'NEXT_PUBLIC_USE_CAPTCHA',
  'OT_TURNSTILE_BYPASS_ORIGINS',
  'NEXT_PUBLIC_DISABLE_LOGIN',
  'OT_ENFORCE_PRIVILEGED_2FA',
] as const;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;

// Synthetic fixture; the hash is a placeholder and argon2.verify is stubbed.
const account = {
  id: 125,
  email: 'player@example.com',
  display_name: 'Player',
  password_hash: '$argon2id$synthetic-placeholder',
  twoFactorSecret: null as string | null,
  alliance_memberships: [],
  last_active: new Date(),
};

const credentials = (extra: Record<string, string> = {}) => ({
  email: account.email,
  password: 'synthetic-password',
  turnstileToken: 'synthetic-turnstile-token',
  ...extra,
});

describe('credential login hardening', () => {
  let verifySpy: ReturnType<typeof vi.spyOn>;
  let captchaFetch: ReturnType<typeof vi.fn>;
  let store: RateLimitStore;

  beforeEach(() => {
    resetMockPrisma();
    store = installRateLimitStore(mockPrisma, vi);
    setAccountStatus('ACTIVE');
    mockPrisma.staffRoleAssignment.findFirst = vi.fn(async () => null);
    logAction.mockClear();
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.OT_ENFORCE_PRIVILEGED_2FA = 'false';
    process.env.NEXT_PUBLIC_TURNSTILE_SECRET = 'synthetic-captcha-secret';
    process.env.NEXT_PUBLIC_URL_ROOT = 'http://localhost:3000';

    captchaFetch = vi.fn(
      async () => ({ json: async () => ({ success: true }) }) as any,
    );
    globalThis.fetch = captchaFetch as any;

    mockPrisma.users.findUnique = vi.fn(async () => account);
    mockPrisma.users.update = vi.fn(async () => account);
    verifySpy = vi.spyOn(argon2, 'verify').mockResolvedValue(true);
  });

  afterEach(() => {
    verifySpy.mockRestore();
    globalThis.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  describe('Turnstile', () => {
    it('does not skip captcha for a dashboard-test Origin header', async () => {
      await expect(
        authorize(credentials({ turnstileToken: '' }), {
          headers: { origin: DASHBOARD_TEST_ORIGIN },
        }),
      ).rejects.toThrow('Captcha token required');
      expect(captchaFetch).not.toHaveBeenCalled();
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('does not skip captcha for an origin previously listed in OT_TURNSTILE_BYPASS_ORIGINS', async () => {
      process.env.OT_TURNSTILE_BYPASS_ORIGINS = 'https://ops.example.com';
      await expect(
        authorize(credentials({ turnstileToken: '' }), {
          headers: { origin: 'https://ops.example.com' },
        }),
      ).rejects.toThrow('Captcha token required');
    });

    it('verifies the token server-side for a request from the dashboard origin', async () => {
      await authorize(credentials(), {
        headers: { origin: DASHBOARD_TEST_ORIGIN },
      });
      expect(captchaFetch).toHaveBeenCalledTimes(1);
    });

    it('allows login without captcha only when a server-side flag disables it', async () => {
      process.env.DISABLE_TURNSTILE = 'true';
      const user = await authorize(credentials({ turnstileToken: '' }), {
        headers: { origin: 'https://evil.example.com' },
      });
      expect(user).toMatchObject({ id: 125, email: account.email });
      expect(captchaFetch).not.toHaveBeenCalled();
    });
  });

  describe('attempt throttling', () => {
    const failFrom = async (ip: string, extra: Record<string, string> = {}) =>
      expect(
        authorizeFrom(ip)(credentials(extra), { headers: {} }),
      ).rejects.toThrow('Invalid username or password');

    it('locks one account from one IP after 10 failed passwords', async () => {
      verifySpy.mockResolvedValue(false);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await failFrom(CLIENT_IP);
      }
      await expect(authorize(credentials(), { headers: {} })).rejects.toThrow(
        'Too many login attempts',
      );
      expect(verifySpy).toHaveBeenCalledTimes(10);
      expect(logAction).not.toHaveBeenCalled();
    });

    it('does not lock the owner out from another IP', async () => {
      verifySpy.mockResolvedValue(false);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await failFrom('198.51.100.66');
      }
      verifySpy.mockResolvedValue(true);
      await expect(
        authorizeFrom(CLIENT_IP)(credentials(), { headers: {} }),
      ).resolves.toMatchObject({ id: 125 });
    });

    it('caps failures on one account across many IPs', async () => {
      verifySpy.mockResolvedValue(false);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        await failFrom(`198.51.100.${attempt + 1}`);
      }
      await expect(
        authorizeFrom('192.0.2.200')(credentials(), { headers: {} }),
      ).rejects.toThrow('Too many login attempts');
    });

    it('throttles one IP that spreads attempts across accounts', async () => {
      mockPrisma.users.findUnique = vi.fn(async () => null);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        await expect(
          authorize(credentials({ email: `guess${attempt}@example.com` }), {
            headers: {},
          }),
        ).rejects.toThrow('Invalid username or password');
      }
      await expect(
        authorize(credentials({ email: 'another@example.com' }), {
          headers: {},
        }),
      ).rejects.toThrow('Too many login attempts');
    });

    it('does not spend the budget on requests without a valid captcha', async () => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await expect(
          authorize(credentials({ turnstileToken: '' }), { headers: {} }),
        ).rejects.toThrow('Captcha token required');
      }
      captchaFetch.mockImplementation(
        async () => ({ json: async () => ({ success: false }) }) as any,
      );
      await expect(authorize(credentials(), { headers: {} })).rejects.toThrow(
        'Captcha verification failed',
      );
      expect(store.consumed).toEqual([]);
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('reserves failures in the IP, account+IP and account budgets', async () => {
      verifySpy.mockResolvedValue(false);
      await failFrom(CLIENT_IP);
      expect(store.consumed).toEqual([
        `login:fail:ip:${CLIENT_IP}`,
        `login:fail:account-ip:${account.email}:${CLIENT_IP}`,
        `login:fail:account:${account.email}`,
      ]);
      expect(store.released).toEqual([]);
    });

    it('skips the IP budgets instead of sharing one when the IP is unknown', async () => {
      verifySpy.mockResolvedValue(false);
      await failFrom(undefined as unknown as string);
      expect(store.consumed).toEqual([`login:fail:account:${account.email}`]);
    });

    it('refunds every budget on a successful login', async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await authorize(credentials(), { headers: {} });
      }
      expect(store.windowCount(`login:fail:account:${account.email}`)).toBe(0);
      expect(store.windowCount(`login:fail:ip:${CLIENT_IP}`)).toBe(0);
    });

    it('refunds partial reservations when a later bucket fails before credential checking', async () => {
      mockPrisma.$queryRaw.mockImplementationOnce(async () => [{ count: 1 }]);
      mockPrisma.$queryRaw.mockImplementationOnce(async () => {
        throw new Error('synthetic database failure');
      });

      await expect(authorize(credentials(), { headers: {} })).rejects.toThrow(
        'synthetic database failure',
      );
      expect(store.released).toEqual([`login:fail:ip:${CLIENT_IP}`]);
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('does not count the password step of a 2FA login, but counts wrong codes', async () => {
      mockPrisma.users.findUnique = vi.fn(async () => ({
        ...account,
        twoFactorSecret: TOTP_SECRET,
      }));
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await expect(authorize(credentials(), { headers: {} })).rejects.toThrow(
          '2FA token required',
        );
      }
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(
          authorize(credentials({ totpToken: '000000' }), { headers: {} }),
        ).rejects.toThrow('Invalid 2FA token');
      }
      await expect(
        authorize(credentials({ totpToken: '000000' }), { headers: {} }),
      ).rejects.toThrow('Too many login attempts');
    });
  });

  describe('account status is revealed only after the password matches', () => {
    const refusal = async (extra: Record<string, string> = {}) => {
      const error = await authorize(credentials(extra), { headers: {} }).then(
        () => null,
        (err: Error) => err,
      );
      return error?.message ?? '';
    };

    it.each(['CLOSED', 'BANNED', 'SUSPENDED', 'VACATION'])(
      'answers a wrong password for a %s account with the generic error',
      async (status) => {
        setAccountStatus(status);
        verifySpy.mockResolvedValue(false);
        expect(await refusal()).toBe('Invalid username or password');
      },
    );

    it('refuses a CLOSED account without activity writes', async () => {
      setAccountStatus('CLOSED');
      expect(JSON.parse(await refusal())).toEqual({
        message: 'This account is closed',
        code: 'closed',
      });
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
      expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
      expect(logAction).not.toHaveBeenCalled();
    });

    it('reports a ban with a code and no account id', async () => {
      setAccountStatus('BANNED');
      expect(JSON.parse(await refusal())).toEqual({
        message: 'This account is currently suspended or banned',
        code: 'restricted',
      });
    });

    it('invalidates an existing JWT for a CLOSED account', async () => {
      setAccountStatus('CLOSED');
      mockPrisma.users.findUnique = vi.fn(async () => account);
      await expect(
        authOptions.callbacks.jwt({
          token: { user: { id: 125, email: account.email } },
          user: undefined,
        }),
      ).rejects.toThrow('Session account is no longer valid');
    });
  });

  describe('ending vacation at sign-in', () => {
    let endVacation: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      setAccountStatus('VACATION');
      endVacation = vi
        .spyOn(AccountService, 'endVacation')
        .mockImplementation(async () => {
          currentStatus = 'ACTIVE';
          return { message: 'Vacation mode ended' };
        });
    });

    afterEach(() => {
      endVacation.mockRestore();
    });

    it('refuses a vacation login with a code and no account id', async () => {
      const error = await authorize(credentials(), { headers: {} }).catch(
        (err: Error) => err,
      );
      expect(JSON.parse((error as Error).message)).toEqual({
        message: 'This account is currently on vacation',
        code: 'vacation',
      });
      expect(endVacation).not.toHaveBeenCalled();
    });

    it('ends vacation and signs in once the password verifies', async () => {
      const user = await authorize(credentials({ endVacation: 'true' }), {
        headers: {},
      });
      expect(endVacation).toHaveBeenCalledWith(125);
      expect(user).toMatchObject({ id: 125 });
      expect(logAction).toHaveBeenCalledWith(125, 'LOGIN', CLIENT_IP, {
        method: 'credentials',
      });
    });

    it('does not end vacation for a wrong password', async () => {
      verifySpy.mockResolvedValue(false);
      await expect(
        authorize(credentials({ endVacation: 'true' }), { headers: {} }),
      ).rejects.toThrow('Invalid username or password');
      expect(endVacation).not.toHaveBeenCalled();
    });

    it('requires the authenticator code before ending vacation', async () => {
      mockPrisma.users.findUnique = vi.fn(async () => ({
        ...account,
        twoFactorSecret: TOTP_SECRET,
      }));
      await expect(
        authorize(credentials({ endVacation: 'true' }), { headers: {} }),
      ).rejects.toThrow('2FA token required');
      await expect(
        authorize(credentials({ endVacation: 'true', totpToken: '000000' }), {
          headers: {},
        }),
      ).rejects.toThrow('Invalid 2FA token');
      expect(endVacation).not.toHaveBeenCalled();

      const totpToken = speakeasy.totp({
        secret: TOTP_SECRET,
        encoding: 'base32',
      });
      await expect(
        authorize(credentials({ endVacation: 'true', totpToken }), {
          headers: {},
        }),
      ).resolves.toMatchObject({ id: 125 });
      expect(endVacation).toHaveBeenCalledTimes(1);
    });
  });

  describe('TOTP replay protection', () => {
    it('accepts a code once and rejects the same code when replayed', async () => {
      mockPrisma.users.findUnique = vi.fn(async () => ({
        ...account,
        twoFactorSecret: TOTP_SECRET,
      }));
      const totpToken = speakeasy.totp({
        secret: TOTP_SECRET,
        encoding: 'base32',
      });

      const first = await authorize(credentials({ totpToken }), {
        headers: {},
      });
      expect(first).toMatchObject({ id: 125 });

      await expect(
        authorize(credentials({ totpToken }), { headers: {} }),
      ).rejects.toThrow('Invalid 2FA token');
    });
  });
});
