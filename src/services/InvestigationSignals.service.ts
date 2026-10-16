import prisma from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import type {
  InvestigationFinding,
  InvestigationReport,
  InvestigationType,
} from '@/types/investigation';
import { asRecord } from '@/utils/adminCombat';
import { getOTStartDate } from '@/utils/timefunctions';

const FINDINGS_PER_TYPE = 25;
const SNAPSHOT_SCAN_LIMIT = 1000;
type Evidence = InvestigationFinding['evidence'];
interface FindingRow {
  key: string;
  player_ids: number[];
  count: bigint | number;
  first_seen: Date;
  last_seen: Date;
  metrics: InvestigationFinding['metrics'];
  evidence: Evidence;
}
interface SnapshotRow {
  id: number;
  attacker_id: number;
  defender_id: number;
  timestamp: Date;
  pillaged_gold: bigint | string | null;
  attacker_losses_total: number | null;
  defender_losses_total: number | null;
  snapshots: unknown;
  turns: unknown;
}
const integer = (value: unknown): bigint | null => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  if (
    !['string', 'number', 'bigint'].includes(typeof value) ||
    !/^-?\d+$/.test(String(value))
  )
    return null;
  return BigInt(String(value));
};
function rosterTotal(value: unknown): bigint | null {
  const state = asRecord(value);
  if (!Array.isArray(state.units) || !Array.isArray(state.mercenaries))
    return null;
  let total = 0n;
  for (const unit of [...state.units, ...state.mercenaries]) {
    const quantity = integer(asRecord(unit).quantity);
    if (quantity == null || quantity < 0n) return null;
    total += quantity;
  }
  return total;
}
/** Unknown values never become zero or an accusation. Only complete captured pairs are compared. */
export function inspectCombatAccounting(row: SnapshotRow) {
  const snapshots = asRecord(row.snapshots);
  if (snapshots.version !== 1)
    return { eligible: false, malformed: false, mismatches: {} };
  const before = asRecord(snapshots.before);
  const after = asRecord(snapshots.after);
  const a = asRecord(before.attacker);
  const b = asRecord(after.attacker);
  const d = asRecord(before.defender);
  const e = asRecord(after.defender);
  const checks: Array<[string, bigint | null, bigint | null, bigint | null]> = [
    [
      'attackerGold',
      integer(b.gold),
      integer(a.gold),
      integer(row.pillaged_gold),
    ],
    [
      'defenderGold',
      integer(d.gold),
      integer(e.gold),
      integer(row.pillaged_gold),
    ],
    [
      'attackTurns',
      integer(a.attackTurns),
      integer(b.attackTurns),
      integer(row.turns),
    ],
    ['stamina', integer(a.stamina), integer(b.stamina), integer(row.turns)],
    [
      'attackerUnits',
      rosterTotal(a),
      rosterTotal(b),
      integer(row.attacker_losses_total),
    ],
    [
      'defenderUnits',
      rosterTotal(d),
      rosterTotal(e),
      integer(row.defender_losses_total),
    ],
  ];
  const mismatches: Record<string, string> = {};
  let malformed = false;
  let compared = 0;
  for (const [key, left, right, expected] of checks) {
    if (left == null || right == null || expected == null) {
      malformed = true;
      continue;
    }
    compared++;
    if (left - right !== expected) {
      mismatches[`${key}Observed`] = (left - right).toString();
      mismatches[`${key}Expected`] = expected.toString();
    }
  }
  return { eligible: compared > 0, malformed, mismatches };
}

