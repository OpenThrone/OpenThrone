import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

// Only the database is faked; the access rules run for real.
installMockPrisma(vi);
const {
  canReadAttackLog,
  getAttackLogViewerRole,
  getRoomShareRecipientIds,
  grantAttackLogAccessToRoom,
} = await import('@/services/AttackLogAccess.service');

// Synthetic IDs; none correspond to real players, rooms or alliances.
const ATTACKER_ID = 1;
const DEFENDER_ID = 2;
const RECIPIENT_ID = 3;
const ALLY_ID = 4;
const OUTSIDER_ID = 7;
const ALLIANCE_ID = 50;
const ROOM_ID = 42;

/** Fake membership table: user -> alliance IDs. */
let memberships: Record<number, number[]> = {};

beforeEach(() => {
  memberships = {};
  mockPrisma.alliance_memberships = {
    findFirst: vi.fn(async ({ where }: any) => {
      const ids: number[] = memberships[where.user_id] ?? [];
      const match = ids.find((id) => where.alliance_id.in.includes(id));
      return match ? { alliance_id: match } : null;
    }),
    findMany: vi.fn(async ({ where }: any) => {
      if (where.alliance_id !== undefined) {
        return where.user_id.in
          .filter((uid: number) =>
            (memberships[uid] ?? []).includes(where.alliance_id),
          )
          .map((uid: number) => ({ user_id: uid }));
      }
      return (memberships[where.user_id] ?? []).map((id) => ({
        alliance_id: id,
      }));
    }),
  };
  mockPrisma.attack_log = {
    findUnique: vi.fn(async () => ({
      attacker_id: RECIPIENT_ID,
      defender_id: DEFENDER_ID,
    })),
  };
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.attack_log_acl = {
    findMany: vi.fn(async () => []),
    createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
  };
});

const log = (acl: any[] = []) => ({
  id: 100,
  attacker_id: ATTACKER_ID,
  defender_id: DEFENDER_ID,
  acl,
});

describe('canReadAttackLog', () => {
  it('lets the attacker and defender read', async () => {
    expect(await getAttackLogViewerRole(ATTACKER_ID, log())).toBe('attacker');
    expect(await getAttackLogViewerRole(DEFENDER_ID, log())).toBe('defender');
  });

  it('lets a user the log was shared with read it', async () => {
    const acl = [
      { shared_with_user_id: RECIPIENT_ID, shared_with_alliance_id: null },
    ];
    expect(await getAttackLogViewerRole(RECIPIENT_ID, log(acl))).toBe('shared');
    expect(await canReadAttackLog(OUTSIDER_ID, log(acl))).toBe(false);
  });

  it('requires current membership of a shared alliance', async () => {
    const acl = [
      { shared_with_user_id: null, shared_with_alliance_id: ALLIANCE_ID },
    ];
    memberships[ALLY_ID] = [ALLIANCE_ID];
    expect(await canReadAttackLog(ALLY_ID, log(acl))).toBe(true);

    // Left the alliance: access ends with membership.
    memberships[ALLY_ID] = [];
    expect(await canReadAttackLog(ALLY_ID, log(acl))).toBe(false);
  });

  it('denies everyone else, including staff (no staff exemption)', async () => {
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue({ id: 1 });
    expect(await canReadAttackLog(OUTSIDER_ID, log())).toBe(false);
  });

  it('denies missing logs and invalid viewer IDs', async () => {
    expect(await canReadAttackLog(ATTACKER_ID, null)).toBe(false);
    expect(await canReadAttackLog(0, log())).toBe(false);
    expect(await canReadAttackLog(Number.NaN, log())).toBe(false);
  });

  it('loads the ACL when the caller did not include it', async () => {
    mockPrisma.attack_log_acl.findMany.mockResolvedValue([
      { shared_with_user_id: RECIPIENT_ID, shared_with_alliance_id: null },
    ]);
    const { acl: _acl, ...withoutAcl } = log();
    expect(await canReadAttackLog(RECIPIENT_ID, withoutAcl)).toBe(true);
    expect(mockPrisma.attack_log_acl.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { attack_log_id: 100 } }),
    );
  });
});

describe('room share recipients', () => {
  const setRoom = (room: any) => {
    mockPrisma.chatRoom = { findUnique: vi.fn(async () => room) };
  };

  it('rejects a sharer who is not a current participant', async () => {
    setRoom({ allianceId: null, participants: [{ userId: RECIPIENT_ID }] });
    await expect(
      getRoomShareRecipientIds(OUTSIDER_ID, ROOM_ID),
    ).rejects.toThrow('not a participant');
  });

  it('returns the other participants of a normal room', async () => {
    setRoom({
      allianceId: null,
      participants: [{ userId: RECIPIENT_ID }, { userId: ALLY_ID }],
    });
    expect(await getRoomShareRecipientIds(RECIPIENT_ID, ROOM_ID)).toEqual([
      ALLY_ID,
    ]);
  });

  it('in an alliance room, requires the sharer to be a member and skips non-members', async () => {
    setRoom({
      allianceId: ALLIANCE_ID,
      participants: [
        { userId: RECIPIENT_ID },
        { userId: ALLY_ID },
        { userId: OUTSIDER_ID },
      ],
    });
    memberships[ALLY_ID] = [ALLIANCE_ID];
    await expect(
      getRoomShareRecipientIds(RECIPIENT_ID, ROOM_ID),
    ).rejects.toThrow('not a participant');

    memberships[RECIPIENT_ID] = [ALLIANCE_ID];
    expect(await getRoomShareRecipientIds(RECIPIENT_ID, ROOM_ID)).toEqual([
      ALLY_ID,
    ]);
  });

  it('grants only recipients who lack access', async () => {
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (operation: any) =>
      operation(mockPrisma),
    );
    setRoom({
      allianceId: null,
      participants: [
        { userId: RECIPIENT_ID },
        { userId: ALLY_ID },
        { userId: OUTSIDER_ID },
      ],
    });
    mockPrisma.attack_log_acl.findMany.mockResolvedValue([
      { shared_with_user_id: ALLY_ID },
    ]);
    const result = await grantAttackLogAccessToRoom(100, RECIPIENT_ID, ROOM_ID);
    expect(result).toEqual({
      newUserIds: [OUTSIDER_ID],
      existingUserIds: [ALLY_ID],
    });
    expect(mockPrisma.attack_log_acl.createMany).toHaveBeenCalledWith({
      data: [{ attack_log_id: 100, shared_with_user_id: OUTSIDER_ID }],
      skipDuplicates: true,
    });
  });
});
