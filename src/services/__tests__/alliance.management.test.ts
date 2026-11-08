import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceService } = await import('../Alliance.service');
const { AllianceWarService } = await import('../AllianceWar.service');
const recompute = await import('@/utils/adminRecomputeStats');
let recomputeSpy: ReturnType<typeof vi.spyOn>;

afterEach(() => recomputeSpy.mockRestore());

// Synthetic alliance (#66): leader 5; officer 6 (rank 0); sergeant 7
// (rank 1); members 8 and 9 hold the default Member rank (rank 2).
const ALLIANCE_ID = 3;
const LEADER = 5;
const OFFICER = 6;
const SERGEANT = 7;
const MEMBER = 8;
const MEMBER_2 = 9;

const ROLES = {
  officer: {
    id: 10,
    name: 'Officer',
    alliance_id: ALLIANCE_ID,
    rank_order: 0,
    permissions: { kick_member: true, grant_access: true, edit_ranks: true },
  },
  sergeant: {
    id: 11,
    name: 'Sergeant',
    alliance_id: ALLIANCE_ID,
    rank_order: 1,
    permissions: { kick_member: true, grant_access: true },
  },
  member: {
    id: 12,
    name: 'Member',
    alliance_id: ALLIANCE_ID,
    rank_order: 2,
    permissions: { send_messages: true, manage_enemies: true },
  },
};

const MEMBERSHIPS: Record<number, keyof typeof ROLES> = {
  [LEADER]: 'member',
  [OFFICER]: 'officer',
  [SERGEANT]: 'sergeant',
  [MEMBER]: 'member',
  [MEMBER_2]: 'member',
};

let alliance: Record<string, any>;

const membershipFor = (userId: number) => {
  const roleKey = MEMBERSHIPS[userId];
  if (!roleKey) return null;
  const role = ROLES[roleKey];
  return {
    id: 100 + userId,
    alliance_id: ALLIANCE_ID,
    user_id: userId,
    role_id: role.id,
    role,
    alliance,
  };
};

beforeEach(() => {
  recomputeSpy = vi
    .spyOn(recompute, 'recomputeStoredStatsInTx')
    .mockResolvedValue({
      offense: 0,
      defense: 0,
      spy: 0,
      sentry: 0,
      killingStrength: 0,
      defenseStrength: 0,
    });
  alliance = {
    id: ALLIANCE_ID,
    name: 'Synthetic Pact',
    leader_id: LEADER,
    gold_in_bank: 0n,
  };
  mockPrisma.alliance_gold_requests = {
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) =>
    operation(mockPrisma),
  );
  mockPrisma.chatRoom = {
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.chatRoomParticipant = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.attack_log_acl = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.alliances = {
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === ALLIANCE_ID ? alliance : { id: where.id, name: 'Rival' },
    ),
    delete: vi.fn(async () => alliance),
  };
  mockPrisma.alliance_wars = {
    findFirst: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async ({ data }: any) => ({ id: 1, ...data })),
  };
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(async ({ where }: any) =>
      membershipFor(where.unique_alliance_user.user_id),
    ),
    findFirst: vi.fn(async ({ where }: any) => membershipFor(where.user_id)),
    findMany: vi.fn(async () =>
      Object.keys(MEMBERSHIPS).map((id) => ({ user_id: Number(id) })),
    ),
    delete: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    update: vi.fn(async ({ data }: any) => data),
    count: vi.fn(async () => 0),
  };
  mockPrisma.alliance_roles = {
    findFirst: vi.fn(
      async ({ where }: any) =>
        Object.values(ROLES).find(
          (role) =>
            role.id === where.id && role.alliance_id === where.alliance_id,
        ) ?? null,
    ),
    findMany: vi.fn(async () => Object.values(ROLES)),
    create: vi.fn(async ({ data }: any) => ({ id: 99, ...data })),
    update: vi.fn(async ({ data }: any) => data),
    updateMany: vi.fn(async () => ({ count: 1 })),
    delete: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
});

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

