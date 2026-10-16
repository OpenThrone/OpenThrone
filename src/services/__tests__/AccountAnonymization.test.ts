import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'bun:test';

import * as auditLogger from '@/utils/auditLogger';

import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from '../../../test/utils/mockPrisma';
import { silenceLogger } from '../../../test/utils/silenceLogger';

installMockPrisma(vi);

const logActionStrict = vi.fn(async () => undefined);
const auditSpies: Array<{ mockRestore: () => void }> = [];
beforeAll(() => {
  auditSpies.push(
    vi
      .spyOn(auditLogger, 'logActionStrict')
      .mockImplementation(logActionStrict),
    vi.spyOn(auditLogger, 'logAction').mockResolvedValue(undefined),
    vi.spyOn(auditLogger, 'getRequestIp').mockReturnValue('127.0.0.1'),
  );
});
afterAll(() => {
  for (const spy of auditSpies.splice(0)) spy.mockRestore();
});
silenceLogger();

const {
  AccountAnonymizationService,
} = require('../AccountAnonymization.service');
const { AccountService } = require('../Account.service');
const { AuthService } = require('../Auth.service');
const { invalidateRuntimeConfigCache } = require('../RuntimeConfig.service');
const { hashIdentity, legacyEmailHash } = require('@/utils/identityHash');
const argon2 = require('argon2');

const passwordSpies: Array<{ mockRestore: () => void }> = [];
afterEach(() => {
  for (const spy of passwordSpies.splice(0)) spy.mockRestore();
});

const USER_ID = 125;
const EMAIL = 'gone@example.invalid';
const DISPLAY_NAME = 'GoneCommander';

/** Minimal user row as anonymizeAccount reads it. */
const baseUser = {
  id: USER_ID,
  email: EMAIL,
  display_name: DISPLAY_NAME,
  race: 'ELF',
  colorScheme: 'ELF',
  password_hash: '$argon2id$synthetic',
};

/**
 * Transaction double exposing every model anonymizeAccount touches. Each
 * model's methods are vi.fn so tests assert calls and drive branch behavior.
 */
const buildTx = (overrides: Record<string, Record<string, any>> = {}) => {
  const models: Record<string, Record<string, any>> = {
    users: {
      findUnique: vi.fn(async () => baseUser),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    staffRoleAssignment: {
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    permissionGrant: { updateMany: vi.fn(async () => ({ count: 0 })) },
    accountStatusHistory: {
      // getActiveAccountStatus reads through the tx client.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({ id: 1 })),
    },
    identityBlock: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 1 })),
      update: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    passwordReset: { deleteMany: vi.fn(async () => ({ count: 2 })) },
    apiToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
    apiClient: { updateMany: vi.fn(async () => ({ count: 1 })) },
    emailPreference: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    emailOutbox: { updateMany: vi.fn(async () => ({ count: 1 })) },
    accountInactivityNotice: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    ...overrides,
  };
  return {
    ...models,
    $queryRaw: vi.fn(async () => [{ id: USER_ID }]),
  } as any;
};

/** Creates args captured from identityBlock.create. */
const createdBlocks = (tx: any) =>
  tx.identityBlock.create.mock.calls.map((call: any[]) => call[0].data);
const findBlock = (blocks: any[], reason: string) =>
  blocks.find((block) => block.reason === reason);

