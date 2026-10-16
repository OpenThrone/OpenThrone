import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

const logActionStrict = vi.fn(async () => undefined);
mock.module('@/utils/auditLogger', () => ({ logActionStrict }));

const { ModerationService } = require('../../services/Moderation.service');

describe('moderation service protections', () => {
  beforeEach(() => {
    resetMockPrisma();
    logActionStrict.mockClear();
  });

  it('filters administrator-only notes for moderators and scopes note deletion to the route user', async () => {
    mockPrisma.moderatorNote = {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    };

    await ModerationService.getModeratorNotes(12);
    expect(mockPrisma.moderatorNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 12, deletedAt: null, visibility: 'STAFF' },
      }),
    );

    await ModerationService.deleteModeratorNote(44, 12);
    expect(mockPrisma.moderatorNote.updateMany).toHaveBeenCalledWith({
      where: { id: 44, userId: 12, deletedAt: null, visibility: 'STAFF' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('accepts an appeal by lifting only its associated penalty and auditing in the same transaction', async () => {
    const tx: any = {
      $queryRaw: vi.fn(),
      staffRoleAssignment: {
        findMany: vi.fn(async ({ where }: any) =>
          where.userId === 5 ? [{ role: 'MODERATOR' }] : [],
        ),
      },
      permissionGrant: { findMany: vi.fn(async () => []) },
      banAppeal: {
        findUnique: vi.fn(async () => ({
          id: 81,
          userId: 12,
          accountStatusHistoryId: 64,
        })),
        update: vi.fn(async ({ data }: any) => ({ id: 81, ...data })),
      },
      accountStatusHistory: {
        findFirst: vi.fn(async () => ({
          id: 64,
          status: 'BANNED',
          end_date: new Date(Date.now() + 60_000),
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));

    await ModerationService.reviewBanAppeal(
      5,
      81,
      { status: 'ACCEPTED' },
      '192.0.2.8',
    );

    expect(tx.accountStatusHistory.updateMany).toHaveBeenCalledWith({
      where: {
        id: 64,
        user_id: 12,
        status: { in: ['BANNED', 'SUSPENDED'] },
        start_date: { lte: expect.any(Date) },
        OR: [{ end_date: null }, { end_date: { gt: expect.any(Date) } }],
      },
      data: { end_date: expect.any(Date) },
    });
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MOD_BAN_APPEAL_REVIEW',
        targetUserId: 12,
        details: expect.objectContaining({
          appealId: 81,
          liftedAccountStatusHistoryId: 64,
        }),
      }),
      tx,
    );
  });

  it('does not lift a penalty when an appeal is denied', async () => {
    const tx: any = {
      $queryRaw: vi.fn(),
      staffRoleAssignment: {
        findMany: vi.fn(async ({ where }: any) =>
          where.userId === 5 ? [{ role: 'MODERATOR' }] : [],
        ),
      },
      permissionGrant: { findMany: vi.fn(async () => []) },
      banAppeal: {
        findUnique: vi.fn(async () => ({
          id: 81,
          userId: 12,
          accountStatusHistoryId: 64,
        })),
        update: vi.fn(async () => ({ id: 81 })),
      },
      accountStatusHistory: { updateMany: vi.fn(async () => ({ count: 0 })) },
    };
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));

    await ModerationService.reviewBanAppeal(5, 81, { status: 'DENIED' });

    expect(tx.accountStatusHistory.updateMany).not.toHaveBeenCalled();
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          liftedAccountStatusHistoryId: null,
        }),
      }),
      tx,
    );
  });

  it('rejects acceptance when the appealed penalty is no longer current', async () => {
    const tx: any = {
      $queryRaw: vi.fn(),
      staffRoleAssignment: {
        findMany: vi.fn(async ({ where }: any) =>
          where.userId === 5 ? [{ role: 'MODERATOR' }] : [],
        ),
      },
      permissionGrant: { findMany: vi.fn(async () => []) },
      banAppeal: {
        findUnique: vi.fn(async () => ({
          id: 81,
          userId: 12,
          accountStatusHistoryId: 64,
        })),
        update: vi.fn(),
      },
      accountStatusHistory: {
        findFirst: vi.fn(async () => ({ id: 65, status: 'BANNED' })),
        updateMany: vi.fn(),
      },
    };
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));

    await expect(
      ModerationService.reviewBanAppeal(5, 81, { status: 'ACCEPTED' }),
    ).rejects.toMatchObject({ status: 409 });

    expect(tx.accountStatusHistory.updateMany).not.toHaveBeenCalled();
    expect(tx.banAppeal.update).not.toHaveBeenCalled();
    expect(logActionStrict).not.toHaveBeenCalled();
  });

  it('lists currently active timed penalties as well as permanent ones', async () => {
    mockPrisma.accountStatusHistory = {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 2),
    };

    await ModerationService.getBannedUsers();

    expect(mockPrisma.accountStatusHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          start_date: { lte: expect.any(Date) },
          OR: [{ end_date: null }, { end_date: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });
});
