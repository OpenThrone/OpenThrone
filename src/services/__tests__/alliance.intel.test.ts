import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installAllianceRoomMocks } from 'test/utils/allianceRoomMocks';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceIntelService } = await import('../AllianceIntel.service');

// Synthetic data (#66 phase 6). Alliance 3 is led by 5.
const A = 3;
const LEADER = 5;
const SHARER = 6; // share_reports
const CALLER = 7; // call_targets
const PLAIN = 8; // no permissions
const OUTSIDER = 30;
const ENEMY = 77;
const READER = 40; // log shared with them as a user only

const roles: Record<string, { permissions: object }> = {
  [SHARER]: { permissions: { share_reports: true } },
  [CALLER]: { permissions: { call_targets: true } },
  [PLAIN]: { permissions: {} },
  [LEADER]: { permissions: {} },
};

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

let roomState: ReturnType<typeof installAllianceRoomMocks>;
let shares: any[];
let aclRows: any[];
let listEntries: any[];
let calls: any[];

const logs: Record<number, any> = {
  1: { id: 1, type: 'attack', attacker_id: SHARER, defender_id: ENEMY },
  2: { id: 2, type: 'attack', attacker_id: ENEMY, defender_id: SHARER },
  3: { id: 3, type: 'attack', attacker_id: ENEMY, defender_id: 99 },
};

beforeEach(() => {
  shares = [];
  aclRows = [{ attack_log_id: 3, shared_with_user_id: SHARER }];
  listEntries = [];
  calls = [
    { id: 10, alliance_id: A, status: 'OPEN', created_by: CALLER },
    { id: 11, alliance_id: A, status: 'CLOSED', created_by: CALLER },
    { id: 12, alliance_id: 4, status: 'OPEN', created_by: CALLER },
  ];
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (op: any) => op(mockPrisma));
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(async ({ where }: any) => {
      const { alliance_id, user_id } = where.unique_alliance_user;
      const role = roles[user_id];
      if (alliance_id !== A || !role) return null;
      return {
        role,
        alliance: { id: A, name: 'Alliance A', leader_id: LEADER },
      };
    }),
    findMany: vi.fn(async ({ where }: any) =>
      where.user_id?.in
        ? where.user_id.in
            .filter((id: number) => roles[id])
            .map((id: number) => ({ user_id: id }))
        : [LEADER, SHARER, CALLER, PLAIN].map((id) => ({ user_id: id })),
    ),
  };
  mockPrisma.attack_log = {
    findUnique: vi.fn(async ({ where }: any) => {
      const log = logs[where.id];
      return log
        ? { ...log, acl: aclRows.filter((r) => r.attack_log_id === log.id) }
        : null;
    }),
  };
  mockPrisma.attack_log_acl = {
    findMany: vi.fn(async () => []),
    create: vi.fn(async ({ data }: any) => {
      aclRows.push(data);
      return data;
    }),
  };
  mockPrisma.alliance_intel_shares = {
    findUnique: vi.fn(
      async ({ where }: any) =>
        shares.find(
          (s) =>
            s.attack_log_id ===
              where.unique_alliance_intel_share.attack_log_id &&
            s.alliance_id === where.unique_alliance_intel_share.alliance_id,
        ) ?? null,
    ),
    create: vi.fn(async ({ data }: any) => {
      shares.push(data);
      return { id: shares.length, ...data };
    }),
    count: vi.fn(async () => 0),
    findMany: vi.fn(async () => []),
  };
  mockPrisma.alliance_target_calls = {
    findFirst: vi.fn(
      async ({ where }: any) =>
        calls.find(
          (c) => c.id === where.id && c.alliance_id === where.alliance_id,
        ) ?? null,
    ),
    create: vi.fn(async ({ data }: any) => ({ id: 20, ...data })),
    update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    findMany: vi.fn(async () => []),
  };
  mockPrisma.users = {
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === 999 ? null : { id: where.id, display_name: `P${where.id}` },
    ),
    findFirst: vi.fn(async () => ({ id: ENEMY, display_name: 'Enemy' })),
    findMany: vi.fn(async () => []),
  };
  mockPrisma.alliance_list_entries = {
    findUnique: vi.fn(
      async ({ where }: any) =>
        listEntries.find(
          (e) =>
            e.list_type === where.unique_alliance_list_target.list_type &&
            e.target_user_id ===
              where.unique_alliance_list_target.target_user_id,
        ) ?? null,
    ),
    create: vi.fn(async ({ data }: any) => {
      listEntries.push(data);
      return data;
    }),
  };
  roomState = installAllianceRoomMocks(mockPrisma, vi);
});