describe('AccountAnonymizationService.anonymizeAccount', () => {
  let tx: ReturnType<typeof buildTx>;

  beforeEach(() => {
    resetMockPrisma();
    logActionStrict.mockClear();
    passwordSpies.push(
      vi.spyOn(argon2, 'hash').mockResolvedValue('random-scrambled-hash'),
    );
    tx = buildTx();
  });

  it('clean account: 30-day email cooldown, permanent name reservation, scrubbed PII, CLOSED status', async () => {
    const result = await AccountAnonymizationService.anonymizeAccount(
      tx,
      USER_ID,
      { reason: 'User requested deletion', initiatedBy: 'SELF' },
    );

    expect(result.pseudonym).toMatch(/^[A-Z][a-z]+_[A-Z][a-z]+_\d{5}$/);

    const blocks = createdBlocks(tx);
    const cooldown = findBlock(blocks, 'DELETION_COOLDOWN');
    expect(cooldown).toBeDefined();
    expect(cooldown.kind).toBe('EMAIL');
    expect(cooldown.hash).toBe(hashIdentity('EMAIL', EMAIL));
    expect(cooldown.sourceUserId).toBe(USER_ID);
    expect(cooldown.expiresAt).toBeInstanceOf(Date);
    expect(cooldown.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400_000,
    );
    expect(cooldown.expiresAt.getTime()).toBeLessThan(
      Date.now() + 31 * 86400_000,
    );

    const reserved = findBlock(blocks, 'RESERVED_NAME');
    expect(reserved.kind).toBe('DISPLAY_NAME');
    expect(reserved.hash).toBe(hashIdentity('DISPLAY_NAME', DISPLAY_NAME));
    expect(reserved.expiresAt).toBeNull();

    const update = tx.users.update.mock.calls[0][0].data;
    expect(update.email).toBe(`${USER_ID}-deleted@deleted.local`);
    expect(update.display_name).toBe(result.pseudonym);
    expect(update.password_hash).toBe('random-scrambled-hash');
    expect(update.twoFactorSecret).toBeNull();
    expect(update.avatar).toBeNull();
    expect(update.bio).toBe('');
    expect(update.recruit_link).not.toBe('');

    expect(tx.passwordReset.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(tx.apiToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { client: { ownerUserId: USER_ID }, revokedAt: null },
      }),
    );
    expect(tx.emailPreference.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(tx.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: {
        toAddress: `${USER_ID}-deleted@deleted.local`,
        textBody: '',
        htmlBody: null,
        headers: expect.anything(),
      },
    });
    expect(tx.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: { in: ['PENDING', 'SENDING'] } },
      data: { status: 'SKIPPED' },
    });
    expect(tx.accountInactivityNotice.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, completedAt: null },
      data: { completedAt: expect.any(Date) },
    });

    expect(tx.accountStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: USER_ID,
          status: 'CLOSED',
        }),
      }),
    );
    expect(logActionStrict).toHaveBeenCalledTimes(1);
  });

  it('permanent ban at deletion time: SANCTION email block with null expiry', async () => {
    tx.accountStatusHistory.findFirst.mockResolvedValue({
      status: 'BANNED',
      end_date: null,
    });

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Inactive expiry',
      initiatedBy: 'INACTIVITY',
    });

    const blocks = createdBlocks(tx);
    const sanction = findBlock(blocks, 'SANCTION');
    expect(sanction).toBeDefined();
    expect(sanction.expiresAt).toBeNull();
    // A clean cooldown must not also be written for a sanctioned deletion.
    expect(findBlock(blocks, 'DELETION_COOLDOWN')).toBeUndefined();
  });

  it('timed suspension at deletion time: SANCTION expiry equals sanction end_date', async () => {
    const endDate = new Date(Date.now() + 14 * 86400_000);
    tx.accountStatusHistory.findFirst.mockResolvedValue({
      status: 'SUSPENDED',
      end_date: endDate,
    });

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Inactive expiry',
      initiatedBy: 'INACTIVITY',
    });

    const sanction = findBlock(createdBlocks(tx), 'SANCTION');
    expect(sanction.expiresAt).toBe(endDate);
  });

  it('never weakens a stronger existing block (permanent SANCTION survives a clean cooldown)', async () => {
    // Only the EMAIL lookup finds an existing block; display-name
    // reservation lookups (old name + pseudonym candidates) stay free.
    tx.identityBlock.findUnique.mockImplementation(async ({ where }: any) =>
      where.kind_hash.kind === 'EMAIL'
        ? { reason: 'SANCTION', expiresAt: null, sourceUserId: USER_ID }
        : null,
    );

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'User requested deletion',
      initiatedBy: 'SELF',
    });

    expect(tx.identityBlock.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'DELETION_COOLDOWN' }),
      }),
    );
    expect(tx.identityBlock.update).not.toHaveBeenCalled();
  });

  it('replaces an expired unpurged sanction with a fresh cooldown and source', async () => {
    tx.identityBlock.findUnique.mockImplementation(async ({ where }: any) =>
      where.kind_hash.kind === 'EMAIL'
        ? { reason: 'SANCTION', expiresAt: new Date(0), sourceUserId: 999 }
        : null,
    );
    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Delete',
      initiatedBy: 'SELF',
    });
    expect(tx.identityBlock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'DELETION_COOLDOWN',
          sourceUserId: USER_ID,
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it('a later expiry on the same reason extends the block', async () => {
    tx.identityBlock.findUnique.mockImplementation(async ({ where }: any) =>
      where.kind_hash.kind === 'EMAIL'
        ? {
            reason: 'SANCTION',
            expiresAt: new Date(Date.now() + 86400_000),
            sourceUserId: 999,
          }
        : null,
    );
    tx.accountStatusHistory.findFirst.mockResolvedValue({
      status: 'BANNED',
      end_date: null,
    });

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Inactive expiry',
      initiatedBy: 'INACTIVITY',
    });

    expect(tx.identityBlock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'SANCTION',
          expiresAt: null,
          sourceUserId: USER_ID,
        }),
      }),
    );
  });

  it('enriches a migrated block missing sourceUserId without changing its window', async () => {
    // 100 days out: stronger than the incoming 30-day cooldown, so only the
    // missing source attribution is filled in.
    const existingExpiry = new Date(Date.now() + 100 * 86400_000);
    tx.identityBlock.findUnique.mockImplementation(async ({ where }: any) =>
      where.kind_hash.kind === 'EMAIL'
        ? {
            reason: 'DELETION_COOLDOWN',
            expiresAt: existingExpiry,
            sourceUserId: null,
          }
        : null,
    );

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'User requested deletion',
      initiatedBy: 'SELF',
    });

    expect(tx.identityBlock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'DELETION_COOLDOWN',
          expiresAt: existingExpiry,
          sourceUserId: USER_ID,
        }),
      }),
    );
  });

  it('refuses staff accounts on the self path', async () => {
    tx.staffRoleAssignment.findFirst.mockResolvedValue({ id: 9 });

    await expect(
      AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
        reason: 'User requested deletion',
        initiatedBy: 'SELF',
      }),
    ).rejects.toThrow('Staff accounts must be closed by an administrator');
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('admin-initiated erasure revokes staff access instead of refusing', async () => {
    const revokeSpy = vi.fn(async () => undefined);
    // AdminService.revokeAccountAccess is exercised through its module; stub
    // the staff/grant writes it performs on the tx.
    const adminTx = buildTx({
      staffRoleAssignment: {
        findFirst: vi.fn(async () => ({ id: 9 })),
        updateMany: revokeSpy,
      },
      permissionGrant: { updateMany: vi.fn(async () => ({ count: 0 })) },
    });

    await AccountAnonymizationService.anonymizeAccount(adminTx, USER_ID, {
      reason: 'Admin erasure',
      initiatedBy: 'ADMIN',
      actorUserId: 1,
    });

    expect(revokeSpy).toHaveBeenCalled();
    expect(adminTx.accountStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ admin_id: 1, status: 'CLOSED' }),
      }),
    );
  });

  it('refuses an already anonymized account', async () => {
    tx.users.findUnique.mockResolvedValue({
      ...baseUser,
      email: `${USER_ID}-deleted@deleted.local`,
    });

    await expect(
      AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
        reason: 'again',
        initiatedBy: 'INACTIVITY',
      }),
    ).rejects.toThrow('Account is already anonymized');
  });

  it('retries pseudonym collisions against existing users and reserved names', async () => {
    // First two candidates collide with an existing user; the third is free.
    let candidateCalls = 0;
    tx.users.findFirst.mockImplementation(async () => {
      candidateCalls += 1;
      return candidateCalls <= 2 ? { id: 7 } : null;
    });
    // Every candidate must also be checked against reserved-name blocks.
    const reservedLookups: string[] = [];
    tx.identityBlock.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.kind_hash.kind === 'DISPLAY_NAME') {
        reservedLookups.push(where.kind_hash.hash);
      }
      return null;
    });

    const result = await AccountAnonymizationService.anonymizeAccount(
      tx,
      USER_ID,
      { reason: 'User requested deletion', initiatedBy: 'SELF' },
    );

    expect(candidateCalls).toBe(3);
    // One reservation lookup for the old name plus one per candidate.
    expect(reservedLookups).toHaveLength(4);
    expect(reservedLookups).toContain(
      hashIdentity('DISPLAY_NAME', result.pseudonym),
    );
    expect(result.pseudonym).toMatch(/^[A-Z][a-z]+_[A-Z][a-z]+_\d{5}$/);
    // The final name written is the collision-free candidate.
    expect(tx.users.update.mock.calls[0][0].data.display_name).toBe(
      result.pseudonym,
    );
  });
});

