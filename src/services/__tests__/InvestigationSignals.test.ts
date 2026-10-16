import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { getInvestigationSignals, inspectCombatAccounting } =
  await import('../InvestigationSignals.service');
const db = new PGlite();
const statements: string[] = [];
const state = (gold: string, units = 100, turns = 100, stamina = 100) => ({
  gold,
  units: [{ type: 'OFFENSE', level: 1, quantity: units }],
  mercenaries: [],
  attackTurns: turns,
  stamina,
});
const balanced = {
  version: 1,
  before: { attacker: state('1000'), defender: state('2000') },
  after: { attacker: state('1100', 98, 90, 90), defender: state('1900', 90) },
};
const sample = {
  id: 1,
  attacker_id: 1,
  defender_id: 2,
  timestamp: new Date(),
  pillaged_gold: '100',
  attacker_losses_total: 2,
  defender_losses_total: 10,
  snapshots: balanced,
  turns: 10,
};

beforeAll(async () => {
  await db.exec(`
  CREATE TABLE users (id int PRIMARY KEY,display_name text,"isBot" boolean NOT NULL DEFAULT false);
  CREATE TABLE bank_history (id serial PRIMARY KEY,from_user_id int,to_user_id int,date_time timestamptz,history_type text,stats jsonb,gold_amount bigint);
  CREATE TABLE "LoginEvent" ("userId" int,"deviceHash" text,"occurredAt" timestamptz);
  CREATE TABLE attack_log (id serial PRIMARY KEY,attacker_id int,defender_id int,timestamp timestamptz,type text,winner int,pillaged_gold bigint,attacker_losses_total int,defender_losses_total int,stats jsonb);
  CREATE TABLE recruit_history (id serial PRIMARY KEY,from_user int,to_user int,timestamp timestamptz);
  CREATE TABLE alliance_bank_history (id serial PRIMARY KEY,alliance_id int,performed_by_user_id int,related_user_id int,created_at timestamptz,transaction_type text,amount bigint);
  CREATE TABLE "ChatMessage" (id serial PRIMARY KEY,"senderId" int,"sentAt" timestamptz,content text);
  INSERT INTO users SELECT n,'Player '||n,false FROM generate_series(1,30) n;
  INSERT INTO users VALUES (99,'Official bot',true);
  INSERT INTO bank_history(from_user_id,to_user_id,date_time,history_type,stats,gold_amount)
    SELECT source,1,now(),'FRIEND_TRANSFER','{"senderNote":"PRIVATE_TRANSFER_NOTE"}',100 FROM generate_series(2,4) source CROSS JOIN generate_series(1,2) n;
  INSERT INTO bank_history(from_user_id,to_user_id,date_time,history_type,stats,gold_amount)
    SELECT source,target,now(),'FRIEND_TRANSFER','{}',100 FROM (VALUES (5,6),(6,7),(7,5),(8,9),(9,8)) edge(source,target) CROSS JOIN generate_series(1,2) n;
  INSERT INTO bank_history(from_user_id,to_user_id,date_time,history_type,stats,gold_amount)
    SELECT source,10,now(),'FRIEND_TRANSFER','{"transferType":"FRIEND_TRANSFER_TAX"}',100 FROM generate_series(11,13) source CROSS JOIN generate_series(1,2) n;
  INSERT INTO bank_history(from_user_id,to_user_id,date_time,history_type,stats,gold_amount)
    SELECT source,99,now(),'FRIEND_TRANSFER','{}',100 FROM generate_series(11,13) source CROSS JOIN generate_series(1,2) n;
  INSERT INTO "LoginEvent" VALUES (1,'PRIVATE_HASH',now()),(2,'PRIVATE_HASH',now());
  INSERT INTO attack_log(attacker_id,defender_id,timestamp,type,winner,pillaged_gold,attacker_losses_total,defender_losses_total,stats)
    SELECT 14,15,now(),'attack',14,100,1,20,'{}' FROM generate_series(1,8);
  INSERT INTO attack_log(attacker_id,defender_id,timestamp,type,winner,pillaged_gold,attacker_losses_total,defender_losses_total,stats)
    SELECT 16,17,now(),'attack',16,100,NULL,20,'{}' FROM generate_series(1,8);
  INSERT INTO recruit_history(from_user,to_user,timestamp) SELECT 19,18,now() FROM generate_series(1,20);
  INSERT INTO recruit_history(from_user,to_user,timestamp) SELECT 21,20,now() FROM generate_series(1,19);
    INSERT INTO recruit_history(from_user,to_user,timestamp) VALUES (28,18,now());
  INSERT INTO alliance_bank_history(alliance_id,performed_by_user_id,related_user_id,created_at,transaction_type,amount)
    SELECT 1,22,23,now(),'WITHDRAWAL',100 FROM generate_series(1,5);
  INSERT INTO alliance_bank_history(alliance_id,performed_by_user_id,related_user_id,created_at,transaction_type,amount)
    SELECT 2,22,23,now(),'TAX',100 FROM generate_series(1,5);
  INSERT INTO "ChatMessage"("senderId","sentAt",content)
    SELECT 24,date_trunc('hour',now()),'PRIVATE_MESSAGE' FROM generate_series(1,50);
  INSERT INTO "ChatMessage"("senderId","sentAt",content)
    SELECT 25,date_trunc('hour',now()),'PRIVATE_MESSAGE' FROM generate_series(1,49);
  INSERT INTO "ChatMessage"("senderId","sentAt",content)
    SELECT 99,date_trunc('hour',now()),'PRIVATE_MESSAGE' FROM generate_series(1,60);
 `);
  const mismatch = structuredClone(balanced);
  mismatch.after.attacker.gold = '1200';
  await db.query(
    `INSERT INTO attack_log(attacker_id,defender_id,timestamp,type,winner,pillaged_gold,attacker_losses_total,defender_losses_total,stats) VALUES(26,27,now(),'attack',26,100,2,10,$1)`,
    [
      JSON.stringify({
        adminSnapshots: mismatch,
        turns: 10,
        replay: 'PRIVATE_REPLAY',
      }),
    ],
  );
  mockPrisma.$transaction = vi.fn(async (fn: any) =>
    db.transaction(async (pg) => {
      const query = async (sql: any) => {
        statements.push(sql.text);
        return (await pg.query(sql.text, sql.values)).rows;
      };
      return fn({
        $queryRaw: query,
        $executeRaw: async (input: any) => {
          const sql = Array.isArray(input)
            ? { text: input.join(''), values: [] }
            : input;
          statements.push(sql.text);
          await pg.query(sql.text, sql.values);
          return 0;
        },
        users: {
          findMany: async ({ where }: any) =>
            (
              await pg.query(
                'SELECT id,display_name FROM users WHERE id = ANY($1)',
                [where.id.in],
              )
            ).rows,
        },
      });
    }),
  );
});
afterAll(async () => db.close());

