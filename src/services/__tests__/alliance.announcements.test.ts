import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installAllianceRoomMocks } from 'test/utils/allianceRoomMocks';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const { AllianceAnnouncementsService, ANNOUNCEMENTS_PER_DAY } =
  await import('../AllianceAnnouncements.service');

// Synthetic alliance: leader 5, officer 6 (post_announcements), members 8 and
// 9 (default rank, no posting), outsider 20.
const ALLIANCE_ID = 3;
const LEADER = 5;
const OFFICER = 6;
const MEMBER = 8;
const MEMBER_2 = 9;
const OUTSIDER = 20;

const ROLES = {
  officer: { id: 10, permissions: { post_announcements: true } },
  member: { id: 12, permissions: { send_messages: true } },
};
const MEMBERSHIPS: Record<number, keyof typeof ROLES> = {
  [LEADER]: 'member',
  [OFFICER]: 'officer',
  [MEMBER]: 'member',
  [MEMBER_2]: 'member',
};

let rows: any[];
let roomState: ReturnType<typeof installAllianceRoomMocks>;
let nextId: number;

const alliance = { id: ALLIANCE_ID, name: 'Synthetic Pact', leader_id: LEADER };

const post = (userId: number, title = 'Muster', body = 'At dawn.') =>
  AllianceAnnouncementsService.create(userId, {
    allianceId: ALLIANCE_ID,
    title,
    body,
  });

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

const matches = (row: any, where: any) =>
  Object.entries(where).every(([key, value]: [string, any]) => {
    if (value && typeof value === 'object' && 'gte' in value) {
      return row[key] >= value.gte;
    }
    return row[key] === value;
  });

beforeEach(() => {
  rows = [];
  nextId = 1;
  mockPrisma.$transaction = vi.fn(async (operation: any) =>
    operation(mockPrisma),
  );
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(async ({ where }: any) => {
      const userId = where.unique_alliance_user.user_id;
      const roleKey = MEMBERSHIPS[userId];
      if (!roleKey) return null;
      return {
        user_id: userId,
        alliance_id: ALLIANCE_ID,
        role: ROLES[roleKey],
        alliance,
      };
    }),
    findMany: vi.fn(async () =>
      Object.keys(MEMBERSHIPS).map((id) => ({ user_id: Number(id) })),
    ),
  };
  roomState = installAllianceRoomMocks(mockPrisma, vi);
  mockPrisma.alliance_announcements = {
    count: vi.fn(
      async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
    ),
    create: vi.fn(async ({ data }: any) => {
      const row = {
        id: nextId++,
        pinned: false,
        deleted_at: null,
        created_at: new Date(),
        ...data,
      };
      rows.push(row);
      return row;
    }),
    findFirst: vi.fn(
      async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where, skip = 0, take = 100 }: any) =>
      rows
        .filter((r) => matches(r, where))
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            b.created_at.getTime() - a.created_at.getTime() ||
            b.id - a.id,
        )
        .slice(skip, skip + take),
    ),
    update: vi.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    }),
  };
});

