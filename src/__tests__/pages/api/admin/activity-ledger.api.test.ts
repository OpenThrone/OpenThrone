import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  test,
  vi,
} from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

import { recordsActivityDetails } from '@/utils/adminActivityDetails';

installMockPrisma(vi);
// Staff reads of attacks and investigations now write a required audit row.
mockPrisma.auditLog = { create: vi.fn(async () => ({})) };
silenceLogger();
const guards: Record<string, unknown>[] = [];
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: (options: any) => {
    guards.push(options);
    return (handler: any) => (req: any, res: any) =>
      handler(req, res, { query: options.querySchema.parse(req.query) });
  },
}));
const activity = require('@/pages/api/admin/analytics/activity').default;
const attacks = require('@/pages/api/admin/attacks').default;
const investigations =
  require('@/pages/api/admin/abuse/investigation-signals').default;

const db = new PGlite();
function response() {
  const res = {
    code: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
  };
  return res;
}
beforeAll(async () => {
  await db.exec(`
    CREATE TABLE users (id int, display_name text);
    CREATE TABLE bank_history (id int, from_user_id int, to_user_id int, date_time timestamptz, stats jsonb, gold_amount bigint, history_type text);
    CREATE TABLE recruit_history (id int, from_user int, to_user int, timestamp timestamptz);
    CREATE TABLE attack_log (id int, attacker_id int, defender_id int, timestamp timestamptz, type text, pillaged_gold bigint);
    CREATE TABLE messages (id int, from_user_id int, created_date timestamptz, date_time timestamptz, body text);
    CREATE TABLE "ChatMessage" (id int, "senderId" int, "sentAt" timestamptz, content text);
    CREATE TABLE "ChatMessageReaction" (id int, "userId" int, "createdAt" timestamptz);
    CREATE TABLE alliance_join_requests (id int, user_id int, created_at timestamptz);
    CREATE TABLE alliance_bank_history (id int, performed_by_user_id int, created_at timestamptz, transaction_type text, amount bigint);
    INSERT INTO users VALUES (0, 'System'), (1, 'First'), (2, 'Second'), (3, 'Third');
    INSERT INTO bank_history VALUES
      (1, 1, 0, now(), '{"type":"TRAINING_TRAIN"}', 50, 'SALE'),
      (2, 0, 1, now(), '{"type":"TRAINING_UNTRAIN"}', 10, 'SALE'),
      (3, 2, 0, now(), '{"type":"ARMORY_EQUIP"}', 200, 'SALE'),
      (4, 1, 1, now(), null, 300, 'PLAYER_TRANSFER'),
      (5, 0, 1, now(), null, 50, 'RECRUITMENT'),
      (6, 2, 1, now(), '{"type":"ATTACK"}', 500, 'WAR_SPOILS'),
      (7, 1, 0, now() - interval '100 days', '{"type":"TRAINING_TRAIN"}', 50, 'SALE'),
      (8, 1, 2, now(), '{"transferType":"FRIEND_TRANSFER","senderNote":"PRIVATE_NOTE"}', 200, 'FRIEND_TRANSFER'),
      (9, 1, 0, now(), '{"transferType":"FRIEND_TRANSFER_TAX"}', 10, 'FRIEND_TRANSFER'),
      (10, 1, 0, now(), null, 50, 'FORT_REPAIR'),
      (11, 2, 1, now(), '{"transferType":"FRIEND_REQUEST"}', 100, 'FRIEND_REQUEST');
    INSERT INTO recruit_history VALUES (1, 2, 1, now()), (2, 0, 2, now()), (3, 3, 1, now());
    INSERT INTO attack_log VALUES (1, 2, 1, now(), 'attack', 500);
    INSERT INTO messages VALUES (1, 1, now(), now(), 'PRIVATE_TEXT');
    INSERT INTO "ChatMessage" VALUES (1, 2, now(), 'PRIVATE_CHAT');
    INSERT INTO alliance_bank_history VALUES (1, 1, now(), 'TAX', 30), (2, 2, now(), 'DEPOSIT', 40);
  `);
  await db.exec(
    `ALTER TABLE bank_history ADD COLUMN from_user_account_type text DEFAULT 'HAND', ADD COLUMN to_user_account_type text DEFAULT 'BANK'`,
  );
  mockPrisma.$queryRaw = vi.fn(
    async (sql: any) => (await db.query(sql.text, sql.values)).rows,
  );
});
afterAll(async () => db.close());