describe('leaving an alliance', () => {
  it('refuses to let the leader leave', async () => {
    expect(
      await reason(
        AllianceService.leaveAlliance(LEADER, { allianceId: ALLIANCE_ID }),
      ),
    ).toContain('Transfer leadership or disband');
    expect(mockPrisma.alliance_memberships.delete).not.toHaveBeenCalled();
  });

  it('lets a member leave', async () => {
    expect(
      await reason(
        AllianceService.leaveAlliance(MEMBER, { allianceId: ALLIANCE_ID }),
      ),
    ).toBeNull();
    expect(mockPrisma.alliance_memberships.delete).toHaveBeenCalledTimes(1);
    expect(recomputeSpy).toHaveBeenCalledWith(mockPrisma, MEMBER);
    expect(
      mockPrisma.forceContract.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(recomputeSpy.mock.invocationCallOrder[0]);
  });
});

describe('kicking members', () => {
  const kick = (kickerId: number, memberId: number) =>
    reason(
      AllianceService.kickMember(ALLIANCE_ID, kickerId, {
        allianceId: ALLIANCE_ID,
        memberId,
      }),
    );

  it('requires the kick_member permission', async () => {
    expect(await kick(MEMBER, MEMBER_2)).toBe(
      'You do not have permission to kick members',
    );
  });

  it('only allows kicking strictly lower ranks', async () => {
    expect(await kick(SERGEANT, OFFICER)).toBe(
      'You can only kick members ranked below you',
    );
    expect(mockPrisma.alliance_memberships.delete).not.toHaveBeenCalled();
    expect(await kick(SERGEANT, MEMBER)).toBeNull();
    expect(mockPrisma.alliance_memberships.delete).toHaveBeenCalledTimes(1);
  });

  it('never kicks the leader or yourself', async () => {
    expect(await kick(OFFICER, LEADER)).toBe('Cannot kick the alliance leader');
    expect(await kick(OFFICER, OFFICER)).toContain('cannot kick yourself');
  });

  it('lets the leader kick anyone else', async () => {
    expect(await kick(LEADER, OFFICER)).toBeNull();
    expect(recomputeSpy).toHaveBeenCalledWith(mockPrisma, OFFICER);
    expect(
      mockPrisma.forceContract.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(recomputeSpy.mock.invocationCallOrder[0]);
  });
});

describe('changing member ranks', () => {
  const assign = (actorId: number, userId: number, roleId: number) =>
    reason(
      AllianceService.changeMemberRole(actorId, {
        allianceId: ALLIANCE_ID,
        userId,
        roleId,
      }),
    );

  it('requires grant_access', async () => {
    expect(await assign(MEMBER, MEMBER_2, ROLES.member.id)).toBe(
      'You do not have permission to change ranks',
    );
  });

  it('cannot touch members at or above your rank', async () => {
    expect(await assign(SERGEANT, OFFICER, ROLES.member.id)).toBe(
      'You can only change the rank of members below you',
    );
  });

  it('cannot assign a rank equal to or above your own', async () => {
    expect(await assign(SERGEANT, MEMBER, ROLES.sergeant.id)).toBe(
      'You can only assign ranks below your own',
    );
    expect(await assign(OFFICER, MEMBER, ROLES.sergeant.id)).toBeNull();
    expect(mockPrisma.alliance_memberships.update).toHaveBeenCalledTimes(1);
  });

  it('lets the leader assign any rank', async () => {
    expect(await assign(LEADER, MEMBER, ROLES.officer.id)).toBeNull();
  });
});

describe('rank permissions', () => {
  it('cannot grant a permission you do not hold', async () => {
    expect(
      await reason(
        AllianceService.updateRole(ALLIANCE_ID, ROLES.sergeant.id, OFFICER, {
          permissions: { declare_war: true },
        }),
      ),
    ).toBe('You cannot grant a permission you do not have');
    expect(
      await reason(
        AllianceService.createRole(ALLIANCE_ID, OFFICER, {
          allianceId: ALLIANCE_ID,
          name: 'Scout',
          permissions: { manage_bank: true },
        }),
      ),
    ).toBe('You cannot grant a permission you do not have');
  });

  it('allows granting held permissions on lower ranks only', async () => {
    expect(
      await reason(
        AllianceService.updateRole(ALLIANCE_ID, ROLES.sergeant.id, OFFICER, {
          permissions: { edit_ranks: true },
        }),
      ),
    ).toBeNull();
    expect(
      await reason(
        AllianceService.updateRole(ALLIANCE_ID, ROLES.officer.id, OFFICER, {
          name: 'Captain',
        }),
      ),
    ).toBe('You can only edit ranks below your own');
  });

  it('never deletes the default Member rank', async () => {
    expect(
      await reason(
        AllianceService.deleteRole(ALLIANCE_ID, ROLES.member.id, LEADER),
      ),
    ).toBe('The default Member rank cannot be deleted');
  });
});

describe('disbanding', () => {
  it('rejects a wrong confirmation name', async () => {
    expect(
      await reason(
        AllianceService.deleteAlliance(ALLIANCE_ID, LEADER, 'synthetic pact'),
      ),
    ).toBe('Type the alliance name exactly to disband it');
    expect(mockPrisma.alliances.delete).not.toHaveBeenCalled();
  });

  it('is leader only', async () => {
    expect(
      await reason(
        AllianceService.deleteAlliance(ALLIANCE_ID, OFFICER, 'Synthetic Pact'),
      ),
    ).toBe('Alliance not found or you are not the leader');
  });

  it.each(['disband', 'admin dissolve'])(
    'recomputes each borrower once on %s',
    async (action) => {
      mockPrisma.forceContract.findMany = vi.fn(async ({ where }: any) =>
        where.status
          ? []
          : [
              { id: 1, userId: MEMBER },
              { id: 2, userId: MEMBER },
              { id: 3, userId: MEMBER_2 },
            ],
      );
      mockPrisma.forceLedgerArchive = { create: vi.fn(async () => ({})) };
      for (const model of [
        'forceEvent',
        'forceObligation',
        'forceDuesRule',
        'forceReserve',
        'allianceForcePolicy',
      ])
        mockPrisma[model].deleteMany = vi.fn(async () => ({ count: 0 }));
      if (action === 'disband')
        await AllianceService.deleteAlliance(
          ALLIANCE_ID,
          LEADER,
          'Synthetic Pact',
        );
      else
        await AllianceService.adminDissolveAlliance(
          ALLIANCE_ID,
          async () => {},
        );
      expect(recomputeSpy).toHaveBeenCalledTimes(2);
      expect(recomputeSpy).toHaveBeenNthCalledWith(1, mockPrisma, MEMBER);
      expect(recomputeSpy).toHaveBeenNthCalledWith(2, mockPrisma, MEMBER_2);
    },
  );

  it('removes dependent rows before the alliance', async () => {
    expect(
      await reason(
        AllianceService.deleteAlliance(ALLIANCE_ID, LEADER, 'Synthetic Pact'),
      ),
    ).toBeNull();
    expect(mockPrisma.alliance_memberships.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.alliance_roles.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.alliance_wars.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.alliances.delete).toHaveBeenCalledTimes(1);
  });
});

describe('declaring war', () => {
  const declare = (declarerUserId: number) =>
    reason(
      AllianceWarService.declareWar({
        allianceId: ALLIANCE_ID,
        defenderAllianceId: 4,
        declarerUserId,
      }),
    );

  it('requires declare_war; manage_enemies is no longer enough', async () => {
    expect(await declare(MEMBER)).toBe(
      'You do not have permission to declare war',
    );
    expect(mockPrisma.alliance_wars.create).not.toHaveBeenCalled();
  });

  it('lets the leader declare war', async () => {
    expect(await declare(LEADER)).toBeNull();
    expect(mockPrisma.alliance_wars.create).toHaveBeenCalledTimes(1);
  });
});

describe('erasure leaves every alliance (#318)', () => {
  const allianceLoanService = require('@/services/AllianceLoan.service');
  const DAY = 86_400_000;
  let auditCreate: ReturnType<typeof vi.fn>;
  let remaining: Array<{
    user_id: number;
    created_at: Date;
    role: { rank_order: number };
  }>;
  let settleLoansSpy: ReturnType<typeof vi.spyOn>;
  const restore: Array<ReturnType<typeof vi.spyOn>> = [];

  const member = (
    userId: number,
    rankOrder: number,
    joinedDaysAgo: number,
  ) => ({
    user_id: userId,
    created_at: new Date(Date.now() - joinedDaysAgo * DAY),
    role: { rank_order: rankOrder },
  });

  beforeEach(() => {
    remaining = [];
    auditCreate = vi.fn(async () => ({}));
    mockPrisma.auditLog = { create: auditCreate };
    mockPrisma.alliance_loans = {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }: any) => data),
    };
    mockPrisma.alliances = {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === ALLIANCE_ID ? alliance : null,
      ),
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async ({ data }: any) => data),
      delete: vi.fn(async () => alliance),
    };
    mockPrisma.alliance_memberships.findMany = vi.fn(async ({ where }: any) => {
      if (typeof where.user_id === 'number')
        return [{ alliance_id: ALLIANCE_ID }];
      return where.user_id && where.user_id.not !== undefined
        ? remaining
        : [{ user_id: LEADER }];
    });
    settleLoansSpy = vi
      .spyOn(allianceLoanService, 'settleLoansOnExit')
      .mockResolvedValue(undefined);
    restore.push(settleLoansSpy);
  });

  afterEach(() => {
    while (restore.length) restore.pop()!.mockRestore();
  });

  it('ranks succession candidates by role, then tenure, then id', async () => {
    const { rankSuccessionCandidates } = await import('../Alliance.service');
    const at = (days: number) => new Date(Date.now() - days * DAY);
    const candidates = [
      member(MEMBER_2, 2, 1),
      member(MEMBER, 2, 30),
      member(SERGEANT, 1, 90),
      member(OFFICER, 0, 365),
    ];
    expect(rankSuccessionCandidates(candidates).map((m) => m.user_id)).toEqual([
      OFFICER,
      SERGEANT,
      MEMBER,
      MEMBER_2,
    ]);
    // Same role: earliest join wins; a total order falls back to the id.
    const tied = [member(9, 2, 5), member(8, 2, 5), member(7, 2, 50)];
    expect(rankSuccessionCandidates(tied).map((m) => m.user_id)).toEqual([
      7, 8, 9,
    ]);
  });

  it('succeeds an erased leader with the highest-ranked member', async () => {
    remaining = [
      member(OFFICER, 0, 5),
      member(SERGEANT, 1, 30),
      member(MEMBER, 2, 90),
    ];
    await AllianceService.leaveAllAlliancesOnErasure(mockPrisma, LEADER);
    expect(mockPrisma.alliances.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ALLIANCE_ID, leader_id: LEADER },
        data: { leader_id: OFFICER },
      }),
    );
    expect(mockPrisma.alliances.delete).not.toHaveBeenCalled();
    expect(mockPrisma.alliance_memberships.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alliance_id: ALLIANCE_ID, user_id: LEADER },
      }),
    );
    expect(settleLoansSpy).toHaveBeenCalledWith(
      mockPrisma,
      ALLIANCE_ID,
      LEADER,
      'erasure',
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ALLIANCE_LEADER_SUCCEEDED_ON_ERASURE',
          entityId: ALLIANCE_ID,
        }),
      }),
    );
  });

  it('breaks role ties with the longest-standing member', async () => {
    remaining = [member(MEMBER, 2, 10), member(MEMBER_2, 2, 3)];
    await AllianceService.leaveAllAlliancesOnErasure(mockPrisma, LEADER);
    expect(mockPrisma.alliances.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { leader_id: MEMBER } }),
    );
  });

  it('skips successors who already lead another alliance', async () => {
    remaining = [member(OFFICER, 0, 5), member(SERGEANT, 1, 30)];
    mockPrisma.alliances.findFirst = vi.fn(async ({ where }: any) =>
      where.leader_id === OFFICER ? { id: 77 } : null,
    );
    await AllianceService.leaveAllAlliancesOnErasure(mockPrisma, LEADER);
    expect(mockPrisma.alliances.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { leader_id: SERGEANT } }),
    );
  });

  it('dissolves the alliance through the disband teardown when the erased leader was the last member', async () => {
    remaining = [];
    await AllianceService.leaveAllAlliancesOnErasure(mockPrisma, LEADER);
    expect(mockPrisma.alliances.delete).toHaveBeenCalledWith({
      where: { id: ALLIANCE_ID },
    });
    expect(mockPrisma.alliance_memberships.deleteMany).toHaveBeenCalledWith({
      where: { alliance_id: ALLIANCE_ID },
    });
    expect(mockPrisma.alliance_roles.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.alliances.updateMany).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ALLIANCE_DISSOLVED_ON_ERASURE',
        }),
      }),
    );
  });

  it('only removes the membership when the erased player is not the leader', async () => {
    remaining = [member(LEADER, 2, 100)];
    await AllianceService.leaveAllAlliancesOnErasure(mockPrisma, OFFICER);
    expect(mockPrisma.alliances.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.alliances.delete).not.toHaveBeenCalled();
    expect(mockPrisma.alliance_memberships.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alliance_id: ALLIANCE_ID, user_id: OFFICER },
      }),
    );
  });

  it('does nothing when the erased player is in no alliance', async () => {
    mockPrisma.alliance_memberships.findMany = vi.fn(async () => []);
    await AllianceService.leaveAllAlliancesOnErasure(mockPrisma, OFFICER);
    expect(mockPrisma.alliance_memberships.deleteMany).not.toHaveBeenCalled();
    expect(settleLoansSpy).not.toHaveBeenCalled();
  });
});