describe('AccountAnonymizationService.recordSanctionBlock / clearSanctionBlocks', () => {
  let tx: ReturnType<typeof buildTx>;

  beforeEach(() => {
    tx = buildTx();
    passwordSpies.push(vi.spyOn(argon2, 'hash').mockResolvedValue('x'));
  });

  it('records a permanent SANCTION block for an open-ended ban', async () => {
    await AccountAnonymizationService.recordSanctionBlock(tx, USER_ID, null);

    expect(tx.identityBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'EMAIL',
        hash: hashIdentity('EMAIL', EMAIL),
        reason: 'SANCTION',
        sourceUserId: USER_ID,
        expiresAt: null,
      }),
    });
  });

  it('records a timed SANCTION block expiring at the sanction end', async () => {
    const endDate = new Date('2027-01-01T00:00:00Z');
    await AccountAnonymizationService.recordSanctionBlock(tx, USER_ID, endDate);

    expect(tx.identityBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'SANCTION', expiresAt: endDate }),
    });
  });

  it('skips accounts whose email is already anonymized', async () => {
    tx.users.findUnique.mockResolvedValue({
      email: `${USER_ID}-deleted@deleted.local`,
    });

    await AccountAnonymizationService.recordSanctionBlock(tx, USER_ID, null);

    expect(tx.identityBlock.create).not.toHaveBeenCalled();
  });

  it('never weakens: a timed ban cannot shorten a permanent sanction block', async () => {
    tx.identityBlock.findUnique.mockResolvedValue({
      reason: 'SANCTION',
      expiresAt: null,
      sourceUserId: USER_ID,
    });

    await AccountAnonymizationService.recordSanctionBlock(
      tx,
      USER_ID,
      new Date(Date.now() + 86400_000),
    );

    expect(tx.identityBlock.update).not.toHaveBeenCalled();
  });

  it("clearSanctionBlocks deletes only this user's SANCTION email blocks", async () => {
    await AccountAnonymizationService.clearSanctionBlocks(tx, USER_ID);

    expect(tx.identityBlock.deleteMany).toHaveBeenCalledWith({
      where: {
        kind: 'EMAIL',
        hash: hashIdentity('EMAIL', EMAIL),
        reason: 'SANCTION',
        sourceUserId: USER_ID,
      },
    });
  });
});

