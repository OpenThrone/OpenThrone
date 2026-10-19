import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceService } = await import('../Alliance.service');
const { AllianceWarService } = await import('../AllianceWar.service');

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
