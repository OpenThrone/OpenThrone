import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';

import * as credentialGuards from '@/utils/credentialGuards';

installMockPrisma(vi);

const statusRecord = (status: string, endDate: Date | null = null) => ({
  status,
  end_date: endDate,
  start_date: new Date(0),
});

const setStatusHistory = (record: ReturnType<typeof statusRecord> | null) => {
  mockPrisma.accountStatusHistory = {
    findFirst: vi.fn(async () => record),
    create: vi.fn(async () => ({})),
  };
};

const logAction = vi.fn();
vi.mock('@/utils/auditLogger', () => ({
  logActionStrict: vi.fn(async () => undefined),
  logAction,
  getRequestIp: () => '203.0.113.20',
}));

const {
  authOptions,
  createAuthOptions,
} = require('../../../../pages/api/auth/[...nextauth]');
const { AuthService } = require('../../../../services/Auth.service');

const { authorize } = createAuthOptions({ clientIp: '203.0.113.20' })
  .providers[0].options;
const passwordHash = require('@/lib/passwordHash');

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const PASSWORD = 'synthetic-password';

// Synthetic fixture. last_active is stale so getUpdatedStatus would rewrite CLOSED.
const account = {
  id: 301,
  email: 'gate-player@example.com',
  display_name: 'GatePlayer',
  password_hash: '$argon2id$synthetic-placeholder',
  twoFactorSecret: null as string | null,
  alliance_memberships: [],
  last_active: new Date(Date.now() - TWO_YEARS_MS),
};

const credentials = () => ({
  email: account.email,
  password: PASSWORD,
  turnstileToken: 'synthetic-turnstile-token',
});

describe('login status gate and malformed hash handling', () => {
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMockPrisma();
    installRateLimitStore(mockPrisma, vi);
    logAction.mockClear();
    delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    process.env.DISABLE_TURNSTILE = 'true';
    process.env.OT_ENFORCE_PRIVILEGED_2FA = 'false';
    mockPrisma.staffRoleAssignment.findFirst = vi.fn(async () => null);
    mockPrisma.users.findUnique = vi.fn(async () => ({ ...account }));
    mockPrisma.users.update = vi.fn(async () => account);
    mockPrisma.accountErasureRequest.findFirst = vi.fn(async () => null);
    setStatusHistory(statusRecord('ACTIVE'));
    verifySpy = vi.spyOn(passwordHash, 'verifyPassword');
  });

  afterEach(() => {
    verifySpy.mockRestore();
    delete process.env.DISABLE_TURNSTILE;
    delete process.env.OT_ENFORCE_PRIVILEGED_2FA;
  });

  it('refuses a CLOSED account with stale last_active before any status or activity write', async () => {
    setStatusHistory(statusRecord('CLOSED'));
    verifySpy.mockResolvedValue(true);

    await expect(authorize(credentials(), { headers: {} })).rejects.toThrow(
      'This account is closed',
    );
    // getUpdatedStatus would write an INACTIVE row here; the raw gate must stop first.
    expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('refuses a CLOSED account through the auth service with the same message', async () => {
    setStatusHistory(statusRecord('CLOSED'));
    verifySpy.mockResolvedValue(true);

    await expect(
      AuthService.validateCredentials(
        account.email,
        PASSWORD,
        undefined,
        '127.0.0.1',
      ),
    ).resolves.toEqual({ error: 'This account is closed' });
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
  });

  it('does not disclose service account restrictions for a wrong password', async () => {
    for (const status of ['CLOSED', 'VACATION', 'BANNED', 'SUSPENDED']) {
      setStatusHistory(statusRecord(status));
      verifySpy.mockResolvedValue(false);
      expect(
        await AuthService.validateCredentials(account.email, PASSWORD),
      ).toEqual({ error: 'Invalid username or password' });
      expect(mockPrisma.accountStatusHistory.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
    }
  });

  it('refuses a CLOSED account that holds an existing JWT', async () => {
    setStatusHistory(statusRecord('CLOSED'));

    await expect(
      authOptions.callbacks.jwt({
        token: { user: { id: account.id, email: account.email } },
        user: undefined,
      }),
    ).rejects.toThrow('Session account is no longer valid');
    expect(mockPrisma.accountStatusHistory.create).not.toHaveBeenCalled();
  });

  it('returns the generic invalid-credentials error for a malformed argon2 hash', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      ...account,
      password_hash: 'not-a-valid-hash',
    }));

    const error = await authorize(credentials(), { headers: {} }).then(
      () => null,
      (err: Error) => err,
    );
    expect(error?.message).toBe('Invalid username or password');
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('returns the generic invalid-credentials error for a malformed bcrypt hash', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      ...account,
      password_hash: '$2b$bad',
    }));

    await expect(authorize(credentials(), { headers: {} })).rejects.toThrow(
      'Invalid username or password',
    );
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('still refuses a BANNED account, revealing it only after the password matched', async () => {
    setStatusHistory(statusRecord('BANNED'));
    verifySpy.mockResolvedValue(false);
    await expect(authorize(credentials(), { headers: {} })).rejects.toThrow(
      'Invalid username or password',
    );

    verifySpy.mockResolvedValue(true);
    await expect(authorize(credentials(), { headers: {} })).rejects.toThrow(
      'This account is currently suspended or banned',
    );
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('returns no stored password hash or authenticator secret from the auth service', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      ...account,
      last_active: new Date(),
    });
    verifySpy.mockResolvedValue(true);
    const result = await AuthService.validateCredentials(
      account.email,
      PASSWORD,
    );
    expect(result.id).toBe(account.id);
    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('twoFactorSecret');
  });

  it('allows a normal ACTIVE login with a correct password', async () => {
    verifySpy.mockResolvedValue(true);

    const user = await authorize(credentials(), { headers: {} });
    expect(user).toMatchObject({ id: account.id, email: account.email });
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.users.update).toHaveBeenCalledTimes(1);
    expect(logAction).toHaveBeenCalledWith(
      account.id,
      'LOGIN',
      '203.0.113.20',
      { method: 'credentials' },
    );
  });
});