describe('staff activity and attack ledger', () => {
  test('both routes require VIEW_ANALYTICS and validate queries', () => {
    expect(guards).toHaveLength(3);
    for (const guard of guards.slice(0, 2))
      expect(guard).toMatchObject({
        methods: ['GET'],
        authMode: 'permission',
        requiredAnyPermissions: ['VIEW_ANALYTICS'],
        rateLimitProfile: 'admin',
      });
    const schema = guards[0].querySchema as any;
    expect(schema.safeParse({ days: 365 }).success).toBe(false);
    expect(
      schema.safeParse({ sortDirection: 'DESC; DROP TABLE users' }).success,
    ).toBe(false);
    expect(schema.safeParse({ pageSize: 100000 }).success).toBe(false);
    expect(schema.safeParse({ playerId: '1 OR 1=1' }).success).toBe(false);
  });
  test('aggregates real SQL, credits actors, excludes automatic rewards, and omits private content', async () => {
    const res = response();
    await activity({ query: { days: '7' } }, res);
    expect(res.code).toBe(200);
    expect(res.body.total).toBe(13);
    expect(
      res.body.breakdown.find((row: any) => row.category === 'training')
        .actions,
    ).toBe(2);
    expect(
      res.body.players
        .filter((row: any) => row.actor === 1)
        .reduce((sum: number, row: any) => sum + row.actions, 0),
    ).toBe(8);
    expect(
      res.body.recent.find((row: any) => row.key === 'recruit:1'),
    ).toMatchObject({ actor: 1, target: 2 });
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
  test('filters both summaries and timeline by player and category', async () => {
    const res = response();
    await activity(
      { query: { days: '7', playerId: '2', category: 'social' } },
      res,
    );
    expect(res.body.total).toBe(3);
    expect(res.body.players).toHaveLength(1);
    expect(
      res.body.recent.every(
        (row: any) => row.actor === 2 && row.category === 'social',
      ),
    ).toBe(true);
  });
  test('paginates without changing totals', async () => {
    const res = response();
    await activity({ query: { days: '7', page: '2' } }, res);
    expect(res.body.total).toBe(13);
    expect(res.body.recent).toEqual([]);
  });
  test('attack list is bounded, participant-filtered, and excludes full stats', async () => {
    mockPrisma.attack_log.count = vi.fn(async () => 101);
    mockPrisma.attack_log.findMany = vi.fn(async () => []);
    const res = response();
    await attacks({ query: { playerId: '2', page: '2' } }, res);
    expect(res.body.total).toBe(101);
    expect(mockPrisma.attack_log.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ attacker_id: 2 }, { defender_id: 2 }] },
        take: 50,
        skip: 50,
      }),
    );
    expect(
      mockPrisma.attack_log.findMany.mock.calls[0][0].select.stats,
    ).toBeUndefined();
  });
  test('details preserve bigint amounts and exclude sealed replay', async () => {
    mockPrisma.attack_log.findUnique = vi.fn(async () => ({
      id: 4,
      pillaged_gold: 90071992547409930n,
      stats: {
        replay: 'SEALED_SECRET',
        adminSnapshots: { version: 1, before: {}, after: {} },
      },
    }));
    const res = response();
    await attacks({ query: { id: '4' } }, res);
    expect(res.body.pillaged_gold).toBe('90071992547409930');
    expect(res.body.details.completeSnapshots).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('SEALED_SECRET');
  });
  test('investigations are GET-only, permission protected, bounded, uncached and do not save signals', async () => {
    expect(guards[2]).toMatchObject({
      methods: ['GET'],
      authMode: 'permission',
      requiredAnyPermissions: ['VIEW_CHEAT_SIGNALS'],
    });
    const schema = guards[2].querySchema as any;
    expect(schema.safeParse({ days: 90 }).success).toBe(false);
    mockPrisma.$transaction = vi.fn(async () => ({
      findings: [],
      snapshotCoverage: { scanned: 0 },
    }));
    const res = response();
    await investigations({ query: { days: '7' } }, res);
    expect(res.code).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body.findings).toEqual([]);
    expect(mockPrisma.$transaction.mock.calls[0][1]).toMatchObject({
      isolationLevel: 'RepeatableRead',
      timeout: 30000,
    });
  });
  test('missing reports return 404', async () => {
    mockPrisma.attack_log.findUnique = vi.fn(async () => null);
    const res = response();
    await attacks({ query: { id: '99' } }, res);
    expect(res.code).toBe(404);
  });
});

