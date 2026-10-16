import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import speakeasy from 'speakeasy';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';

installMockPrisma(vi);

// Spy before the handler loads: Bun copies CommonJS named exports at import time.
const nextAuthNext = require('next-auth/next');

const getServerSession = vi.spyOn(nextAuthNext, 'getServerSession');

const handler = require('../../../../pages/api/account/disable-2fa').default;
const argon2 = require('argon2');

const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const session = { user: { id: 125, email: 'player@example.com' } };
const originalPolicy = process.env.OT_ENFORCE_PRIVILEGED_2FA;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

// Synthetic fixture; the hash is a placeholder and argon2.verify is stubbed.
const enrolledAccount = {
  password_hash: '$argon2id$synthetic-placeholder',
  twoFactorSecret: TOTP_SECRET,
};

describe('disable 2FA requires proof of the account holder', () => {
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMockPrisma();
    installRateLimitStore(mockPrisma, vi);
    getServerSession.mockReset();
    getServerSession.mockResolvedValue(session);
    process.env.OT_ENFORCE_PRIVILEGED_2FA = 'false';
    mockPrisma.users.findUnique = vi.fn(async () => enrolledAccount);
    mockPrisma.users.update = vi.fn(async () => ({}));
    verifySpy = vi.spyOn(argon2, 'verify').mockResolvedValue(false);
  });

  afterEach(() => {
    verifySpy.mockRestore();
    if (originalPolicy === undefined)
      delete process.env.OT_ENFORCE_PRIVILEGED_2FA;
    else process.env.OT_ENFORCE_PRIVILEGED_2FA = originalPolicy;
  });

  it('rejects a request with neither password nor code', async () => {
    const res = makeRes();
    await handler({ method: 'POST', body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('returns 401 and keeps 2FA when the password is wrong', async () => {
    const res = makeRes();
    await handler(
      { method: 'POST', body: { password: 'wrong-password' } },
      res,
    );
    expect(verifySpy).toHaveBeenCalledWith(
      enrolledAccount.password_hash,
      'wrong-password',
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('disables 2FA when the correct password is supplied', async () => {
    verifySpy.mockResolvedValue(true);
    const res = makeRes();
    await handler(
      { method: 'POST', body: { password: 'right-password' } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: 125 },
      data: { twoFactorSecret: null },
    });
  });

  it('accepts a current authenticator code in place of the password', async () => {
    const res = makeRes();
    const totpCode = speakeasy.totp({
      secret: TOTP_SECRET,
      encoding: 'base32',
    });
    await handler({ method: 'POST', body: { totpCode } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.users.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed authenticator code without a write', async () => {
    const res = makeRes();
    await handler({ method: 'POST', body: { totpCode: 'abc' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('rate limits repeated attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await handler(
        { method: 'POST', body: { password: 'wrong-password' } },
        makeRes(),
      );
    }
    const res = makeRes();
    await handler(
      { method: 'POST', body: { password: 'wrong-password' } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(verifySpy).toHaveBeenCalledTimes(5);
  });

  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null);
    const res = makeRes();
    await handler(
      { method: 'POST', body: { password: 'right-password' } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });
});
