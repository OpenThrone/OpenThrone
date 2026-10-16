/**
 * Re-simulates exported production battles with the current engine and diffs
 * against the stored outcome.
 *
 * Rerun: bun --no-env-file scripts/balance/replay-prod-sample.ts [sample.json] [deployCutoffISO]
 *
 * The sample (scripts/balance/output/prod-replays-sample.json) is produced on
 * production by decrypting each sealed replay and exporting the raw seed; the
 * encryption key is not available locally. Rows without a replay are skipped.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { BattleUser } from '@/models/BattleUser';
import { simulateBattle } from '@/utils/attackFunctions';
import type { CombatUserSnapshot } from '@/utils/combatReplay';
import { restoreBattleUser } from '@/utils/combatReplay';

const FILE =
  process.argv[2] ?? 'scripts/balance/output/prod-replays-sample.json';
// Commit d52aa97 (siege-clock forts) was deployed to production at 14:37Z on 2026-10-13.
const CUTOFF = new Date(process.argv[3] ?? '2026-10-13T14:37:00Z').getTime();
const DRAW_RANGE = 281474976710656;

function stream(seedHex: string, domain: string) {
  const seed = Buffer.from(seedHex, 'hex');
  const ctx = Buffer.from(`openthrone:combat-roll:v1\0${domain}\0`);
  const counterBytes = Buffer.alloc(8);
  let counter = 0;
  return () => {
    counterBytes.writeUInt32BE(Math.floor(counter / 4294967296), 0);
    // eslint-disable-next-line no-bitwise -- unsigned 32-bit counter for the seed stream
    counterBytes.writeUInt32BE(counter >>> 0, 4);
    counter += 1;
    const d = createHmac('sha256', seed)
      .update(ctx)
      .update(counterBytes)
      .digest();
    return d.readUIntBE(0, 6) / DRAW_RANGE;
  };
}

type Row = {
  id: number;
  timestamp: string;
  winner: number;
  attacker_id: number;
  replay: null | {
    domain: string;
    seedHex: string;
    attacker: CombatUserSnapshot;
    defender: CombatUserSnapshot;
    turns: number;
    defenderProtected: boolean;
    defenderDailyCasualtyRemaining: number;
    defenderDailyGoldRemaining: string;
  };
  replayError: string | null;
  forthpAtStart: number;
  forthpAtEnd: number;
  attacker_losses_total: number;
  defender_losses_total: number;
  pillagedGold: string;
  xpEarned: string;
  canonical_outcome: { reason?: string; winner?: string } | null;
};

const sum = (xs: Array<{ quantity: number }> | undefined) =>
  (xs ?? []).reduce((s, x) => s + x.quantity, 0);
const pct = (start: number, end: number) =>
  start > 0 ? ((start - end) / start) * 100 : 0;
function bucket(p: number) {
  if (p <= 0) return '0';
  if (p <= 10) return '1-10%';
  if (p <= 30) return '11-30%';
  if (p < 100) return '31-99%';
  return '100%';
}
const BUCKETS = ['0', '1-10%', '11-30%', '31-99%', '100%'];

async function main() {
  const rows: Row[] = JSON.parse(readFileSync(FILE, 'utf8'));
  const diffs: Array<Record<string, unknown>> = [];
  let skipped = 0;
  let unsealable = 0;
  let winnerChanges = 0;
  let oneTurn = 0;
  let oneTurnLoot = 0n;
  let totalLoot = 0n;
  const hist = {
    old: {} as Record<string, number>,
    new: {} as Record<string, number>,
  };
  const tot = {
    oldAL: 0,
    newAL: 0,
    oldDL: 0,
    newDL: 0,
    oldLoot: 0n,
    newLoot: 0n,
  };
  let breachOld = 0;
  let breachNew = 0;
  let postDeploy = 0;
  let postMismatch = 0;
  const simulated: number[] = [];

  for (const row of rows) {
    if (!row.replay) {
      if (row.replayError === 'no replay') skipped += 1;
      else unsealable += 1;
      continue;
    }
    const r = row.replay;
    const attacker: BattleUser = restoreBattleUser(r.attacker);
    const defender: BattleUser = restoreBattleUser(r.defender);
    const res = await simulateBattle(
      attacker,
      defender,
      r.defender.fortHitpoints,
      r.turns,
      false,
      r.defenderProtected,
      {
        random: stream(r.seedHex, r.domain),
        defenderDailyCasualtyRemaining: r.defenderDailyCasualtyRemaining,
        defenderDailyGoldRemaining: BigInt(r.defenderDailyGoldRemaining),
      },
    );
    simulated.push(row.id);
    const newAttackerWon = res.result === 'WIN';
    const oldAttackerWon = row.winner === row.attacker_id;
    const newAL = res.Losses.Attacker.total + sum(res.wounded?.attacker);
    const newDL = res.Losses.Defender.total + sum(res.wounded?.defender);
    const newLoot = BigInt(res.pillagedGold);
    const oldLoot = BigInt(row.pillagedGold);
    const xp = JSON.parse(row.xpEarned ?? '{}');
    const newXp = res.experienceGained;
    const oldFortPct = pct(row.forthpAtStart, row.forthpAtEnd);
    const newFortPct = pct(r.defender.fortHitpoints, res.finalFortHP);
    const reasonOld = row.canonical_outcome?.reason ?? null;
    const reasonNew = res.canonicalOutcome?.reason ?? null;

    if (newAttackerWon !== oldAttackerWon) winnerChanges += 1;
    hist.old[bucket(oldFortPct)] = (hist.old[bucket(oldFortPct)] ?? 0) + 1;
    hist.new[bucket(newFortPct)] = (hist.new[bucket(newFortPct)] ?? 0) + 1;
    if (row.forthpAtEnd <= 0) breachOld += 1;
    if (res.finalFortHP <= 0) breachNew += 1;
    tot.oldAL += row.attacker_losses_total;
    tot.newAL += newAL;
    tot.oldDL += row.defender_losses_total;
    tot.newDL += newDL;
    tot.oldLoot += oldLoot;
    tot.newLoot += newLoot;
    totalLoot += oldLoot;
    if (r.turns === 1) {
      oneTurn += 1;
      oneTurnLoot += oldLoot;
    }

    const mism: string[] = [];
    if (newAttackerWon !== oldAttackerWon) mism.push('winner');
    if (reasonOld !== reasonNew) mism.push(`reason ${reasonOld}->${reasonNew}`);
    if (Math.abs(row.forthpAtEnd - res.finalFortHP) > 1e-6) mism.push('fortHP');
    if (row.attacker_losses_total !== newAL) mism.push('attLoss');
    if (row.defender_losses_total !== newDL) mism.push('defLoss');
    if (oldLoot !== newLoot) mism.push('loot');
    if (xp.attacker !== newXp.attacker || xp.defender !== newXp.defender)
      mism.push('xp');

    const isPost = new Date(row.timestamp).getTime() >= CUTOFF;
    if (isPost) {
      postDeploy += 1;
      if (mism.length) postMismatch += 1;
    }
    const magnitude =
      Math.abs(newFortPct - oldFortPct) +
      Math.abs(newAL - row.attacker_losses_total) +
      Math.abs(newDL - row.defender_losses_total) +
      Number(newLoot > oldLoot ? newLoot - oldLoot : oldLoot - newLoot) / 1000;
    diffs.push({
      id: row.id,
      post: isPost,
      turns: r.turns,
      mism: mism.join('; ') || '-',
      fort: `${oldFortPct.toFixed(0)}% -> ${newFortPct.toFixed(0)}%`,
      att: `${row.attacker_losses_total} -> ${newAL}`,
      def: `${row.defender_losses_total} -> ${newDL}`,
      loot: `${oldLoot} -> ${newLoot}`,
      xp: `${xp.attacker}/${xp.defender} -> ${newXp.attacker}/${newXp.defender}`,
      magnitude,
    });
  }

  const n = simulated.length;
  console.log(
    `rows=${rows.length} simulated=${n} noReplay=${skipped} unsealable=${unsealable}`,
  );
  if (!n) return;
  console.log(`winner changes: ${winnerChanges}/${n}`);
  console.log('fort damage histogram (old / new):');
  for (const b of BUCKETS)
    console.log(`  ${b.padEnd(8)} ${hist.old[b] ?? 0} / ${hist.new[b] ?? 0}`);
  console.log(`breaches old/new: ${breachOld}/${breachNew}`);
  console.log(
    `attacker losses old/new: ${tot.oldAL}/${tot.newAL}; defender losses old/new: ${tot.oldDL}/${tot.newDL}`,
  );
  console.log(`loot old/new: ${tot.oldLoot}/${tot.newLoot}`);
  console.log(
    `1-turn raids: ${oneTurn}/${n}, share of old loot: ${totalLoot > 0n ? (Number((oneTurnLoot * 10000n) / totalLoot) / 100).toFixed(2) : 'n/a'}%`,
  );
  console.log(
    `post-deploy battles: ${postDeploy}, determinism mismatches: ${postMismatch}`,
  );
  console.log('top changes:');
  diffs.sort((a, b) => (b.magnitude as number) - (a.magnitude as number));
  for (const d of diffs.slice(0, 10)) {
    const { magnitude: _m, ...rest } = d;
    console.log(' ', JSON.stringify(rest));
  }
}

main();