describe('AccountAnonymizationService.isIdentityBlocked', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.identityBlock.findFirst.mockResolvedValue(null);
    mockPrisma.antiAbuseShadow.findFirst.mockResolvedValue(null);
  });

  it('blocks an email held under the new keyed hash', async () => {
    mockPrisma.identityBlock.findFirst.mockResolvedValue({ id: 1 });

    const check = await AccountAnonymizationService.isIdentityBlocked({
      email: 'gone@example.invalid',
    });

    expect(check.emailBlocked).toBe(true);
    expect(check.displayNameBlocked).toBe(false);
    const { where } = mockPrisma.identityBlock.findFirst.mock.calls[0][0];
    expect(where.hash.in).toContain(
      hashIdentity('EMAIL', 'gone@example.invalid'),
    );
    expect(where.hash.in).toContain(legacyEmailHash('gone@example.invalid'));
  });

  it('blocks an email held only in a legacy AntiAbuseShadow deletion row', async () => {
    mockPrisma.antiAbuseShadow.findFirst.mockResolvedValue({ id: 3 });

    const check = await AccountAnonymizationService.isIdentityBlocked({
      email: 'legacy@example.invalid',
    });

    expect(check.emailBlocked).toBe(true);
  });

  it('ignores expired blocks', async () => {
    mockPrisma.identityBlock.findFirst.mockResolvedValue(null);
    mockPrisma.antiAbuseShadow.findFirst.mockResolvedValue(null);

    const check = await AccountAnonymizationService.isIdentityBlocked({
      email: 'free@example.invalid',
      displayName: 'Free_Name',
    });

    expect(check).toEqual({ emailBlocked: false, displayNameBlocked: false });
  });

  it('blocks a reserved display name', async () => {
    mockPrisma.identityBlock.findFirst.mockImplementation(
      async ({ where }: any) =>
        where.kind === 'DISPLAY_NAME' ? { id: 5 } : null,
    );

    const check = await AccountAnonymizationService.isIdentityBlocked({
      displayName: 'GoneCommander',
    });

    expect(check.displayNameBlocked).toBe(true);
    expect(check.emailBlocked).toBe(false);
  });
});