describe('login during an account-erasure grace period', () => {
  const scheduledFor = new Date('2099-01-15T12:00:00Z');
  const pendingRequest = {
    id: 40,
    userId: account.id,
    status: 'PENDING',
    closedStatusId: 7,
    scheduledFor,
  };
  let verifySpy: ReturnType<typeof vi.spyOn>;
  let restoreStore: () => void;

  beforeEach(() => {
    resetMockPrisma();
    installRateLimitStore(mockPrisma, vi);
    // The cancel path runs a locked transaction; put the shared store back after.
    const { $queryRaw } = mockPrisma;
    restoreStore = () =>
      Object.assign(mockPrisma, { $transaction: vi.fn(), $queryRaw });
    logAction.mockClear();
    process.env.DISABLE_TURNSTILE = 'true';
    process.env.OT_ENFORCE_PRIVILEGED_2FA = 'false';
    mockPrisma.staffRoleAssignment.findFirst = vi.fn(async () => null);
    mockPrisma.users.findUnique = vi.fn(async () => ({ ...account }));
    mockPrisma.users.update = vi.fn(async () => account);
    // The grace period writes a CLOSED row, so the stored status blocks login.
    setStatusHistory(statusRecord('CLOSED'));
    mockPrisma.accountErasureRequest.findFirst = vi.fn(async () => ({
      ...pendingRequest,
    }));
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrisma),
    );
    mockPrisma.$queryRaw = vi.fn(async () => [{ id: account.id }]);
    verifySpy = vi.spyOn(passwordHash, 'verifyPassword');
  });

  afterEach(() => {
    restoreStore();
    mockPrisma.accountErasureRequest.findFirst = vi.fn(async () => null);
    verifySpy.mockRestore();
    delete process.env.DISABLE_TURNSTILE;
    delete process.env.OT_ENFORCE_PRIVILEGED_2FA;
  });

  const refusal = async (extra: Record<string, string> = {}) => {
    const error = await authorize(
      { ...credentials(), ...extra },
      { headers: {} },
    ).then(
      () => null,
      (err: Error) => err,
    );
    return error;
  };

  it('offers the cancel path with the erasure date, only after the password matched', async () => {
    verifySpy.mockResolvedValue(true);
    const error = await refusal();
    expect(JSON.parse(error!.message)).toEqual({
      message: 'This account is scheduled for deletion',
      code: 'erasure',
      erasureDate: scheduledFor.toISOString(),
    });
    // Nothing is cancelled or written by a plain sign-in attempt.
    expect(mockPrisma.accountErasureRequest.update).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('reveals nothing about the erasure for a wrong password', async () => {
    verifySpy.mockResolvedValue(false);
    const error = await refusal({ cancelErasure: 'true' });
    expect(error?.message).toBe('Invalid username or password');
    expect(mockPrisma.accountErasureRequest.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accountErasureRequest.update).not.toHaveBeenCalled();
  });

  it('cancels the erasure and signs in when the password is re-proved', async () => {
    verifySpy.mockResolvedValue(true);
    mockPrisma.accountErasureRequest.findFirst
      // login lookup, then the cancel's own open-request lookup
      .mockResolvedValueOnce({ ...pendingRequest })
      .mockResolvedValueOnce({ ...pendingRequest });
    // The cancel removes the grace-period CLOSED row; the status then reads as before.
    const removeClosedRow = vi.fn(async () => {
      setStatusHistory(statusRecord('ACTIVE'));
      mockPrisma.accountStatusHistory.deleteMany = removeClosedRow;
      return { count: 1 };
    });
    mockPrisma.accountStatusHistory.deleteMany = removeClosedRow;

    const user = await authorize(
      { ...credentials(), cancelErasure: 'true' },
      { headers: {} },
    );

    expect(user).toMatchObject({ id: account.id, email: account.email });
    expect(mockPrisma.accountErasureRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 40 },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledBy: 'USER',
          userReason: null,
        }),
      }),
    );
    expect(removeClosedRow).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('verifies the single-use authenticator code once, then signs in', async () => {
    verifySpy.mockResolvedValue(true);
    mockPrisma.users.findUnique = vi.fn(async () => ({
      ...account,
      twoFactorSecret: 'synthetic-secret',
    }));
    const totp = vi.spyOn(credentialGuards, 'verifyTotpOnce');
    // A second use of the same code would be refused, as the real ledger does.
    let used = false;
    totp.mockImplementation(async () => {
      if (used) return false;
      used = true;
      return true;
    });
    mockPrisma.accountErasureRequest.findFirst
      .mockResolvedValueOnce({ ...pendingRequest })
      .mockResolvedValueOnce({ ...pendingRequest });
    mockPrisma.accountStatusHistory.deleteMany = vi.fn(async () => {
      setStatusHistory(statusRecord('ACTIVE'));
      return { count: 1 };
    });

    const user = await authorize(
      { ...credentials(), cancelErasure: 'true', totpToken: '123456' },
      { headers: {} },
    );

    expect(user).toMatchObject({ id: account.id });
    expect(totp).toHaveBeenCalledTimes(1);
    expect(mockPrisma.accountErasureRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    totp.mockRestore();
  });

  it('needs the authenticator code too before it cancels', async () => {
    verifySpy.mockResolvedValue(true);
    mockPrisma.users.findUnique = vi.fn(async () => ({
      ...account,
      twoFactorSecret: 'synthetic-secret',
    }));
    const error = await refusal({ cancelErasure: 'true' });
    expect(error?.message).toBe('2FA token required');
    expect(mockPrisma.accountErasureRequest.update).not.toHaveBeenCalled();
  });
});