describe('read-only investigation detectors', () => {
  test('finds all seven patterns with correct attribution and exact evidence', async () => {
    const report = await getInvestigationSignals(7);
    expect(new Set(report.findings.map((f) => f.type)).size).toBe(7);
    const feed = report.findings.find((f) => f.type === 'ACCOUNT_FEEDING')!;
    expect(feed.players[0].id).toBe(1);
    expect(feed.count).toBe(6);
    expect(feed.metrics).toMatchObject({
      goldReceived: '600',
      distinctSenders: 3,
      sharedLoginPattern: true,
    });
    expect(
      report.findings.filter((f) => f.type === 'TRANSFER_RING'),
    ).toHaveLength(2);
    const ring = report.findings.find(
      (f) => f.type === 'TRANSFER_RING' && f.players.length === 3,
    )!;
    expect(ring.players.map((p) => p.id)).toEqual([5, 6, 7]);
    expect(ring.evidence).toHaveLength(3);
    expect(
      report.findings.find((f) => f.type === 'ALLIANCE_TREASURY')!.players[0]
        .id,
    ).toBe(23);
    expect(
      report.findings.find((f) => f.type === 'ATTACK_FARMING')!.count,
    ).toBe(8);
    expect(
      report.findings.find((f) => f.type === 'COMBAT_ACCOUNTING')!.metrics,
    ).toEqual({ attackerGoldObserved: '200', attackerGoldExpected: '100' });
    expect(report.snapshotCoverage).toMatchObject({
      scanned: 17,
      eligible: 1,
      missing: 16,
      capped: false,
    });
    const concentration = report.findings.find(
      (f) => f.type === 'RECRUITMENT_CONCENTRATION',
    )!;
    expect(concentration.players.map((p) => p.id)).toEqual([18, 19]);
    expect(concentration.metrics).toMatchObject({
      totalRecruitClicks: 21,
      targetRecruitClicks: 20,
    });
    expect(concentration.evidence[0]).toMatchObject({ from: 18, to: 19 });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('PRIVATE');
    expect(
      report.findings.flatMap((f) => f.players.map((p) => p.id)),
    ).not.toContain(99);
    expect(
      report.findings.find((f) => f.type === 'RECRUITMENT_CONCENTRATION')!
        .players[0].id,
    ).toBe(18);
    expect(
      report.findings.find((f) => f.type === 'SOCIAL_BURST')!.players[0].id,
    ).toBe(24);
    expect(statements[0]).toBe('SET TRANSACTION READ ONLY');
    expect(statements.every((sql) => /^\s*(SET|WITH|SELECT)/.test(sql))).toBe(
      true,
    );
  });
  test('does not flag consistent combat, missing history, or unsafe values', () => {
    expect(inspectCombatAccounting(sample).mismatches).toEqual({});
    expect(
      inspectCombatAccounting({ ...sample, snapshots: null }).eligible,
    ).toBe(false);
    const bad = structuredClone(balanced);
    bad.after.attacker.gold = 'invalid';
    const result = inspectCombatAccounting({ ...sample, snapshots: bad });
    expect(result.malformed).toBe(true);
    expect(result.mismatches).toEqual({});
    expect(
      inspectCombatAccounting({ ...sample, pillaged_gold: null }).mismatches,
    ).toEqual({});
  });
  test('preserves bigint precision and counts both casualties and wounded', () => {
    const big = structuredClone(balanced);
    big.before.attacker.gold = '900719925474099300';
    big.after.attacker.gold = '900719925474099400';
    expect(
      inspectCombatAccounting({ ...sample, snapshots: big }).mismatches,
    ).toEqual({});
    big.after.defender.units[0].quantity = 89;
    expect(
      inspectCombatAccounting({ ...sample, snapshots: big }).mismatches,
    ).toMatchObject({
      defenderUnitsObserved: '11',
      defenderUnitsExpected: '10',
    });
  });
  test('period boundaries omit records outside the chosen window', async () => {
    await db.exec("UPDATE bank_history SET date_time=now()-interval '40 days'");
    const report = await getInvestigationSignals(30);
    expect(
      report.findings.some((f) =>
        ['ACCOUNT_FEEDING', 'TRANSFER_RING'].includes(f.type),
      ),
    ).toBe(false);
  });
});