describe('ending a war', () => {
  // War 70: alliance 3 (the synthetic pact) against alliance 4.
  const WAR_ID = 70;
  const OTHER_ALLIANCE = 4;
  const RIVAL_LEADER = 31;
  const RIVAL_OFFICER = 32;
  let war: Record<string, any> | null;
  // user -> alliance -> role permissions, plus who leads each alliance.
  let seats: Array<{
    user_id: number;
    alliance_id: number;
    leader_id: number;
    permissions: Record<string, boolean>;
  }>;

  const end = (userId: number) =>
    reason(AllianceWarService.endWar(WAR_ID, userId));

  beforeEach(() => {
    war = {
      id: WAR_ID,
      status: 'ACTIVE',
      attacker_alliance_id: ALLIANCE_ID,
      defender_alliance_id: OTHER_ALLIANCE,
    };
    seats = [
      {
        user_id: LEADER,
        alliance_id: ALLIANCE_ID,
        leader_id: LEADER,
        permissions: {},
      },
      {
        user_id: OFFICER,
        alliance_id: ALLIANCE_ID,
        leader_id: LEADER,
        permissions: { declare_war: true },
      },
      {
        user_id: MEMBER,
        alliance_id: ALLIANCE_ID,
        leader_id: LEADER,
        permissions: { send_messages: true, manage_enemies: true },
      },
      {
        user_id: RIVAL_LEADER,
        alliance_id: OTHER_ALLIANCE,
        leader_id: RIVAL_LEADER,
        permissions: {},
      },
      {
        user_id: RIVAL_OFFICER,
        alliance_id: OTHER_ALLIANCE,
        leader_id: RIVAL_LEADER,
        permissions: { declare_war: true },
      },
    ];
    mockPrisma.alliance_wars.findUnique = vi.fn(async () => war);
    mockPrisma.alliance_wars.updateMany = vi.fn(async () => ({ count: 1 }));
    mockPrisma.alliance_memberships.findMany = vi.fn(async ({ where }: any) =>
      seats
        .filter(
          (seat) =>
            seat.user_id === where.user_id &&
            where.alliance_id.in.includes(seat.alliance_id),
        )
        .map((seat) => ({
          user_id: seat.user_id,
          role: { permissions: seat.permissions },
          alliance: { leader_id: seat.leader_id },
        })),
    );
  });

  it('refuses an unknown war and an already ended war', async () => {
    war = null;
    expect(await end(LEADER)).toBe('War not found or already over');
    war = {
      id: WAR_ID,
      status: 'ENDED',
      attacker_alliance_id: ALLIANCE_ID,
      defender_alliance_id: OTHER_ALLIANCE,
    };
    expect(await end(LEADER)).toBe('War not found or already over');
    expect(mockPrisma.alliance_wars.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a member without declare_war and an outsider', async () => {
    expect(await end(MEMBER)).toBe(
      'You do not have permission to end this war',
    );
    expect(await end(777)).toBe('You do not have permission to end this war');
    expect(mockPrisma.alliance_wars.updateMany).not.toHaveBeenCalled();
  });

  it('lets the declaring alliance leader end it without any role flag', async () => {
    expect(await end(LEADER)).toBeNull();
    expect(mockPrisma.alliance_wars.updateMany).toHaveBeenCalledTimes(1);
  });

  it('lets a declare_war holder in the declaring alliance end it', async () => {
    expect(await end(OFFICER)).toBeNull();
    const args = mockPrisma.alliance_wars.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: WAR_ID, status: { not: 'ENDED' } });
    expect(args.data.status).toBe('ENDED');
    expect(args.data.end_at).toBeInstanceOf(Date);
  });

  it('lets the opposing alliance end it too, by leadership or permission', async () => {
    expect(await end(RIVAL_LEADER)).toBeNull();
    expect(await end(RIVAL_OFFICER)).toBeNull();
    expect(mockPrisma.alliance_wars.updateMany).toHaveBeenCalledTimes(2);
  });

  it('does not let an uninvolved alliance end it even with declare_war', async () => {
    seats.push({
      user_id: 55,
      alliance_id: 9,
      leader_id: 55,
      permissions: { declare_war: true },
    });
    expect(await end(55)).toBe('You do not have permission to end this war');
  });

  it('on a war against a player only the declaring alliance can end it', async () => {
    war = {
      id: WAR_ID,
      status: 'ACTIVE',
      attacker_alliance_id: ALLIANCE_ID,
      defender_alliance_id: null,
    };
    expect(await end(RIVAL_LEADER)).toBe(
      'You do not have permission to end this war',
    );
    expect(await end(OFFICER)).toBeNull();
  });
});

