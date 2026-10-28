import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { getReportSharing, updateReportSharing } =
  await import('@/services/ReportSharing.service');
const { getAttackLogViewerRole } =
  await import('@/services/AttackLogAccess.service');
const LOG_ID = 900;
const ATTACKER = 11;
const DEFENDER = 12;
const RECIPIENT = 13;
let grants: any[];
let member = true;
let participant = ATTACKER;
beforeEach(() => {
  grants = [];
  member = true;
  participant = ATTACKER;
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (fn: any) => fn(mockPrisma));
  mockPrisma.era = {
    findFirst: vi.fn(async () => ({ startDate: new Date('2026-01-01') })),
  };
  mockPrisma.attack_log = {
    findUnique: vi.fn(async () => ({
      id: LOG_ID,
      attacker_id: participant,
      defender_id: DEFENDER,
      timestamp: new Date('2026-10-01'),
      acl: grants,
    })),
  };
  mockPrisma.users = { findUnique: vi.fn(async () => ({ id: RECIPIENT })) };
  const membership = () =>
    member
      ? {
          alliance: { id: 7, name: 'Test alliance', leader_id: ATTACKER },
          role: { permissions: { share_reports: true } },
        }
      : null;
  mockPrisma.alliance_memberships = {
    findMany: vi.fn(async () => (member ? [membership()] : [])),
    findUnique: vi.fn(async () => membership()),
    findFirst: vi.fn(async () => (member ? { alliance_id: 7 } : null)),
  };
  mockPrisma.attack_log_acl = {
    findMany: vi.fn(async () => grants),
    findFirst: vi.fn(async ({ where }: any) =>
      grants.find(
        (g) => g.id === where.id && g.attack_log_id === where.attack_log_id,
      ),
    ),
    createMany: vi.fn(async ({ data }: any) => {
      grants.push(...data.map((g: any) => ({ id: grants.length + 1, ...g })));
      return { count: data.length };
    }),
    delete: vi.fn(async ({ where }: any) => {
      grants = grants.filter((g) => g.id !== where.id);
    }),
    deleteMany: vi.fn(async () => {
      grants = grants.filter((g) => !g.is_public);
    }),
  };
  mockPrisma.alliance_intel_shares = {
    upsert: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  };
});

describe('participant-controlled report access', () => {
  it('denies management to a recipient even when a report is public', async () => {
    grants = [{ id: 1, attack_log_id: LOG_ID, is_public: true }];
    await expect(getReportSharing(LOG_ID, RECIPIENT)).rejects.toThrow(
      'Report not found',
    );
    for (const action of [
      { action: 'public', enabled: true },
      { action: 'player', userId: 88 },
      { action: 'revoke', grantId: 1 },
    ] as const) {
      await expect(
        updateReportSharing(LOG_ID, RECIPIENT, action),
      ).rejects.toThrow('Report not found');
    }
    expect(mockPrisma.attack_log_acl.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.attack_log_acl.delete).not.toHaveBeenCalled();
  });
  it('allows either participant to grant player access, without granting participant-only data', async () => {
    await updateReportSharing(LOG_ID, DEFENDER, {
      action: 'player',
      userId: RECIPIENT,
    });
    expect(
      await getAttackLogViewerRole(RECIPIENT, {
        id: LOG_ID,
        attacker_id: ATTACKER,
        defender_id: DEFENDER,
        acl: grants,
      }),
    ).toBe('shared');
    expect(mockPrisma.attack_log_acl.createMany).toHaveBeenCalledWith({
      data: [{ attack_log_id: LOG_ID, shared_with_user_id: RECIPIENT }],
      skipDuplicates: true,
    });
  });
  it('makes a public report anonymously readable and removes that access on revocation', async () => {
    const log = () => ({
      id: LOG_ID,
      attacker_id: ATTACKER,
      defender_id: DEFENDER,
      acl: grants,
    });
    expect(await getAttackLogViewerRole(0, log())).toBeNull();
    await updateReportSharing(LOG_ID, ATTACKER, {
      action: 'public',
      enabled: true,
    });
    expect(await getAttackLogViewerRole(0, log())).toBe('shared');
    await updateReportSharing(LOG_ID, DEFENDER, {
      action: 'public',
      enabled: false,
    });
    expect(await getAttackLogViewerRole(0, log())).toBeNull();
  });
  it('requires current alliance membership and sharing permission for alliance grants', async () => {
    member = false;
    await expect(
      updateReportSharing(LOG_ID, ATTACKER, {
        action: 'alliance',
        allianceId: 7,
      }),
    ).rejects.toThrow('permission');
    expect(mockPrisma.attack_log_acl.createMany).not.toHaveBeenCalled();
  });
  it('ends alliance access on departure and removes the feed entry when revoked', async () => {
    await updateReportSharing(LOG_ID, ATTACKER, {
      action: 'alliance',
      allianceId: 7,
    });
    const log = {
      id: LOG_ID,
      attacker_id: ATTACKER,
      defender_id: DEFENDER,
      acl: grants,
    };
    expect(await getAttackLogViewerRole(RECIPIENT, log)).toBe('shared');
    member = false;
    expect(await getAttackLogViewerRole(RECIPIENT, log)).toBeNull();
    await updateReportSharing(LOG_ID, DEFENDER, {
      action: 'revoke',
      grantId: grants[0].id,
    });
    expect(mockPrisma.alliance_intel_shares.deleteMany).toHaveBeenCalledWith({
      where: { attack_log_id: LOG_ID, alliance_id: 7 },
    });
    expect(grants).toHaveLength(0);
  });
  it('cannot revoke another report’s grant', async () => {
    grants = [
      { id: 1, attack_log_id: LOG_ID + 1, shared_with_user_id: RECIPIENT },
    ];
    await expect(
      updateReportSharing(LOG_ID, ATTACKER, { action: 'revoke', grantId: 1 }),
    ).rejects.toThrow('Share not found');
    expect(mockPrisma.attack_log_acl.delete).not.toHaveBeenCalled();
  });
  it('denies legacy-era reports and missing reports', async () => {
    mockPrisma.attack_log.findUnique.mockResolvedValue({
      attacker_id: ATTACKER,
      defender_id: DEFENDER,
      timestamp: new Date('2025-01-01'),
    });
    await expect(
      updateReportSharing(LOG_ID, ATTACKER, {
        action: 'public',
        enabled: true,
      }),
    ).rejects.toThrow('Report not found');
    mockPrisma.attack_log.findUnique.mockResolvedValue(null);
    await expect(getReportSharing(LOG_ID, ATTACKER)).rejects.toThrow(
      'Report not found',
    );
  });
});
