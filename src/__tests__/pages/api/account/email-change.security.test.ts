import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { createHash } from 'crypto';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const {
  handler: requestChange,
} = require('../../../../pages/api/account/emailChange');
const {
  handler: updateEmail,
} = require('../../../../pages/api/account/update-email');
const { AccountService } = require('../../../../services/Account.service');
const argon2 = require('argon2');
const {
  AccountAnonymizationService,
} = require('@/services/AccountAnonymization.service');

const EMAIL = 'synthetic@example.invalid';
const TOKEN = 'a'.repeat(64);
let verifiedWhere: any;

beforeEach(() => {
  verifiedWhere = null;
  mockPrisma.users.findUnique = vi.fn(async ({ where }: any) =>
    where.id
      ? { id: 125, password_hash: '$argon2id$synthetic', email: EMAIL }
      : null,
  );
  mockPrisma.users.findFirst = vi.fn(async () => null);
  mockPrisma.identityBlock.findFirst = vi.fn(async () => null);
  mockPrisma.antiAbuseShadow.findFirst = vi.fn(async () => null);
  mockPrisma.users.update = vi.fn(async () => ({}));
  mockPrisma.passwordReset = {
    findFirst: vi.fn(async ({ where }: any) => {
      verifiedWhere = where;
      return { id: 42 };
    }),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  installRateLimitStore(mockPrisma, vi);
  mockPrisma.$transaction = vi.fn(async (cb: any) =>
    cb({ ...mockPrisma, $queryRaw: vi.fn(async () => [{ id: 125 }]) }),
  );
});

const createMocks = (req: any) => {
  const res: any = { statusCode: 200, json: vi.fn(), setHeader: vi.fn() };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res._getStatusCode = () => res.statusCode;
  return { req, res };
};

const callUpdate = async (newEmail = 'new@example.invalid') => {
  const { req, res } = createMocks({
    method: 'POST',
    body: {
      newEmail,
      password: 'synthetic',
      verify: TOKEN,
    },
  });
  (req as any).session = { user: { id: 125, email: EMAIL } };
  await updateEmail(req, res);
  return res;
};

describe('email change credentials', () => {
  it('rejects signed-out token requests before sending mail', async () => {
    const spy = vi.spyOn(AccountService, 'requestEmailChange');
    try {
      const { req, res } = createMocks({
        method: 'POST',
        body: { userEmail: EMAIL },
      });
      await requestChange(req, res);
      expect(res._getStatusCode()).toBe(401);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('binds token delivery to the session owner and rate limits requests', async () => {
    const spy = vi
      .spyOn(AccountService, 'requestEmailChange')
      .mockResolvedValue({ status: true });
    try {
      for (let i = 0; i < 4; i++) {
        const { req, res } = createMocks({
          method: 'POST',
          body: { userEmail: 'victim@example.invalid' },
        });
        (req as any).session = { user: { id: 125, email: EMAIL } };
        await requestChange(req, res);
        expect(res._getStatusCode()).toBe(i < 3 ? 200 : 429);
      }
      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenCalledWith({ email: EMAIL }, 125);
    } finally {
      spy.mockRestore();
    }
  });

  it('requires a hash, expiry and atomic pending-token claim', async () => {
    const spy = vi.spyOn(argon2, 'verify').mockResolvedValue(true);
    try {
      expect((await callUpdate())._getStatusCode()).toBe(200);
      expect(verifiedWhere.verificationCode).toBe(
        createHash('sha256').update(TOKEN).digest('hex'),
      );
      expect(verifiedWhere.createdAt.gt).toBeInstanceOf(Date);
      expect(verifiedWhere.type).toBe('EMAIL');
      expect(
        mockPrisma.passwordReset.updateMany.mock.calls[0][0].where,
      ).toEqual({ id: 42, userId: 125, status: 0, type: 'EMAIL' });
      mockPrisma.users.update.mockClear();
      mockPrisma.passwordReset.updateMany.mockResolvedValue({ count: 0 });
      expect((await callUpdate())._getStatusCode()).toBe(400);
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('checks retention only after code and password verification, with the same refusal as an existing address', async () => {
    const blockSpy = vi
      .spyOn(AccountAnonymizationService, 'isIdentityBlocked')
      .mockResolvedValue({ emailBlocked: true, displayNameBlocked: false });
    const passwordSpy = vi.spyOn(argon2, 'verify').mockResolvedValue(false);
    try {
      mockPrisma.passwordReset.findFirst.mockResolvedValueOnce(null);
      expect((await callUpdate())._getStatusCode()).toBe(400);
      expect(blockSpy).not.toHaveBeenCalled();
      expect((await callUpdate())._getStatusCode()).toBe(401);
      expect(blockSpy).not.toHaveBeenCalled();
      passwordSpy.mockResolvedValue(true);
      const blocked = await callUpdate();
      expect(blocked._getStatusCode()).toBe(409);
      mockPrisma.users.findFirst.mockResolvedValue({ id: 999 });
      const duplicate = await callUpdate();
      expect(duplicate.json.mock.calls[0][0]).toEqual(
        blocked.json.mock.calls[0][0],
      );
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    } finally {
      blockSpy.mockRestore();
      passwordSpy.mockRestore();
    }
  });

  it('stores trimmed lowercase email and checks existing addresses case-insensitively', async () => {
    const spy = vi.spyOn(argon2, 'verify').mockResolvedValue(true);
    try {
      expect((await callUpdate(' New@Example.Invalid '))._getStatusCode()).toBe(
        200,
      );
      expect(mockPrisma.users.findFirst).toHaveBeenCalledWith({
        where: {
          email: { equals: 'new@example.invalid', mode: 'insensitive' },
        },
        select: { id: true },
      });
      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { id: 125 },
        data: { email: 'new@example.invalid' },
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('bounds token/password guessing per account', async () => {
    mockPrisma.passwordReset.findFirst.mockResolvedValue(null);
    for (let i = 0; i < 5; i++)
      expect((await callUpdate())._getStatusCode()).toBe(400);
    expect((await callUpdate())._getStatusCode()).toBe(429);
    expect(mockPrisma.passwordReset.findFirst).toHaveBeenCalledTimes(5);
  });
});
