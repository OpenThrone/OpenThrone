import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createHash } from 'crypto';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);

// createUser drags in the whole era-reset machinery; stub the module's
// runtime exports (services in this require graph import several of them).
vi.mock('@/services/User.service', () => ({
  createUser: vi.fn(async () => ({ id: 42, display_name: 'Fresh_Commander' })),
  userExists: vi.fn(async () => false),
  updateUserAndBankHistory: vi.fn(),
  getActiveAccountStatus: vi.fn(async () => null),
  getLoginBlockingStatuses: vi.fn(async () => new Map()),
  getLoginBlockingStatus: vi.fn(async () => null),
  getUpdatedStatus: vi.fn(async () => 'ACTIVE'),
}));
silenceLogger();

const { AuthService } = require('@/services/Auth.service');
const {
  VeteranClaimService,
  VeteranClaimRefused,
} = require('@/services/VeteranClaim.service');
const emailService = require('@/services/Email.service');
const {
  invalidateRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');
const userService = require('@/services/User.service');
const { hashIdentity } = require('@/utils/identityHash');
const argon2 = require('argon2');

const EMAIL = 'returning@example.invalid';
const OLD_NAME = 'GoneCommander';
const SOURCE_USER_ID = 11;
const USER_ID = 42;
const JOINED_AT = new Date('2026-02-01T00:00:00.000Z');
const TOKEN = 'a'.repeat(64);
const RECORD = {
  id: 5,
  emailHash: hashIdentity('EMAIL', EMAIL),
  displayNameHash: hashIdentity('DISPLAY_NAME', OLD_NAME),
  title: 'ERA1_TESTER',
  sourceUserId: SOURCE_USER_ID,
  originalJoinedAt: JOINED_AT,
  expiresAt: new Date(Date.now() + 365 * 86400_000),
  claimedByUserId: null,
  claimedAt: null,
};
const NEW_USER = {
  email: EMAIL,
  display_name: 'Fresh_Commander',
  locale: 'en-US',
  veteranTitle: null,
  anonymizedAt: null,
};
const payload = {
  email: EMAIL,
  password: 'long-enough-password',
  display_name: 'Fresh_Commander',
  race: 'ELF',
  class: 'FIGHTER',
};

const spies: Array<{ mockRestore: () => void }> = [];
let sendImmediate: any;
const originalRoot = process.env.NEXT_PUBLIC_URL_ROOT;
beforeEach(() => {
  resetMockPrisma();
  invalidateRuntimeConfigCache();
  userService.createUser.mockClear();
  process.env.NEXT_PUBLIC_URL_ROOT = 'https://openthrone.test';
  spies.push(vi.spyOn(argon2, 'hash').mockResolvedValue('x'));
  sendImmediate = vi.spyOn(emailService, 'sendImmediate');
  sendImmediate.mockResolvedValue({ messageId: 'synthetic' });
  spies.push(sendImmediate);
  mockPrisma.$transaction.mockImplementation(async (callback: any) =>
    callback(mockPrisma),
  );
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.auditLog = { create: vi.fn(async () => ({ id: 1 })) };
  mockPrisma.identityBlock.findFirst.mockResolvedValue(null);
  mockPrisma.identityBlock.findUnique.mockResolvedValue({
    reason: 'RESERVED_NAME',
    sourceUserId: SOURCE_USER_ID,
  });
  mockPrisma.veteranRecord.findFirst.mockResolvedValue(RECORD);
  mockPrisma.veteranRecord.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.users.findUnique.mockResolvedValue(NEW_USER);
  mockPrisma.users.findFirst.mockResolvedValue(null);
  mockPrisma.users.update.mockResolvedValue({});
  mockPrisma.passwordReset.create.mockResolvedValue({ id: 77 });
  mockPrisma.passwordReset.findFirst.mockResolvedValue({ id: 77 });
});
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
  process.env.NEXT_PUBLIC_URL_ROOT = originalRoot;
});

