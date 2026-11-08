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
  created_at: new Date('2026-06-15T12:00:00.000Z'),
};

/** Start of the era still running when the tests act. */
const ERA_START = new Date('2026-10-01T00:00:00.000Z');

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
    era: {
      findFirst: vi.fn(async () => ({ startDate: ERA_START })),
    },
    veteranRecord: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: 1 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    passwordReset: { deleteMany: vi.fn(async () => ({ count: 2 })) },
    apiToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
    apiClient: { updateMany: vi.fn(async () => ({ count: 1 })) },
    emailPreference: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    discordOutbox: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    discordLinkCode: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    discordLink: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    messages: { updateMany: vi.fn(async () => ({ count: 0 })) },
    chatMessage: { updateMany: vi.fn(async () => ({ count: 0 })) },
    emailOutbox: { updateMany: vi.fn(async () => ({ count: 1 })) },
    accountInactivityNotice: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    // Remaining personal data (eraseRemainingPersonalData).
    ...Object.fromEntries(
      [
        'loginEvent',
        'social',
        'post_read_status',
        'autoRecruitSession',
        'chatRoomParticipant',
        'chatMessageReaction',
        'chatMessageReadStatus',
        'chatMute',
        'apiTokenAudit',
        'accountDataExport',
        'cheatSignal',
        'moderatorNote',
        'activityDay',
        'alliance_bank_history',
        'alliance_gold_requests',
        'alliance_loans',
        'alliance_list_entries',
        'alliance_target_calls',
        'alliance_intel_shares',
      ].map((model) => [
        model,
        {
          deleteMany: vi.fn(async () => ({ count: 0 })),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      ]),
    ),
    auditLog: { updateMany: vi.fn(async () => ({ count: 0 })) },
    recruit_history: { updateMany: vi.fn(async () => ({ count: 0 })) },
    banAppeal: { updateMany: vi.fn(async () => ({ count: 0 })) },
    report: { updateMany: vi.fn(async () => ({ count: 0 })) },
    ...overrides,
  };
  return {
    ...models,
    $queryRaw: vi.fn(async () => [{ id: USER_ID }]),
    $executeRaw: vi.fn(async () => 0),
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
    for (const model of ['discordOutbox', 'discordLinkCode', 'discordLink'])
      expect(tx[model].deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    // Words the player wrote to others are erased; the rows keep their place.
    expect(tx.messages.updateMany).toHaveBeenCalledWith({
      where: { from_user_id: USER_ID },
      data: { subject: '', body: '' },
    });
    expect(tx.chatMessage.updateMany).toHaveBeenCalledWith({
      where: { senderId: USER_ID },
      data: expect.objectContaining({
        content: '',
        originalContent: null,
        deletedAt: expect.any(Date),
      }),
    });
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

  it('erases the personal data the core scrub used to leave behind', async () => {
    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'User requested deletion',
      initiatedBy: 'SELF',
    });

    expect(tx.loginEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(tx.auditLog.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { ip: '', ipHash: null, requestId: null },
    });
    // Only the recruited player's own address; a recruiter's rows hold the recruit's.
    expect(tx.recruit_history.updateMany).toHaveBeenCalledWith({
      where: { to_user: USER_ID },
      data: { ip_addr: '' },
    });
    expect(tx.social.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ playerId: USER_ID }, { friendId: USER_ID }] },
    });
    expect(tx.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { subject: '' },
    });
    expect(tx.accountDataExport.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(tx.activityDay.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    // The player's own free text in alliance records, keyed by who wrote it.
    for (const [model, column, field] of [
      ['alliance_bank_history', 'performed_by_user_id', 'notes'],
      ['alliance_gold_requests', 'requester_id', 'reason'],
      ['alliance_loans', 'borrower_id', 'reason'],
      ['alliance_list_entries', 'added_by', 'note'],
      ['alliance_target_calls', 'created_by', 'note'],
      ['alliance_intel_shares', 'shared_by', 'note'],
    ]) {
      expect(tx[model].updateMany).toHaveBeenCalledWith({
        where: { [column]: USER_ID, NOT: { [field]: null } },
        data: { [field]: null },
      });
    }
    expect(tx.users.update.mock.calls[0][0].data.anonymizedAt).toBeInstanceOf(
      Date,
    );
    // No sanction: the moderation file goes with the account.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.cheatSignal.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(tx.moderatorNote.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(tx.banAppeal.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { subject: null, body: '' },
    });
  });

  it('sees a ban through the CLOSED row an erasure grace period writes on top', async () => {
    tx.accountStatusHistory.findFirst
      .mockResolvedValueOnce({ status: 'CLOSED', end_date: null })
      .mockResolvedValueOnce({ status: 'BANNED', end_date: null });

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'User requested deletion',
      initiatedBy: 'SELF',
    });

    // The ban's email block, not the 30-day cooldown, and the moderation file stays.
    const blocks = createdBlocks(tx);
    expect(findBlock(blocks, 'SANCTION')?.expiresAt).toBeNull();
    expect(findBlock(blocks, 'DELETION_COOLDOWN')).toBeUndefined();
    expect(tx.cheatSignal.deleteMany).not.toHaveBeenCalled();
    expect(tx.accountStatusHistory.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['BANNED', 'SUSPENDED'] },
        }),
      }),
    );
  });

  it('keeps the moderation file while a sanction runs, but still erases sign-in data', async () => {
    tx.accountStatusHistory.findFirst.mockResolvedValue({
      status: 'BANNED',
      end_date: null,
    });

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'User requested deletion',
      initiatedBy: 'SELF',
    });

    expect(tx.cheatSignal.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.moderatorNote.deleteMany).not.toHaveBeenCalled();
    expect(tx.banAppeal.updateMany).not.toHaveBeenCalled();
    expect(tx.activityDay.deleteMany).toHaveBeenCalled();
    expect(tx.loginEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
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
      anonymizedAt: new Date(),
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

  it('skips accounts that are already anonymized', async () => {
    tx.users.findUnique.mockResolvedValue({
      email: `${USER_ID}-deleted@deleted.local`,
      anonymizedAt: new Date(),
    });

    await AccountAnonymizationService.recordSanctionBlock(tx, USER_ID, null);

    expect(tx.identityBlock.create).not.toHaveBeenCalled();
  });

  it('still blocks the address of a live account that is on the reserved domain', async () => {
    tx.users.findUnique.mockResolvedValue({
      email: 'old-player@deleted.local',
      anonymizedAt: null,
    });

    await AccountAnonymizationService.recordSanctionBlock(tx, USER_ID, null);

    expect(tx.identityBlock.create).toHaveBeenCalled();
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
    mockPrisma.veteranRecord.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('deletes only blocks with a past expiry and returns the count', async () => {
    const count =
      await AccountAnonymizationService.purgeExpiredIdentityBlocks();

    expect(count).toBe(4);
    const { where } = mockPrisma.identityBlock.deleteMany.mock.calls[0][0];
    expect(where.expiresAt).toBeDefined();
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
  });

  it('also purges expired veteran records and sums both counts', async () => {
    mockPrisma.veteranRecord.deleteMany.mockResolvedValue({ count: 3 });

    const count =
      await AccountAnonymizationService.purgeExpiredIdentityBlocks();

    expect(count).toBe(7);
    const { where } = mockPrisma.veteranRecord.deleteMany.mock.calls[0][0];
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
  });
});

describe('inactivity erasure veteran records', () => {
  let tx: ReturnType<typeof buildTx>;

  beforeEach(() => {
    tx = buildTx();
    passwordSpies.push(vi.spyOn(argon2, 'hash').mockResolvedValue('x'));
  });

  it('writes a VeteranRecord and no email cooldown for a clean inactivity erasure', async () => {
    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Inactive for over 18 months',
      initiatedBy: 'INACTIVITY',
    });

    const blocks = createdBlocks(tx);
    expect(findBlock(blocks, 'DELETION_COOLDOWN')).toBeUndefined();
    // The display name stays reserved as before.
    expect(findBlock(blocks, 'RESERVED_NAME')).toBeDefined();

    expect(tx.veteranRecord.upsert).toHaveBeenCalledTimes(1);
    const { where, create } = tx.veteranRecord.upsert.mock.calls[0][0];
    expect(where.emailHash).toBe(hashIdentity('EMAIL', EMAIL));
    expect(create).toEqual({
      emailHash: hashIdentity('EMAIL', EMAIL),
      displayNameHash: hashIdentity('DISPLAY_NAME', DISPLAY_NAME),
      title: 'ERA1_TESTER',
      sourceUserId: USER_ID,
      originalJoinedAt: baseUser.created_at,
      expiresAt: expect.any(Date),
    });
    expect(create.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 729 * 86400_000,
    );
    expect(create.expiresAt.getTime()).toBeLessThan(
      Date.now() + 731 * 86400_000,
    );
  });

  it('writes no record for a sanctioned account', async () => {
    tx.accountStatusHistory.findFirst.mockResolvedValue({
      status: 'BANNED',
      end_date: null,
    });

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Inactive for over 18 months',
      initiatedBy: 'INACTIVITY',
    });

    expect(tx.veteranRecord.upsert).not.toHaveBeenCalled();
    // The sanction block still applies.
    expect(findBlock(createdBlocks(tx), 'SANCTION')).toBeDefined();
    expect(findBlock(createdBlocks(tx), 'DELETION_COOLDOWN')).toBeUndefined();
  });

  it('writes no record for an account that joined after the era start', async () => {
    tx.users.findUnique.mockResolvedValue({
      ...baseUser,
      created_at: new Date('2026-10-15T12:00:00.000Z'),
    });

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Inactive for over 18 months',
      initiatedBy: 'INACTIVITY',
    });

    expect(tx.veteranRecord.upsert).not.toHaveBeenCalled();
    // The inactivity email exemption still applies without a record.
    expect(findBlock(createdBlocks(tx), 'DELETION_COOLDOWN')).toBeUndefined();
  });

  it('writes no record and keeps the cooldown for self-deletion', async () => {
    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'User requested deletion',
      initiatedBy: 'SELF',
    });

    expect(tx.veteranRecord.upsert).not.toHaveBeenCalled();
    expect(tx.era.findFirst).not.toHaveBeenCalled();
    expect(findBlock(createdBlocks(tx), 'DELETION_COOLDOWN')).toBeDefined();
  });

  it('skips the record when no era is running', async () => {
    tx.era.findFirst.mockResolvedValue(null);

    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Inactive for over 18 months',
      initiatedBy: 'INACTIVITY',
    });

    expect(tx.veteranRecord.upsert).not.toHaveBeenCalled();
  });

  it('leaves an already-claimed record untouched', async () => {
    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'Inactive for over 18 months',
      initiatedBy: 'INACTIVITY',
    });

    const { update } = tx.veteranRecord.upsert.mock.calls[0][0];
    expect(update).toEqual({});
  });

  it('erasing a returned veteran removes their claimed record and title', async () => {
    await AccountAnonymizationService.anonymizeAccount(tx, USER_ID, {
      reason: 'User requested deletion',
      initiatedBy: 'SELF',
    });

    expect(tx.veteranRecord.deleteMany).toHaveBeenCalledWith({
      where: { claimedByUserId: USER_ID },
    });
    const { data } = tx.users.update.mock.calls[0][0];
    expect(data.veteranTitle).toBeNull();
    expect(data.veteranSince).toBeNull();
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
    acceptTerms: true,
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