/** All detector queries run in an enforced read-only transaction. No signals or account state are written. */
export async function getInvestigationSignals(
  days = 7,
): Promise<InvestigationReport> {
  const since = getOTStartDate(-(days - 1));
  const until = new Date();
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '10000'`;
      const query = <T>(sql: Prisma.Sql): Promise<T[]> =>
        tx.$queryRaw(sql) as Promise<T[]>;
      const humans = Prisma.sql`humans AS (SELECT id FROM users WHERE id > 0 AND "isBot" = false)`;
      const transfers = Prisma.sql`WITH ${humans}, transfers AS (
      SELECT b.* FROM bank_history b JOIN humans sender ON sender.id = b.from_user_id JOIN humans recipient ON recipient.id = b.to_user_id
      WHERE b.date_time >= ${since} AND b.date_time <= ${until} AND b.history_type = 'FRIEND_TRANSFER'
        AND COALESCE(b.stats->>'transferType', '') <> 'FRIEND_TRANSFER_TAX' AND b.gold_amount > 0 AND b.from_user_id <> b.to_user_id
    )`;
      const feeding =
        await query<FindingRow>(Prisma.sql`${transfers}, incoming AS (
      SELECT to_user_id, COUNT(*) AS count, MIN(date_time) AS first_seen, MAX(date_time) AS last_seen,
        SUM(gold_amount)::text AS gold, (array_agg(DISTINCT from_user_id))[1:20] AS sources,
        COUNT(DISTINCT from_user_id) AS senders,
        (array_agg(jsonb_build_object('kind','transaction','id',id,'at',date_time,'from',from_user_id,'to',to_user_id,'gold',gold_amount::text) ORDER BY date_time DESC,id DESC))[1:10] AS evidence
      FROM transfers GROUP BY to_user_id HAVING COUNT(*) >= 6 AND COUNT(DISTINCT from_user_id) >= 3
    ) SELECT to_user_id::text AS key, ARRAY[to_user_id] || sources AS player_ids, count, first_seen, last_seen,
      jsonb_build_object('goldReceived', gold, 'distinctSenders', senders, 'sharedLoginPattern', EXISTS (
        SELECT 1 FROM "LoginEvent" a JOIN "LoginEvent" b ON a."deviceHash" = b."deviceHash"
        WHERE a."userId" = incoming.to_user_id AND b."userId" = ANY(incoming.sources) AND a."deviceHash" IS NOT NULL
          AND a."occurredAt" >= GREATEST(${since}::timestamptz, ${until}::timestamptz - interval '30 days') AND b."occurredAt" >= GREATEST(${since}::timestamptz, ${until}::timestamptz - interval '30 days')
          AND a."occurredAt" <= ${until} AND b."occurredAt" <= ${until}
      )) AS metrics, evidence FROM incoming ORDER BY count DESC,to_user_id LIMIT ${FINDINGS_PER_TYPE + 1}`);
      const rings = await query<FindingRow>(Prisma.sql`${transfers}, edges AS (
      SELECT from_user_id AS a, to_user_id AS b, COUNT(*) AS count, MIN(date_time) AS first_seen, MAX(date_time) AS last_seen,
        SUM(gold_amount) AS gold, MIN(id) AS sample FROM transfers GROUP BY 1,2 HAVING COUNT(*) >= 2
    ), cycles AS (
      SELECT ARRAY[x.a,x.b] AS members, x.count+y.count AS count, LEAST(x.first_seen,y.first_seen) AS first_seen,
        GREATEST(x.last_seen,y.last_seen) AS last_seen, x.gold+y.gold AS gold, ARRAY[x.sample,y.sample] AS samples
      FROM edges x JOIN edges y ON x.a=y.b AND x.b=y.a WHERE x.a<x.b
      UNION ALL
      SELECT ARRAY(SELECT unnest(ARRAY[x.a,x.b,y.b]) ORDER BY 1), x.count+y.count+z.count,
        LEAST(x.first_seen,y.first_seen,z.first_seen), GREATEST(x.last_seen,y.last_seen,z.last_seen), x.gold+y.gold+z.gold, ARRAY[x.sample,y.sample,z.sample]
      FROM edges x JOIN edges y ON x.b=y.a JOIN edges z ON y.b=z.a AND z.b=x.a
      WHERE x.a<x.b AND x.a<y.b AND x.b<>y.b
    ) SELECT members::text || samples::text AS key, members AS player_ids, count, first_seen,last_seen,
      jsonb_build_object('goldCirculated',gold::text,'accounts',cardinality(members)) AS metrics,
      ARRAY(SELECT jsonb_build_object('kind','transaction','id',id) FROM unnest(samples) id) AS evidence
      FROM cycles ORDER BY count DESC,members,samples LIMIT ${FINDINGS_PER_TYPE + 1}`);
      const farming =
        await query<FindingRow>(Prisma.sql`WITH ${humans} SELECT a.attacker_id::text || ':' || a.defender_id AS key,
      ARRAY[a.attacker_id,a.defender_id] AS player_ids, COUNT(*) AS count, MIN(a.timestamp) AS first_seen, MAX(a.timestamp) AS last_seen,
      jsonb_build_object('wins',COUNT(*) FILTER (WHERE a.winner=a.attacker_id),'goldPillaged',SUM(a.pillaged_gold)::text,
        'attackerLosses',SUM(a.attacker_losses_total),'defenderLosses',SUM(a.defender_losses_total)) AS metrics,
      (array_agg(jsonb_build_object('kind','attack','id',a.id,'at',a.timestamp,'from',a.attacker_id,'to',a.defender_id,'gold',a.pillaged_gold::text) ORDER BY a.timestamp DESC,a.id DESC))[1:10] AS evidence
      FROM attack_log a JOIN humans h ON h.id=a.attacker_id JOIN humans d ON d.id=a.defender_id
      WHERE a.type='attack' AND a.timestamp>=${since} AND a.timestamp<=${until}
      GROUP BY a.attacker_id,a.defender_id HAVING COUNT(*)>=8
        AND COUNT(*) FILTER (WHERE a.winner=a.attacker_id)*10>=COUNT(*)*9
        AND SUM(a.pillaged_gold)>0 AND COUNT(a.attacker_losses_total)=COUNT(*) AND COUNT(a.defender_losses_total)=COUNT(*)
        AND SUM(a.defender_losses_total)>0 AND SUM(a.attacker_losses_total)*10<=SUM(a.defender_losses_total)
      ORDER BY count DESC,a.attacker_id,a.defender_id LIMIT ${FINDINGS_PER_TYPE + 1}`);
      // Recruitment stores the link owner in from_user and clicking actor in to_user.
      const recruiting =
        await query<FindingRow>(Prisma.sql`WITH ${humans}, clicks AS (
      SELECT r.id,r.to_user AS actor,r.from_user AS target,r.timestamp FROM recruit_history r
      JOIN humans h ON h.id=r.to_user JOIN humans target ON target.id=r.from_user
      WHERE r.timestamp>=${since} AND r.timestamp<=${until} AND r.from_user<>r.to_user
    ), totals AS (SELECT actor,COUNT(*) AS total FROM clicks GROUP BY actor)
      SELECT r.actor::text || ':' || r.target AS key, ARRAY[r.actor,r.target] AS player_ids,COUNT(*) AS count,
        MIN(r.timestamp) AS first_seen,MAX(r.timestamp) AS last_seen,jsonb_build_object('totalRecruitClicks',t.total,'targetRecruitClicks',COUNT(*)) AS metrics,
        (array_agg(jsonb_build_object('kind','recruitment','id',r.id,'at',r.timestamp,'from',r.actor,'to',r.target) ORDER BY r.timestamp DESC,r.id DESC))[1:10] AS evidence
      FROM clicks r JOIN totals t ON r.actor=t.actor GROUP BY r.actor,r.target,t.total
      HAVING t.total>=20 AND COUNT(*)*5>=t.total*4 ORDER BY count DESC,r.actor,r.target LIMIT ${FINDINGS_PER_TYPE + 1}`);
      const treasury =
        await query<FindingRow>(Prisma.sql`WITH ${humans}, withdrawals AS (
      SELECT b.*, COALESCE(b.related_user_id,b.performed_by_user_id) AS beneficiary FROM alliance_bank_history b
      JOIN humans h ON h.id=b.performed_by_user_id JOIN humans recipient ON recipient.id=COALESCE(b.related_user_id,b.performed_by_user_id)
      WHERE b.created_at>=${since} AND b.created_at<=${until} AND b.transaction_type::text IN ('WITHDRAWAL','LOAN') AND b.amount>0
    ), totals AS (SELECT alliance_id,SUM(amount) AS total FROM withdrawals GROUP BY alliance_id)
      SELECT b.alliance_id::text || ':' || b.beneficiary AS key, ARRAY[b.beneficiary] || (array_agg(DISTINCT b.performed_by_user_id))[1:20] AS player_ids,
        COUNT(*) AS count,MIN(b.created_at) AS first_seen,MAX(b.created_at) AS last_seen,
        jsonb_build_object('allianceId',b.alliance_id,'goldReceived',SUM(b.amount)::text,'allianceOutflow',t.total::text) AS metrics,
        (array_agg(jsonb_build_object('kind','alliance','id',b.id,'at',b.created_at,'from',b.performed_by_user_id,'to',b.beneficiary,'gold',b.amount::text) ORDER BY b.created_at DESC,b.id DESC))[1:10] AS evidence
      FROM withdrawals b JOIN totals t ON b.alliance_id=t.alliance_id GROUP BY b.alliance_id,b.beneficiary,t.total
      HAVING COUNT(*)>=5 AND SUM(b.amount)*5>=t.total*4 ORDER BY count DESC,b.alliance_id,b.beneficiary LIMIT ${FINDINGS_PER_TYPE + 1}`);
      const social =
        await query<FindingRow>(Prisma.sql`WITH ${humans}, bursts AS (
      SELECT m.*, to_timestamp(floor(extract(epoch from m."sentAt")/600)*600) AS bucket
      FROM "ChatMessage" m JOIN humans h ON h.id=m."senderId" WHERE m."sentAt">=${since} AND m."sentAt"<=${until}
    ) SELECT "senderId"::text || ':' || bucket::text AS key, ARRAY["senderId"] AS player_ids,COUNT(*) AS count,
      MIN("sentAt") AS first_seen,MAX("sentAt") AS last_seen,jsonb_build_object('messages',COUNT(*),'minutes',10) AS metrics,
      (array_agg(jsonb_build_object('kind','chat','id',id,'at',"sentAt",'from',"senderId") ORDER BY "sentAt" DESC,id DESC))[1:10] AS evidence
      FROM bursts GROUP BY "senderId",bucket HAVING COUNT(*)>=50 ORDER BY count DESC,"senderId",bucket LIMIT ${FINDINGS_PER_TYPE + 1}`);
      const snapshots =
        await query<SnapshotRow>(Prisma.sql`WITH ${humans} SELECT a.id,a.attacker_id,a.defender_id,a.timestamp,a.pillaged_gold,
      a.attacker_losses_total,a.defender_losses_total,a.stats->'adminSnapshots' AS snapshots,a.stats->'turns' AS turns
      FROM attack_log a JOIN humans h ON h.id=a.attacker_id JOIN humans d ON d.id=a.defender_id
      WHERE a.type='attack' AND a.timestamp>=${since} AND a.timestamp<=${until} ORDER BY a.id DESC LIMIT ${SNAPSHOT_SCAN_LIMIT + 1}`);
      const limitedTypes: InvestigationType[] = [];
      const findings: InvestigationFinding[] = [];
      function add(type: InvestigationType, rows: FindingRow[]) {
        if (rows.length > FINDINGS_PER_TYPE) limitedTypes.push(type);
        for (const row of rows.slice(0, FINDINGS_PER_TYPE))
          findings.push({
            key: `${type}:${row.key}`,
            type,
            players: [...new Set(row.player_ids)].map((id) => ({
              id,
              name: `#${id}`,
            })),
            count: Number(row.count),
            firstSeen: new Date(row.first_seen).toISOString(),
            lastSeen: new Date(row.last_seen).toISOString(),
            metrics: row.metrics,
            evidence: row.evidence,
          });
      }
      add('ACCOUNT_FEEDING', feeding);
      add('TRANSFER_RING', rings);
      add('ATTACK_FARMING', farming);
      add('RECRUITMENT_CONCENTRATION', recruiting);
      add('ALLIANCE_TREASURY', treasury);
      add('SOCIAL_BURST', social);
      const coverage = {
        scanned: Math.min(snapshots.length, SNAPSHOT_SCAN_LIMIT),
        eligible: 0,
        missing: 0,
        malformed: 0,
        capped: snapshots.length > SNAPSHOT_SCAN_LIMIT,
      };
      const mismatches: FindingRow[] = [];
      for (const row of snapshots.slice(0, SNAPSHOT_SCAN_LIMIT)) {
        const result = inspectCombatAccounting(row);
        if (asRecord(row.snapshots).version !== 1) coverage.missing++;
        if (result.eligible) coverage.eligible++;
        if (result.malformed) coverage.malformed++;
        if (Object.keys(result.mismatches).length)
          mismatches.push({
            key: String(row.id),
            player_ids: [row.attacker_id, row.defender_id],
            count: 1,
            first_seen: row.timestamp,
            last_seen: row.timestamp,
            metrics: result.mismatches,
            evidence: [{ kind: 'attack', id: row.id }],
          });
      }
      add('COMBAT_ACCOUNTING', mismatches);
      const ids = [
        ...new Set(findings.flatMap((f) => f.players.map((p) => p.id))),
      ];
      const users = ids.length
        ? await tx.users.findMany({
            where: { id: { in: ids } },
            select: { id: true, display_name: true },
          })
        : [];
      const names = new Map(users.map((user) => [user.id, user.display_name]));
      for (const finding of findings)
        for (const player of finding.players)
          player.name = names.get(player.id) ?? `#${player.id}`;
      return {
        since: since.toISOString(),
        until: until.toISOString(),
        findings,
        limitedTypes,
        snapshotCoverage: coverage,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30000,
    },
  );
}