describe('AccountAnonymizationService.purgeExpiredIdentityBlocks', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.identityBlock.deleteMany.mockResolvedValue({ count: 4 });
  });

  it('deletes only blocks with a past expiry and returns the count', async () => {
    const count =
      await AccountAnonymizationService.purgeExpiredIdentityBlocks();

    expect(count).toBe(4);
    const { where } = mockPrisma.identityBlock.deleteMany.mock.calls[0][0];
    expect(where.expiresAt).toBeDefined();
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
  });
});

describe('AccountService.forgetAccount (delegation)', () => {
  beforeEach(() => {
    resetMockPrisma();
    passwordSpies.push(vi.spyOn(argon2, 'verify').mockResolvedValue(true));
    passwordSpies.push(
      vi.spyOn(argon2, 'hash').mockResolvedValue('random-scrambled-hash'),
    );
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrisma),
    );
    mockPrisma.$queryRaw = vi.fn(async () => [{ id: USER_ID }]);
    mockPrisma.users.findUnique.mockResolvedValue(baseUser);
    mockPrisma.users.findFirst.mockResolvedValue(null);
    mockPrisma.users.update.mockResolvedValue({});
    mockPrisma.emailOutbox.updateMany = vi.fn(async () => ({ count: 1 }));
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue(null);
    mockPrisma.accountStatusHistory.findFirst.mockResolvedValue(null);
    mockPrisma.identityBlock.findUnique.mockResolvedValue(null);
    mockPrisma.identityBlock.create.mockResolvedValue({ id: 1 });
    mockPrisma.identityBlock.update.mockResolvedValue({});
  });

  it('verifies the password before anonymizing', async () => {
    passwordSpies.push(vi.spyOn(argon2, 'verify').mockResolvedValue(false));

    await expect(
      AccountService.forgetAccount(USER_ID, { password: 'wrong' }),
    ).rejects.toThrow('Invalid password.');
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('anonymizes via the shared service and keeps the API contract', async () => {
    const result = await AccountService.forgetAccount(USER_ID, {
      password: 'correct',
      reason: ' Leaving the game ',
    });

    expect(result.message).toBe('Account data removed successfully.');
    const update = mockPrisma.users.update.mock.calls[0][0].data;
    expect(update.email).toBe(`${USER_ID}-deleted@deleted.local`);
    expect(update.display_name).not.toBe(DISPLAY_NAME);
    expect(mockPrisma.accountStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CLOSED' }),
      }),
    );
    expect(logActionStrict).toHaveBeenCalledTimes(1);
  });

  it('no longer writes AntiAbuseShadow deletion rows', async () => {
    mockPrisma.antiAbuseShadow.upsert = vi.fn();

    await AccountService.forgetAccount(USER_ID, { password: 'correct' });

    expect(mockPrisma.antiAbuseShadow.upsert).not.toHaveBeenCalled();
  });
});