describe('posting announcements', () => {
  it('requires the post_announcements permission', async () => {
    expect(await reason(post(MEMBER))).toMatch(/permission/);
    expect(rows).toHaveLength(0);
  });

  it('lets the leader and permitted ranks post', async () => {
    expect(await reason(post(LEADER))).toBeNull();
    expect(await reason(post(OFFICER))).toBeNull();
    expect(rows).toHaveLength(2);
  });

  it('rejects non-members', async () => {
    expect(await reason(post(OUTSIDER))).toMatch(/not a member/);
  });

  it('enforces length limits and trims input', async () => {
    expect(await reason(post(LEADER, 'x'.repeat(121)))).not.toBeNull();
    expect(await reason(post(LEADER, 'ok', 'y'.repeat(4001)))).not.toBeNull();
    expect(await reason(post(LEADER, '   ', 'body'))).not.toBeNull();
    await post(LEADER, '  Hello  ', '  line1\r\nline2  ');
    expect(rows[0].title).toBe('Hello');
    expect(rows[0].body).toBe('line1\nline2');
  });

  it('limits posts to 10 per alliance per day', async () => {
    for (let i = 0; i < ANNOUNCEMENTS_PER_DAY; i++) await post(LEADER);
    expect(await reason(post(OFFICER))).toMatch(/Daily announcement limit/);
    // Soft-deleting does not free a slot.
    await AllianceAnnouncementsService.remove(LEADER, {
      allianceId: ALLIANCE_ID,
      announcementId: 1,
    });
    expect(await reason(post(LEADER))).toMatch(/Daily announcement limit/);
  });

  it("posts to the alliance's conversation, which every member is in", async () => {
    const result = await post(OFFICER, 'Muster', 'At dawn.');
    expect(result.delivered).toBe(3);
    expect(roomState.rooms).toHaveLength(1);
    expect(roomState.participants.map((p) => p.userId).sort()).toEqual(
      [LEADER, OFFICER, MEMBER, MEMBER_2].sort(),
    );
    expect(roomState.chatMessages).toHaveLength(1);
    expect(roomState.chatMessages[0].senderId).toBe(OFFICER);
    expect(roomState.chatMessages[0].content).toContain('Muster');
    expect(roomState.chatMessages[0].content).toContain('At dawn.');
  });
});

describe('listing announcements', () => {
  it('rejects non-members', async () => {
    expect(
      await reason(
        AllianceAnnouncementsService.list(OUTSIDER, {
          allianceId: ALLIANCE_ID,
        }),
      ),
    ).toMatch(/not a member/);
  });

  it('orders pinned first, then newest, and paginates', async () => {
    await post(LEADER, 'first');
    await post(LEADER, 'second');
    await post(LEADER, 'third');
    rows[0].created_at = new Date(Date.now() - 3000);
    rows[1].created_at = new Date(Date.now() - 2000);
    rows[2].created_at = new Date(Date.now() - 1000);
    await AllianceAnnouncementsService.setPinned(LEADER, {
      allianceId: ALLIANCE_ID,
      announcementId: 1,
      pinned: true,
    });
    const page1 = await AllianceAnnouncementsService.list(MEMBER, {
      allianceId: ALLIANCE_ID,
      pageSize: 2,
    });
    expect(page1.items.map((r: any) => r.title)).toEqual(['first', 'third']);
    expect(page1.canPost).toBe(false);
    const page2 = await AllianceAnnouncementsService.list(MEMBER, {
      allianceId: ALLIANCE_ID,
      pageSize: 2,
      page: 2,
    });
    expect(page2.items.map((r: any) => r.title)).toEqual(['second']);
  });
});

describe('pinning and deleting', () => {
  it('only lets permitted ranks pin', async () => {
    await post(LEADER);
    expect(
      await reason(
        AllianceAnnouncementsService.setPinned(MEMBER, {
          allianceId: ALLIANCE_ID,
          announcementId: 1,
          pinned: true,
        }),
      ),
    ).toMatch(/permission/);
  });

  it('lets an author delete their own post but not others', async () => {
    await post(OFFICER, 'by officer');
    await post(LEADER, 'by leader');
    const remove = (userId: number, announcementId: number) =>
      reason(
        AllianceAnnouncementsService.remove(userId, {
          allianceId: ALLIANCE_ID,
          announcementId,
        }),
      );
    // A plain member cannot delete someone else's post.
    expect(await remove(MEMBER, 1)).toMatch(/cannot delete/);
    expect(await remove(OFFICER, 1)).toBeNull();
    expect(rows[0].deleted_at).toBeInstanceOf(Date);
    // Permitted ranks can delete others' posts.
    expect(await remove(OFFICER, 2)).toBeNull();
    // An author who lost the permission can still delete their own post.
    await post(OFFICER, 'again');
    const saved = ROLES.officer.permissions;
    ROLES.officer.permissions = {} as any;
    await post(LEADER, 'leader again');
    expect(await remove(OFFICER, 4)).toMatch(/cannot delete/);
    expect(await remove(OFFICER, 3)).toBeNull();
    ROLES.officer.permissions = saved;
    // Deleted posts are gone.
    expect(await remove(OFFICER, 1)).toMatch(/not found/);
  });
});
