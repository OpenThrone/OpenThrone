import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceListsService } = await import('../AllianceLists.service');
const { AllianceDiplomacyService } =
  await import('../AllianceDiplomacy.service');

// Synthetic data (#66 phase 4). Alliance 3 (leader 5) and alliance 4
// (leader 20, plus ally-manager 21 and plain member 22).
const A = 3;
const B = 4;
const LEADER = 5;
const EDITOR = 6; // view_list + edit_list
const ALLY_MGR = 7; // manage_allies only
const VIEWER = 8; // view_list only
const PLAIN = 9; // no permissions
const OUTSIDER = 30;
const B_LEADER = 20;
const B_ALLY_MGR = 21;
const B_PLAIN = 22;

const roles = {
  editor: { permissions: { view_list: true, edit_list: true } },
  ally: { permissions: { manage_allies: true } },
  viewer: { permissions: { view_list: true } },
  plain: { permissions: {} },
};

const memberships: Record<string, { role: { permissions: object } }> = {
  [`${A}:${EDITOR}`]: { role: roles.editor },
  [`${A}:${ALLY_MGR}`]: { role: roles.ally },
  [`${A}:${VIEWER}`]: { role: roles.viewer },
  [`${A}:${PLAIN}`]: { role: roles.plain },
  [`${B}:${B_ALLY_MGR}`]: { role: roles.ally },
  [`${B}:${B_PLAIN}`]: { role: roles.plain },
};
const leaders: Record<number, number> = { [A]: LEADER, [B]: B_LEADER };

let relations: any[];
let listEntries: any[];
let war: any;

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

beforeEach(() => {
  relations = [];
  listEntries = [];
  war = null;
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (op: any) => op(mockPrisma));
  mockPrisma.alliances = {
    findUnique: vi.fn(async ({ where }: any) =>
      leaders[where.id]
        ? {
            id: where.id,
            name: `Alliance ${where.id}`,
            leader_id: leaders[where.id],
          }
        : null,
    ),
  };
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(
      async ({ where }: any) =>
        memberships[
          `${where.unique_alliance_user.alliance_id}:${where.unique_alliance_user.user_id}`
        ] ?? null,
    ),
    findMany: vi.fn(async () => []),
  };
  mockPrisma.users = {
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === 999 ? null : { id: where.id, display_name: `P${where.id}` },
    ),
    findFirst: vi.fn(async () => ({ id: 77, display_name: 'Target' })),
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
      return { id: 1, ...data };
    }),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
  mockPrisma.alliance_wars = { findFirst: vi.fn(async () => war) };
  mockPrisma.alliance_relations = {
    findFirst: vi.fn(async ({ where }: any) => {
      if (where.id !== undefined) {
        return relations.find((r) => r.id === where.id) ?? null;
      }
      return relations[0] ?? null;
    }),
    findMany: vi.fn(async () => []),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: 50, ...data };
      relations.push(row);
      return row;
    }),
    update: vi.fn(async ({ data }: any) => data),
    delete: vi.fn(async () => ({})),
  };
});

describe('alliance lists', () => {
  const add = (actor: number, extra: Record<string, unknown> = {}) =>
    reason(
      AllianceListsService.addEntry(actor, {
        allianceId: A,
        listType: 'FARM',
        targetUserId: 77,
        ...extra,
      }),
    );

  it('requires edit_list to add', async () => {
    expect(await add(VIEWER)).toBe(
      'You do not have permission to edit alliance lists',
    );
    expect(await add(OUTSIDER)).toBe('You are not a member of this alliance');
    expect(mockPrisma.alliance_list_entries.create).not.toHaveBeenCalled();
  });

  it('lets an editor and the leader add', async () => {
    expect(await add(EDITOR)).toBeNull();
    expect(await add(LEADER, { listType: 'HIT' })).toBeNull();
    expect(mockPrisma.alliance_list_entries.create).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicates', async () => {
    expect(await add(EDITOR)).toBeNull();
    expect(await add(EDITOR)).toBe('That player is already on this list');
  });

  it('refuses to farm or hit an alliance member but allows blocking', async () => {
    expect(await add(EDITOR, { targetUserId: PLAIN })).toContain(
      'cannot be added to the Farm or Hit list',
    );
    expect(
      await add(EDITOR, { targetUserId: PLAIN, listType: 'HIT' }),
    ).toContain('cannot be added to the Farm or Hit list');
    expect(await add(EDITOR, { targetUserId: LEADER })).toContain(
      'cannot be added to the Farm or Hit list',
    );
    expect(
      await add(EDITOR, { targetUserId: PLAIN, listType: 'BLOCK' }),
    ).toBeNull();
  });

  it('rejects the system user and unknown players', async () => {
    expect(await add(EDITOR, { targetUserId: 0 })).toBe(
      'That player cannot be added to a list',
    );
    expect(await add(EDITOR, { targetUserId: 999 })).toBe('Player not found');
  });

  it('adds by display name', async () => {
    expect(
      await add(EDITOR, { targetUserId: undefined, displayName: 'Target' }),
    ).toBeNull();
    expect(mockPrisma.users.findFirst).toHaveBeenCalledTimes(1);
  });

  it('requires edit_list to remove', async () => {
    const remove = (actor: number) =>
      reason(
        AllianceListsService.removeEntry(actor, { allianceId: A, entryId: 1 }),
      );
    expect(await remove(VIEWER)).toBe(
      'You do not have permission to edit alliance lists',
    );
    expect(mockPrisma.alliance_list_entries.deleteMany).not.toHaveBeenCalled();
    expect(await remove(EDITOR)).toBeNull();
  });

  it('requires view_list to read', async () => {
    const view = (actor: number) =>
      reason(
        AllianceListsService.listEntries(actor, {
          allianceId: A,
          listType: 'FARM',
        }),
      );
    expect(await view(PLAIN)).toBe(
      'You do not have permission to view alliance lists',
    );
    expect(await view(VIEWER)).toBeNull();
    expect(await view(LEADER)).toBeNull();
  });
});