describe('AuthService.registerUser identity blocks', () => {
  beforeEach(() => {
    resetMockPrisma();
    invalidateRuntimeConfigCache();
    mockPrisma.users.count.mockResolvedValue(0);
    mockPrisma.identityBlock.findFirst.mockResolvedValue(null);
    mockPrisma.antiAbuseShadow.findFirst.mockResolvedValue(null);
  });

  const payload = {
    email: 'newbie@example.invalid',
    password: 'long-enough-password',
    display_name: 'Newbie',
    race: 'ELF',
    class: 'FIGHTER',
  };

  it('fails registration closed when identity secret configuration is missing', async () => {
    const keys = [
      'NODE_ENV',
      'IDENTITY_HASH_SECRET',
      'ANTI_ABUSE_SALT',
      'EMAIL_UNSUBSCRIBE_SECRET',
    ];
    const saved = keys.map((key) => process.env[key]);
    try {
      Object.assign(process.env, { NODE_ENV: 'staging' });
      delete process.env.IDENTITY_HASH_SECRET;
      delete process.env.ANTI_ABUSE_SALT;
      await expect(AuthService.registerUser(payload)).rejects.toThrow(
        'Registration is currently disabled',
      );
      expect(mockPrisma.identityBlock.findFirst).not.toHaveBeenCalled();
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
    }
  });

  it('surfaces missing secrets through registration as registrations_disabled instead of an opaque 500', async () => {
    const { handlePOST } = require('@/pages/api/auth/register/route');
    const keys = [
      'NODE_ENV',
      'IDENTITY_HASH_SECRET',
      'ANTI_ABUSE_SALT',
      'EMAIL_UNSUBSCRIBE_SECRET',
      'DISABLE_TURNSTILE',
    ];
    const saved = keys.map((key) => process.env[key]);
    try {
      Object.assign(process.env, {
        NODE_ENV: 'production',
        DISABLE_TURNSTILE: 'true',
      });
      delete process.env.IDENTITY_HASH_SECRET;
      delete process.env.ANTI_ABUSE_SALT;
      delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
      const res: any = { status: vi.fn(), json: vi.fn() };
      res.status.mockReturnValue(res);
      await handlePOST(res, {
        method: 'POST',
        body: payload,
        headers: {},
        socket: { remoteAddress: '192.0.2.1' },
      });
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'registrations_disabled',
      });
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
    }
  });

  it('refuses a blocked email with the generic restriction message', async () => {
    mockPrisma.identityBlock.findFirst.mockImplementation(
      async ({ where }: any) => (where.kind === 'EMAIL' ? { id: 1 } : null),
    );

    await expect(AuthService.registerUser(payload)).rejects.toThrow(
      'Account creation is temporarily restricted.',
    );
  });

  it('refuses a reserved display name with a generic message', async () => {
    mockPrisma.identityBlock.findFirst.mockImplementation(
      async ({ where }: any) =>
        where.kind === 'DISPLAY_NAME' ? { id: 2 } : null,
    );

    await expect(AuthService.registerUser(payload)).rejects.toThrow(
      'That display name is unavailable.',
    );
  });

  it('refuses an email held only by a legacy shadow deletion row', async () => {
    mockPrisma.antiAbuseShadow.findFirst.mockResolvedValue({ id: 3 });

    await expect(AuthService.registerUser(payload)).rejects.toThrow(
      'Account creation is temporarily restricted.',
    );
  });
});