describe('sharing reports with an alliance', () => {
  const share = (actor: number, extra: Record<string, unknown> = {}) =>
    reason(
      AllianceIntelService.shareReport(actor, {
        allianceId: A,
        attackLogId: 1,
        ...extra,
      }),
    );

  it('requires membership and share_reports', async () => {
    expect(await share(OUTSIDER)).toBe('You are not a member of this alliance');
    expect(await share(PLAIN)).toBe(
      'You do not have permission to share reports with the alliance',
    );
    expect(mockPrisma.attack_log_acl.create).not.toHaveBeenCalled();
  });

  it('lets the attacker share and writes the alliance ACL row once', async () => {
    expect(await share(SHARER)).toBeNull();
    expect(mockPrisma.attack_log_acl.create).toHaveBeenCalledWith({
      data: { attack_log_id: 1, shared_with_alliance_id: A },
    });
    expect(shares).toHaveLength(1);
  });

  it('lets the leader share without an explicit permission', async () => {
    logs[1].attacker_id = LEADER;
    expect(await share(LEADER)).toBeNull();
    logs[1].attacker_id = SHARER;
  });

  it('only accepts logs the actor attacked or defended in', async () => {
    expect(await share(SHARER, { attackLogId: 99 })).toBe('Report not found');
    // Log 3 was only shared with the actor, so it cannot be passed on.
    expect(await share(SHARER, { attackLogId: 3 })).toBe('Report not found');
    expect(shares).toHaveLength(0);
  });

  it('rejects sharing the same report twice and skips a duplicate ACL row', async () => {
    expect(await share(SHARER)).toBeNull();
    expect(await share(SHARER)).toBe(
      'That report is already shared with this alliance',
    );
    expect(mockPrisma.attack_log_acl.create).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing alliance ACL row', async () => {
    aclRows.push({ attack_log_id: 1, shared_with_alliance_id: A });
    expect(await share(SHARER)).toBeNull();
    expect(mockPrisma.attack_log_acl.create).not.toHaveBeenCalled();
  });

  it('only lets the defender report a threat', async () => {
    expect(await share(SHARER, { reportThreat: true })).toBe(
      'Only the defender can report a threat',
    );
    expect(
      await share(SHARER, { attackLogId: 2, reportThreat: true }),
    ).toBeNull();
    expect(shares[0].is_threat).toBe(true);
  });

  it('attaches to an open call of the same alliance only', async () => {
    expect(await share(SHARER, { callId: 10 })).toBeNull();
    expect(shares[0].call_id).toBe(10);
    expect(await share(SHARER, { attackLogId: 2, callId: 11 })).toBe(
      'That call is closed',
    );
    expect(await share(SHARER, { attackLogId: 2, callId: 12 })).toBe(
      'Call not found',
    );
  });

  it('rejects an over-long note', async () => {
    expect(await share(SHARER, { note: 'x'.repeat(201) })).toBeTruthy();
  });
});