describe('alliance diplomacy', () => {
  const request = (actor: number, allianceId = A, targetAllianceId = B) =>
    reason(
      AllianceDiplomacyService.sendRequest(actor, {
        allianceId,
        targetAllianceId,
      }),
    );

  it('requires manage_allies to send a request', async () => {
    expect(await request(PLAIN)).toBe(
      'You do not have permission to manage allies',
    );
    expect(await request(ALLY_MGR)).toBeNull();
    relations = [];
    expect(await request(LEADER)).toBeNull();
  });

  it('cannot ally itself', async () => {
    expect(await request(ALLY_MGR, A, A)).toBe(
      'An alliance cannot ally itself',
    );
  });

  it('rejects duplicate requests', async () => {
    relations = [
      { id: 50, alliance_id: B, other_alliance_id: A, status: 'PENDING' },
    ];
    expect(await request(ALLY_MGR)).toContain('already pending');
    relations = [
      { id: 50, alliance_id: A, other_alliance_id: B, status: 'ACTIVE' },
    ];
    expect(await request(ALLY_MGR)).toContain('already allied');
  });

  it('refuses to ally an alliance at war', async () => {
    war = { id: 1 };
    expect(await request(ALLY_MGR)).toContain('at war');
    expect(mockPrisma.alliance_relations.create).not.toHaveBeenCalled();
  });

  it('locks both alliances in ascending id order', async () => {
    expect(await request(ALLY_MGR, A, B)).toBeNull();
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    const ids = mockPrisma.$queryRaw.mock.calls.map((c: any[]) => c[1]);
    expect(ids).toEqual([A, B]);
  });

  it('lets only the receiving side accept, with manage_allies', async () => {
    relations = [
      { id: 50, alliance_id: A, other_alliance_id: B, status: 'PENDING' },
    ];
    mockPrisma.alliance_relations.findFirst = vi.fn(async ({ where }: any) =>
      where.other_alliance_id === B ? relations[0] : null,
    );
    const respond = (actor: number, allianceId: number, accept = true) =>
      reason(
        AllianceDiplomacyService.respond(actor, {
          allianceId,
          relationId: 50,
          accept,
        }),
      );
    expect(await respond(ALLY_MGR, A)).toBe('Ally request not found');
    expect(await respond(B_PLAIN, B)).toBe(
      'You do not have permission to manage allies',
    );
    expect(await respond(B_ALLY_MGR, B)).toBeNull();
    expect(mockPrisma.alliance_relations.update).toHaveBeenCalledTimes(1);
    expect(await respond(B_LEADER, B, false)).toBeNull();
    expect(mockPrisma.alliance_relations.delete).toHaveBeenCalledTimes(1);
  });

  it('lets either side with manage_allies break an alliance', async () => {
    relations = [
      { id: 50, alliance_id: A, other_alliance_id: B, status: 'ACTIVE' },
    ];
    const brk = (actor: number, allianceId: number) =>
      reason(
        AllianceDiplomacyService.remove(actor, { allianceId, relationId: 50 }),
      );
    expect(await brk(PLAIN, A)).toBe(
      'You do not have permission to manage allies',
    );
    expect(await brk(B_PLAIN, B)).toBe(
      'You do not have permission to manage allies',
    );
    expect(await brk(ALLY_MGR, A)).toBeNull();
    expect(await brk(B_ALLY_MGR, B)).toBeNull();
    expect(mockPrisma.alliance_relations.delete).toHaveBeenCalledTimes(2);
  });

  it('does not let the receiver cancel a pending request', async () => {
    relations = [
      { id: 50, alliance_id: A, other_alliance_id: B, status: 'PENDING' },
    ];
    expect(
      await reason(
        AllianceDiplomacyService.remove(B_LEADER, {
          allianceId: B,
          relationId: 50,
        }),
      ),
    ).toContain('Decline');
  });
});