test('activity date sorting and pagination run over the full filtered dataset with stable ties', async () => {
  await db.exec(`INSERT INTO messages (id, from_user_id, created_date, date_time, body)
    SELECT 1000 + n, 1, now() - n * interval '1 minute', now() - n * interval '1 minute', 'synthetic' FROM generate_series(1, 32) n`);
  try {
    const collect = async (sortDirection: string) => {
      const rows: Array<{ key: string; at: Date }> = [];
      let total = 0;
      for (let page = 1; page === 1 || rows.length < total; page++) {
        const res = response();
        await activity(
          {
            query: {
              days: '7',
              page: String(page),
              pageSize: '10',
              sortDirection,
            },
          },
          res,
        );
        expect(res.code).toBe(200);
        expect(res.body.pageSize).toBe(10);
        expect(res.body.recent.length).toBeLessThanOrEqual(10);
        total = res.body.total;
        rows.push(...res.body.recent);
      }
      expect(new Set(rows.map((row) => row.key)).size).toBe(total);
      return rows;
    };
    const ascending = await collect('asc');
    const descending = await collect('desc');
    expect(ascending.map((row) => row.key)).toEqual(
      descending.map((row) => row.key).reverse(),
    );
    for (let i = 1; i < ascending.length; i++)
      expect(new Date(ascending[i].at).getTime()).toBeGreaterThanOrEqual(
        new Date(ascending[i - 1].at).getTime(),
      );
    const filtered = response();
    await activity(
      {
        query: {
          days: '7',
          category: 'social',
          playerId: '1',
          pageSize: '10',
          sortDirection: 'asc',
        },
      },
      filtered,
    );
    expect(
      filtered.body.recent.every(
        (row: { category: string; actor: number }) =>
          row.category === 'social' && row.actor === 1,
      ),
    ).toBe(true);
  } finally {
    await db.exec('DELETE FROM messages WHERE id >= 1000');
  }
});

test('player breakdown pages across all matching players instead of a top-50 cap', async () => {
  await db.exec(`INSERT INTO users SELECT 1000+n, 'Synthetic '||n FROM generate_series(1, 61) n;
    INSERT INTO messages (id, from_user_id, created_date, date_time, body)
    SELECT 2000+n, 1000+n, now()-n*interval '1 minute', now()-n*interval '1 minute', 'synthetic' FROM generate_series(1, 61) n`);
  try {
    const collect = async (playerSortDirection: string) => {
      const ids: number[] = [];
      for (let playerPage = 1; playerPage <= 7; playerPage++) {
        const res = response();
        await activity(
          {
            query: {
              days: '7',
              playerPage: String(playerPage),
              playerPageSize: '10',
              playerSortDirection,
            },
          },
          res,
        );
        expect(res.code).toBe(200);
        expect(res.body.activePlayers).toBe(63);
        const grouped = new Map<number, number>();
        for (const row of res.body.players)
          grouped.set(
            row.actor,
            Math.max(
              grouped.get(row.actor) ?? 0,
              new Date(row.last_at).getTime(),
            ),
          );
        expect(grouped.size).toBeLessThanOrEqual(10);
        ids.push(
          ...[...grouped]
            .sort(
              (a, b) =>
                (playerSortDirection === 'asc' ? a[1] - b[1] : b[1] - a[1]) ||
                a[0] - b[0],
            )
            .map(([id]) => id),
        );
      }
      expect(new Set(ids).size).toBe(63);
      return ids;
    };
    const asc = await collect('asc');
    const desc = await collect('desc');
    expect(asc[0]).toBe(1061);
    expect(desc.at(-1)).toBe(1061);
    expect(asc).toContain(1001);
  } finally {
    await db.exec(
      'DELETE FROM messages WHERE id >= 2000; DELETE FROM users WHERE id >= 1000',
    );
  }
});