describe('intel feed', () => {
  it('is members only', async () => {
    expect(
      await reason(AllianceIntelService.listFeed(OUTSIDER, { allianceId: A })),
    ).toBe('You are not a member of this alliance');
    expect(
      await reason(AllianceIntelService.listFeed(PLAIN, { allianceId: A })),
    ).toBeNull();
  });

  it('reports the non-member side as the target', async () => {
    mockPrisma.alliance_intel_shares.count = vi.fn(async () => 1);
    mockPrisma.alliance_intel_shares.findMany = vi.fn(async () => [
      {
        id: 1,
        shared_by: SHARER,
        note: null,
        is_threat: false,
        call_id: null,
        created_at: new Date(),
        attack_log: {
          id: 1,
          type: 'INFILTRATE',
          attacker_id: SHARER,
          defender_id: ENEMY,
          winner: SHARER,
          timestamp: null,
          attackerPlayer: { id: SHARER, display_name: 'S' },
          defenderPlayer: { id: ENEMY, display_name: 'E' },
        },
      },
    ]);
    const feed = await AllianceIntelService.listFeed(PLAIN, { allianceId: A });
    expect(feed.items[0].target_user_id).toBe(ENEMY);
    expect(feed.items[0].type).toBe('spy');
    expect(feed.items[0].url).toBe('/battle/results/1');
  });
});

describe('target calls', () => {
  const call = (actor: number, extra: Record<string, unknown> = {}) =>
    reason(
      AllianceIntelService.createCall(actor, {
        allianceId: A,
        callType: 'HIT',
        targetUserId: ENEMY,
        ...extra,
      }),
    );

  it('requires call_targets', async () => {
    expect(await call(PLAIN)).toBe(
      'You do not have permission to call targets',
    );
    expect(await call(OUTSIDER)).toBe('You are not a member of this alliance');
    expect(mockPrisma.alliance_target_calls.create).not.toHaveBeenCalled();
  });

  it('adds Hit and Farm targets to the matching list once and notifies others', async () => {
    expect(await call(CALLER)).toBeNull();
    expect(listEntries).toEqual([
      expect.objectContaining({ list_type: 'HIT', target_user_id: ENEMY }),
    ]);
    // A second call on the same target ignores the duplicate list entry.
    expect(await call(LEADER)).toBeNull();
    expect(listEntries).toHaveLength(1);
    expect(await call(CALLER, { callType: 'FARM' })).toBeNull();
    expect(listEntries).toHaveLength(2);

    // Each call is posted once to the alliance's conversation.
    expect(roomState.chatMessages).toHaveLength(3);
    expect(roomState.chatMessages[0].senderId).toBe(CALLER);
    expect(roomState.chatMessages[0].content).toContain(
      '[Alliance] Hit call: P77',
    );
  });

  it('keeps Recon off the lists', async () => {
    expect(await call(CALLER, { callType: 'RECON' })).toBeNull();
    expect(listEntries).toHaveLength(0);
    expect(roomState.chatMessages[0].content).toContain(
      '[Alliance] Recon call: P77',
    );
  });

  it('cannot target members or unknown players', async () => {
    expect(await call(CALLER, { targetUserId: PLAIN })).toBe(
      'You cannot call a member of your own alliance',
    );
    expect(await call(CALLER, { targetUserId: LEADER })).toBe(
      'You cannot call a member of your own alliance',
    );
    expect(await call(CALLER, { targetUserId: 999 })).toBe('Player not found');
    expect(await call(CALLER, { targetUserId: 0 })).toBe(
      'That player cannot be targeted',
    );
  });

  it('closes calls for call_targets holders and creators only', async () => {
    const close = (actor: number, callId = 10) =>
      reason(AllianceIntelService.closeCall(actor, { allianceId: A, callId }));
    expect(await close(PLAIN)).toBe('You cannot close this call');
    expect(await close(OUTSIDER)).toBe('You are not a member of this alliance');
    expect(await close(CALLER)).toBeNull();
    expect(await close(LEADER)).toBeNull();
    expect(await close(CALLER, 11)).toBe('That call is already closed');
    expect(await close(CALLER, 12)).toBe('Call not found');
    // The creator may close their own call without the permission.
    calls[0].created_by = PLAIN;
    expect(await close(PLAIN)).toBeNull();
  });
});