describe('alliance list batch lookup', () => {
  const membershipRow = (allianceId: number, role: object) => ({
    alliance_id: allianceId,
    role,
    alliance: {
      id: allianceId,
      name: `Alliance ${allianceId}`,
      leader_id: leaders[allianceId],
    },
  });

  it('uses one membership query and one entry query, only for view_list alliances', async () => {
    mockPrisma.alliance_memberships.findMany = vi.fn(async () => [
      membershipRow(A, roles.viewer),
      membershipRow(B, roles.plain),
    ]);
    mockPrisma.alliance_list_entries.findMany = vi.fn(async () => [
      { alliance_id: A, list_type: 'FARM', target_user_id: 10 },
      { alliance_id: A, list_type: 'BLOCK', target_user_id: 10 },
      { alliance_id: A, list_type: 'HIT', target_user_id: 11 },
    ]);

    const result = await AllianceListsService.lookupTargets(
      VIEWER,
      [10, 11, 12, 10],
    );

    expect(mockPrisma.alliance_memberships.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.alliance_list_entries.findMany).toHaveBeenCalledTimes(1);
    const { where } =
      mockPrisma.alliance_list_entries.findMany.mock.calls[0][0];
    expect(where.alliance_id).toEqual({ in: [A] });
    expect(where.target_user_id).toEqual({ in: [10, 11, 12] });
    expect(result).toEqual({
      10: [
        { allianceId: A, allianceName: 'Alliance 3', lists: ['FARM', 'BLOCK'] },
      ],
      11: [{ allianceId: A, allianceName: 'Alliance 3', lists: ['HIT'] }],
    });
  });

  it('skips the entry query when no alliance grants view_list', async () => {
    mockPrisma.alliance_memberships.findMany = vi.fn(async () => [
      membershipRow(B, roles.plain),
    ]);
    mockPrisma.alliance_list_entries.findMany = vi.fn(async () => []);
    expect(await AllianceListsService.lookupTargets(B_PLAIN, [10])).toEqual({});
    expect(mockPrisma.alliance_list_entries.findMany).not.toHaveBeenCalled();
  });

  it('caps the batch at 100 ids and rejects empty or invalid input', async () => {
    mockPrisma.alliance_memberships.findMany = vi.fn(async () => []);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    await expect(
      AllianceListsService.lookupTargets(VIEWER, ids(100)),
    ).resolves.toEqual({});
    await expect(
      AllianceListsService.lookupTargets(VIEWER, ids(101)),
    ).rejects.toThrow();
    await expect(
      AllianceListsService.lookupTargets(VIEWER, []),
    ).rejects.toThrow();
    await expect(
      AllianceListsService.lookupTargets(VIEWER, [1.5]),
    ).rejects.toThrow();
  });
});

describe('alliance name search', () => {
  beforeEach(() => {
    mockPrisma.alliances.findMany = vi.fn(async () => [
      {
        id: 9,
        name: 'Iron Wolves',
        leader: { display_name: 'Fenrir' },
        _count: { members: 12 },
      },
    ]);
  });

  it('rejects queries shorter than two characters', async () => {
    await expect(
      AllianceDiplomacyService.searchByName({ q: 'a' }),
    ).rejects.toThrow();
    await expect(
      AllianceDiplomacyService.searchByName({ q: ' a ' }),
    ).rejects.toThrow();
    expect(mockPrisma.alliances.findMany).not.toHaveBeenCalled();
  });

  it('searches case-insensitively, caps at 20 and excludes the caller alliance', async () => {
    await AllianceDiplomacyService.searchByName({ q: 'wolf', excludeId: A });
    const args = mockPrisma.alliances.findMany.mock.calls[0][0];
    expect(args.where.name).toEqual({ contains: 'wolf', mode: 'insensitive' });
    expect(args.where.id).toEqual({ not: A });
    expect(args.take).toBe(20);
  });

  it('returns only id, name, member count and leader name', async () => {
    const result = await AllianceDiplomacyService.searchByName({ q: 'wolf' });
    expect(result).toEqual([
      { id: 9, name: 'Iron Wolves', memberCount: 12, leaderName: 'Fenrir' },
    ]);
    const { select } = mockPrisma.alliances.findMany.mock.calls[0][0];
    expect(Object.keys(select).sort()).toEqual([
      '_count',
      'id',
      'leader',
      'name',
    ]);
    expect(select).not.toHaveProperty('gold_in_bank');
  });
});