test('timeline returns safe recorded quantities, conversions, bank direction and upgrade facts', async () => {
  await db.exec(`INSERT INTO bank_history
    (id, from_user_id, to_user_id, date_time, stats, gold_amount, history_type, from_user_account_type, to_user_account_type) VALUES
    (901,1,0,now(),' {"type":"TRAINING_TRAIN","items":[{"type":"OFFENSE","level":1,"quantity":1234,"note":"PRIVATE_ITEM_NOTE"},{"type":"DEFENSE","level":1,"quantity":25}]}',500,'SALE','HAND','BANK'),
    (902,0,1,now(),' {"type":"TRAINING_UNTRAIN","items":[{"type":"OFFENSE","level":1,"quantity":9}]}',50,'SALE','BANK','HAND'),
    (903,1,0,now(),' {"type":"ARMORY_EQUIP","items":[{"type":"WEAPON","usage":"OFFENSE","level":1,"quantity":17}]}',50,'SALE','HAND','BANK'),
    (904,0,1,now(),' {"type":"ARMORY_UNEQUIP","items":[{"type":"WEAPON","usage":"OFFENSE","level":1,"quantity":3}]}',50,'SALE','BANK','HAND'),
    (905,1,1,now(),null,50,'PLAYER_TRANSFER','BANK','HAND'),
    (906,1,0,now(),' {"type":"TRAINING_CONVERSION","fromItem":"OFFENSE_1","toItem":"OFFENSE_2","amount":12}',50,'SALE','HAND','BANK'),
    (907,1,0,now(),' {"type":"FORTIFICATIONS_UPGRADE","new_level":5,"private":"PRIVATE_LEVEL_NOTE"}',50,'SALE','HAND','BANK'),
    (908,1,0,now(),' {"actualRepairAmount":90}',50,'FORT_REPAIR','HAND','BANK'),
    (909,1,1,now(),' {"type":"ARMORY_UPGRADE","conversions":[{"fromItem":"OFFENSE_OFFENSE_DAGGER","toItem":"OFFENSE_OFFENSE_HATCHET","conversionAmount":7}]}',50,'SALE','HAND','BANK'),
    (910,1,0,now(),' {"type":"TRAINING_TRAIN","items":[null,{"type":"PRIVATE_INVALID_TYPE","level":1,"quantity":12},{"type":"OFFENSE","level":1,"quantity":-1}]}',50,'SALE','HAND','BANK'),
    (911,1,0,now(),' {"type":"BATTLE_UPGRADES_BUY","items":[{"type":"OFFENSE","level":1,"quantity":4}]}',50,'SALE','HAND','BANK'),
    (912,1,0,now(),' {"type":"ARMORY_UPGRADE","new_level":3,"cost":"900"}',50,'SALE','HAND','BANK'),
    (913,1,0,now(),' {"type":"HIRE_MERCENARY","contractId":4,"termDays":3,"items":[{"type":"OFFENSE","level":1,"quantity":10}]}',50,'SALE','HAND','BANK'),
    (914,1,0,now(),' {"type":"RENEW_MERCENARY","contractId":4,"termDays":1,"items":[{"type":"OFFENSE","level":1,"quantity":6}]}',50,'SALE','HAND','BANK');`);
  try {
    const res = response();
    await activity({ query: { days: '7', pageSize: '50' } }, res);
    expect(res.code).toBe(200);
    const row = (id: number) =>
      res.body.recent.find((entry: any) => entry.key === `bank:${id}`);
    expect(row(901).details.items).toMatchObject([
      { name: 'Soldier', quantity: 1234 },
      { quantity: 25 },
    ]);
    expect(row(902)).toMatchObject({
      actor: 1,
      details: { items: [{ name: 'Soldier', quantity: 9 }] },
    });
    expect(row(903).details.items).toMatchObject([
      { name: 'Dagger', usage: 'OFFENSE', quantity: 17 },
    ]);
    expect(row(904).details.items[0].quantity).toBe(3);
    expect(row(905).details).toMatchObject({
      fromAccount: 'BANK',
      toAccount: 'HAND',
    });
    expect(row(4).details).toMatchObject({
      fromAccount: 'HAND',
      toAccount: 'BANK',
    });
    expect(row(906).details.conversions).toMatchObject([
      { from: { name: 'Soldier' }, to: { name: 'Knight' }, quantity: 12 },
    ]);
    expect(row(907).details.newLevel).toBe(5);
    expect(row(908).details.repairedHP).toBe(90);
    expect(row(909).details.conversions).toMatchObject([
      { from: { name: 'Dagger' }, to: { name: 'Hatchet' }, quantity: 7 },
    ]);
    expect(row(912)).toMatchObject({
      action: 'ARMORY_STRUCTURE_UPGRADE',
      category: 'upgrades',
      details: { newLevel: 3, conversions: [] },
    });
    expect(row(909)).toMatchObject({
      action: 'ARMORY_UPGRADE',
      category: 'equipment',
    });
    expect(row(913)).toMatchObject({
      category: 'training',
      details: { items: [{ name: 'Soldier', quantity: 10 }] },
    });
    expect(row(914)).toMatchObject({
      category: 'training',
      details: { items: [{ name: 'Soldier', quantity: 6 }] },
    });
    expect(row(1).details).toBeNull();
    expect(row(910).details).toBeNull();
    expect(row(911).details.items).toMatchObject([
      { name: 'Steeds', quantity: 4, kind: 'battleUpgrade' },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
    expect(JSON.stringify(res.body)).not.toContain('detail_source');
  } finally {
    await db.exec('DELETE FROM bank_history WHERE id >= 900');
  }
});

test.each(['en', 'de', 'es'])(
  'every structure upgrade the game records has a %s timeline label',
  (locale) => {
    const { actions } = JSON.parse(
      readFileSync(
        join(process.cwd(), `public/locales/${locale}/admin-activity.json`),
        'utf8',
      ),
    );
    // Structure.service writes `${upgradeType.toUpperCase()}_UPGRADE`.
    for (const upgradeType of [
      'fortifications',
      'houses',
      'economy',
      'offense',
      'armory',
      'spy',
      'racial',
    ]) {
      expect(actions).toHaveProperty(`${upgradeType.toUpperCase()}_UPGRADE`);
    }
    expect(actions).toHaveProperty('ARMORY_STRUCTURE_UPGRADE');
  },
);

test('only actions that record details can be missing them', () => {
  for (const action of [
    'TRAINING_TRAIN',
    'ARMORY_EQUIP',
    'ARMORY_STRUCTURE_UPGRADE',
    'BATTLE_UPGRADES_BUY',
    'FORTIFICATIONS_UPGRADE',
    'FORT_REPAIR',
    'PLAYER_TRANSFER',
    'HIRE_MERCENARY',
    'RENEW_MERCENARY',
  ]) {
    expect(recordsActivityDetails(action)).toBe(true);
  }
  for (const action of ['CHAT_SENT', 'RECRUIT', 'FRIEND_TRANSFER']) {
    expect(recordsActivityDetails(action)).toBe(false);
  }
});