describe('registerUser with a veteran record', () => {
  it('grants nothing at sign-up and emails a claim link to the address', async () => {
    await AuthService.registerUser(payload);

    expect(userService.createUser).toHaveBeenCalled();
    expect(mockPrisma.veteranRecord.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(mockPrisma.identityBlock.deleteMany).not.toHaveBeenCalled();

    // Only the hash of the token is stored; the plaintext goes in the email.
    const { data } = mockPrisma.passwordReset.create.mock.calls[0][0];
    expect(data.type).toBe('VETERAN_CLAIM');
    // The link is bound to the fingerprint of the address it was sent to.
    expect(data.oldEmail).toBe(hashIdentity('EMAIL', EMAIL));
    expect(sendImmediate).toHaveBeenCalledTimes(1);
    const mail = sendImmediate.mock.calls[0][0];
    expect(mail.to).toBe(EMAIL);
    const token = /token=([a-f0-9]{64})/.exec(mail.text)?.[1];
    expect(token).toBeDefined();
    expect(data.verificationCode).toBe(
      createHash('sha256').update(token!).digest('hex'),
    );
  });

  it('still refuses the reserved old name at sign-up', async () => {
    mockPrisma.identityBlock.findFirst.mockImplementation(
      async ({ where }: any) =>
        where.kind === 'DISPLAY_NAME' ? { id: 2 } : null,
    );

    await expect(
      AuthService.registerUser({ ...payload, display_name: OLD_NAME }),
    ).rejects.toThrow('That display name is unavailable.');
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it('sends nothing without a claimable record', async () => {
    mockPrisma.veteranRecord.findFirst.mockResolvedValue(null);

    await AuthService.registerUser(payload);

    expect(sendImmediate).not.toHaveBeenCalled();
    expect(mockPrisma.passwordReset.create).not.toHaveBeenCalled();
  });

  it('registration survives a failed claim email and voids that link', async () => {
    sendImmediate.mockRejectedValue(new Error('smtp down'));

    await expect(AuthService.registerUser(payload)).resolves.toBeDefined();
    expect(mockPrisma.passwordReset.updateMany).toHaveBeenLastCalledWith({
      where: { id: 77, status: 0 },
      data: { status: 1 },
    });
  });
});

describe('VeteranClaimService.claim', () => {
  const claim = (displayName?: string) =>
    VeteranClaimService.claim(USER_ID, TOKEN, displayName, '127.0.0.1');

  it('grants the title and join date for a valid link and uses it up', async () => {
    const result = await claim();

    const linkWhere = mockPrisma.passwordReset.findFirst.mock.calls[0][0].where;
    expect(linkWhere).toMatchObject({
      userId: USER_ID,
      type: 'VETERAN_CLAIM',
      status: 0,
      verificationCode: createHash('sha256').update(TOKEN).digest('hex'),
      oldEmail: hashIdentity('EMAIL', EMAIL),
    });
    expect(mockPrisma.veteranRecord.updateMany).toHaveBeenCalledWith({
      where: { id: RECORD.id, claimedByUserId: null },
      data: { claimedByUserId: USER_ID, claimedAt: expect.any(Date) },
    });
    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { veteranTitle: 'ERA1_TESTER', veteranSince: JOINED_AT },
    });
    expect(mockPrisma.identityBlock.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.passwordReset.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, type: 'VETERAN_CLAIM', status: 0 },
      data: { status: 1 },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    expect(result).toEqual({
      title: 'ERA1_TESTER',
      veteranSince: JOINED_AT,
      displayName: 'Fresh_Commander',
    });
  });

  it('restores the old name when it matches the erased account', async () => {
    await claim(OLD_NAME);

    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        veteranTitle: 'ERA1_TESTER',
        veteranSince: JOINED_AT,
        display_name: OLD_NAME,
      },
    });
    expect(mockPrisma.identityBlock.deleteMany).toHaveBeenCalledWith({
      where: {
        kind: 'DISPLAY_NAME',
        hash: RECORD.displayNameHash,
        reason: 'RESERVED_NAME',
        sourceUserId: SOURCE_USER_ID,
      },
    });
  });

  it.each([
    ['a name that is not the old one', 'SomeoneElse', null],
    [
      'a reservation from another erased account',
      OLD_NAME,
      { reason: 'RESERVED_NAME', sourceUserId: 999 },
    ],
  ])('refuses %s and grants nothing', async (_label, name, block) => {
    if (block) mockPrisma.identityBlock.findUnique.mockResolvedValue(block);

    const error = await claim(name).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VeteranClaimRefused);
    expect(error.code).toBe('NAME_MISMATCH');
    expect(mockPrisma.veteranRecord.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('refuses a link sent to the address the account had before an email change', async () => {
    // Link issued to A; the account now holds B, whose record is claimable.
    const ADDRESS_B = 'victim@example.invalid';
    mockPrisma.users.findUnique.mockResolvedValue({
      ...NEW_USER,
      email: ADDRESS_B,
    });
    // Like the database: an unfiltered lookup finds the row stored for A.
    mockPrisma.passwordReset.findFirst.mockImplementation(
      async ({ where }: any) =>
        where.oldEmail === undefined ||
        where.oldEmail === hashIdentity('EMAIL', EMAIL)
          ? { id: 77 }
          : null,
    );

    const error = await claim().catch((e: unknown) => e);

    expect(error.code).toBe('INVALID_LINK');
    expect(mockPrisma.veteranRecord.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown, used or expired link', async () => {
    mockPrisma.passwordReset.findFirst.mockResolvedValue(null);

    const error = await claim().catch((e: unknown) => e);

    expect(error.code).toBe('INVALID_LINK');
    expect(mockPrisma.veteranRecord.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back when another account won the record', async () => {
    mockPrisma.veteranRecord.updateMany.mockResolvedValue({ count: 0 });

    const error = await claim(OLD_NAME).catch((e: unknown) => e);

    expect(error.code).toBe('NOTHING_TO_CLAIM');
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(mockPrisma.identityBlock.deleteMany).not.toHaveBeenCalled();
  });
});