describe('reordering ranks', () => {
  // Officer (0), Sergeant (1), Scout (2) and the default Member rank (3).
  const SCOUT = {
    id: 13,
    name: 'Scout',
    alliance_id: ALLIANCE_ID,
    rank_order: 2,
    permissions: { send_messages: true },
  };
  const DEFAULT_MEMBER = { ...ROLES.member, rank_order: 3 };
  const reorder = (actorId: number, roleIds: number[]) =>
    reason(AllianceService.reorderRoles(ALLIANCE_ID, actorId, roleIds));
  const [OFFICER_ID, SERGEANT_ID, SCOUT_ID, MEMBER_ID] = [10, 11, 13, 12];
  const writtenOrder = () =>
    mockPrisma.alliance_roles.update.mock.calls.map(([args]: any[]) => [
      args.where.id,
      args.data.rank_order,
    ]);

  beforeEach(() => {
    mockPrisma.alliance_roles.findMany = vi.fn(async () => [
      ROLES.officer,
      ROLES.sergeant,
      SCOUT,
      DEFAULT_MEMBER,
    ]);
  });

  it('requires edit_ranks', async () => {
    expect(
      await reorder(SERGEANT, [OFFICER_ID, SCOUT_ID, SERGEANT_ID, MEMBER_ID]),
    ).toBe('You do not have permission to manage roles');
    expect(mockPrisma.alliance_roles.update).not.toHaveBeenCalled();
  });

  it('lets the leader reorder every rank and numbers them from zero', async () => {
    expect(
      await reorder(LEADER, [SCOUT_ID, OFFICER_ID, SERGEANT_ID, MEMBER_ID]),
    ).toBeNull();
    expect(writtenOrder()).toEqual([
      [SCOUT_ID, 0],
      [OFFICER_ID, 1],
      [SERGEANT_ID, 2],
      [MEMBER_ID, 3],
    ]);
  });

  it('keeps the default Member rank last', async () => {
    expect(
      await reorder(LEADER, [OFFICER_ID, SERGEANT_ID, MEMBER_ID, SCOUT_ID]),
    ).toBe('The default Member rank must stay last');
    expect(mockPrisma.alliance_roles.update).not.toHaveBeenCalled();
  });

  it('refuses a list that is out of date: missing, duplicated or unknown ranks', async () => {
    const stale = 'The rank list is out of date. Reload and try again.';
    expect(await reorder(LEADER, [OFFICER_ID, SERGEANT_ID, MEMBER_ID])).toBe(
      stale,
    );
    expect(
      await reorder(LEADER, [OFFICER_ID, SERGEANT_ID, SERGEANT_ID, MEMBER_ID]),
    ).toBe(stale);
    expect(
      await reorder(LEADER, [OFFICER_ID, SERGEANT_ID, 999, MEMBER_ID]),
    ).toBe(stale);
    expect(mockPrisma.alliance_roles.update).not.toHaveBeenCalled();
  });

  it('lets an officer reorder only the ranks below their own', async () => {
    expect(
      await reorder(OFFICER, [OFFICER_ID, SCOUT_ID, SERGEANT_ID, MEMBER_ID]),
    ).toBeNull();
    expect(writtenOrder()).toEqual([
      [OFFICER_ID, 0],
      [SCOUT_ID, 1],
      [SERGEANT_ID, 2],
      [MEMBER_ID, 3],
    ]);
  });

  it('stops an officer moving their own rank or one above it', async () => {
    expect(
      await reorder(OFFICER, [SERGEANT_ID, OFFICER_ID, SCOUT_ID, MEMBER_ID]),
    ).toBe('You can only reorder ranks below your own');
    expect(mockPrisma.alliance_roles.update).not.toHaveBeenCalled();
  });
});
