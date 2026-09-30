/**
 * War simulation harness: multi-attack days, dogpiles, week-long campaigns,
 * siege preparation, and defender counterplay — all through the REAL combat
 * engine (executeAttack / simulateInfiltration), with between-battle world
 * mechanics mirroring the daily cron (wounded healing, fort repair,
 * throughput-bounded retraining, banking).
 *
 * Run: bun scripts/balance/war-simulation.ts [--verbose] [--json] [--no-artifact]
 */
import { Fortifications, HouseUpgrades, levelXPArray } from '@/constants';
import UserModel from '@/models/Users';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { captureLogs, setLogLevel } from '@/utils/logger';
import { executeAttack } from '@/utils/attackFunctions';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { createSeededRandom } from '@/utils/random';
import { simulateInfiltration } from '@/utils/spyFunctions';
import { UnitTypes } from '@/constants';

import {
  envSnapshot,
  parseFlags,
  serializeReport,
  writeArtifact,
} from './lib/report';

const ARTIFACT_NAME = 'latest-war-simulation.json';

type UnitSpec = Array<[string, number, number]>;

function buildUser(opts: {
  race: string;
  level: number;
  fortLevel: number;
  fortHpOverride?: number;
  gold: bigint;
  units: UnitSpec;
}): UserModel {
  const g = new MockUserGenerator();
  g.setLevel(opts.level)
    .setFortLevel(opts.fortLevel)
    .setFortHitpoints(
      opts.fortHpOverride ??
        Fortifications.find((f) => f.level === opts.fortLevel)?.hitpoints ??
        500,
    )
    .adjustGold(opts.gold - 25000n)
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades();
  g.addUnits(
    opts.units.map(([type, level, quantity], i) => ({
      id: i,
      userId: 1,
      type,
      level,
      quantity,
      isMercenary: false,
    })) as any,
  );
  const raw = g.getUser() as any;
  raw.race = opts.race;
  raw.class = 'FIGHTER';
  raw.experience = levelXPArray.find((l) => l.level === opts.level)?.xp ?? 0;
  return new UserModel(raw);
}

/** The scenario's recurring cast. */
function raider(
  knights = 10000,
  gold = 1_000_000n,
  infiltrators = 0,
): UserModel {
  const units: UnitSpec = [['OFFENSE', 2, knights]];
  if (infiltrators > 0) units.push(['SPY', 2, infiltrators]);
  return buildUser({
    race: 'HUMAN',
    level: 25,
    fortLevel: 6,
    gold,
    units,
  });
}

function fortress(gold = 5_000_000n, fortLevel = 5): UserModel {
  return buildUser({
    race: 'UNDEAD',
    level: 20,
    fortLevel,
    gold,
    units: [
      ['DEFENSE', 2, 4000],
      ['DEFENSE', 1, 1000],
      ['WORKER', 1, 5000],
      ['OFFENSE', 2, 5000],
    ],
  });
}

interface WoundPool {
  groups: Array<{ type: string; level: number; quantity: number }>;
}

interface CombatantState {
  user: UserModel;
  wounds: WoundPool;
  retrained: number;
  goldSpentRetrain: bigint;
  goldSpentRepair: bigint;
  goldPillaged: bigint;
  goldBanked: bigint;
  attacksLaunched: number;
  attacksReceived: number;
}

function combatant(user: UserModel): CombatantState {
  return {
    user,
    wounds: { groups: [] },
    retrained: 0,
    goldSpentRetrain: 0n,
    goldSpentRepair: 0n,
    goldPillaged: 0n,
    goldBanked: 0n,
    attacksLaunched: 0,
    attacksReceived: 0,
  };
}

const unitCount = (user: UserModel, type: string): number =>
  [...(user.units ?? []), ...(user.mercenaries ?? [])]
    .filter((u: any) => u.type === type)
    .reduce((s, u) => s + (u.quantity ?? 0), 0);

const totalPop = (user: UserModel): number =>
  [...(user.units ?? []), ...(user.mercenaries ?? [])].reduce(
    (s, u) => s + (u.quantity ?? 0),
    0,
  );

const fortMaxHp = (user: UserModel): number =>
  Fortifications.find((f) => f.level === user.fortLevel)?.hitpoints ?? 50;

interface DayContext {
  day: number;
  defenderLossesToday: Record<number, number>;
  defenderGoldToday: Record<number, bigint>;
  pairAttacksToday: Record<string, number>;
}

function newDay(day: number): DayContext {
  return {
    day,
    defenderLossesToday: {},
    defenderGoldToday: {},
    pairAttacksToday: {},
  };
}

interface AttackRecord {
  day: number;
  label: string;
  turns: number;
  verdict: string;
  reason: string;
  attKilled: number;
  attWounded: number;
  defKilled: number;
  defWounded: number;
  gold: bigint;
  fortEndPct: number;
}

interface WarWorld {
  attacks: AttackRecord[];
  days: Array<{
    day: number;
    note: string;
    attKnights: number;
    defPop: number;
    defLine: number;
    fortPct: number;
    attGold: bigint;
    defGold: bigint;
  }>;
}

async function attackOnce(
  attacker: CombatantState,
  defender: CombatantState,
  turns: number,
  label: string,
  ctx: DayContext,
  world: WarWorld,
  seed: string,
): Promise<AttackRecord> {
  const defId = defender.user.id ?? 0;
  const lossesToday = ctx.defenderLossesToday[defId] ?? 0;
  const goldToday = ctx.defenderGoldToday[defId] ?? 0n;
  const throughput = 270; // capacity: 250 clicks + modest housing
  const casualtyAllowance = Math.max(
    0,
    Math.floor(throughput * V5_COMBAT_CONSTANTS.DAILY_CASUALTY_RECOVERY_DAYS) -
      lossesToday,
  );
  const goldCeiling =
    (BigInt(defender.user.gold) *
      BigInt(Math.floor(V5_COMBAT_CONSTANTS.DAILY_GOLD_PILLAGE_SHARE_CAP * 100))) /
    BigInt(100);
  const goldAllowance = goldCeiling > goldToday ? goldCeiling - goldToday : 0n;

  const result = await executeAttack(
    attacker.user as any,
    defender.user as any,
    turns,
    false,
    {
      random: createSeededRandom(seed),
      defenderDailyCasualtyRemaining: casualtyAllowance,
      defenderDailyGoldRemaining: goldAllowance,
    },
  );
  // The engine tracks fort HP in battle state; carry it back to the world.
  defender.user.fortHitpoints = Math.max(
    0,
    Number((result as any).finalFortHP ?? defender.user.fortHitpoints ?? 0),
  );

  const woundedOf = (side: 'attacker' | 'defender') =>
    ((result as any).wounded?.[side] ?? []).reduce(
      (s: number, w: any) => s + w.quantity,
      0,
    );
  const record: AttackRecord = {
    day: ctx.day,
    label,
    turns,
    verdict: result.result,
    reason: (result as any).canonicalOutcome?.reason ?? '?',
    attKilled: result.Losses.Attacker.total,
    attWounded: woundedOf('attacker'),
    defKilled: result.Losses.Defender.total,
    defWounded: woundedOf('defender'),
    gold: result.pillagedGold ?? 0n,
    fortEndPct: Math.round(((result as any).finalFortHP / fortMaxHp(defender.user)) * 100),
  };

  // World bookkeeping
  attacker.user.gold = BigInt(attacker.user.gold) + record.gold;
  attacker.goldPillaged += record.gold;
  attacker.attacksLaunched += 1;
  defender.attacksReceived += 1;
  for (const side of [attacker, defender]) {
    const groups = (result as any).wounded?.[
      side === attacker ? 'attacker' : 'defender'
    ] ?? [];
    for (const g of groups) {
      const match = side.wounds.groups.find(
        (w) => w.type === g.type && w.level === g.level,
      );
      if (match) match.quantity += g.quantity;
      else side.wounds.groups.push({ ...g });
    }
  }
  ctx.defenderLossesToday[defId] = lossesToday + record.defKilled;
  ctx.defenderGoldToday[defId] = goldToday + record.gold;
  const pairKey = `${attacker.user.id ?? 0}->${defId}`;
  ctx.pairAttacksToday[pairKey] = (ctx.pairAttacksToday[pairKey] ?? 0) + 1;
  world.attacks.push(record);
  return record;
}

/** Daily world tick mirroring the cron: healing, repair, retraining, banking. */
function endOfDay(
  defender: CombatantState,
  attacker: CombatantState,
  policy: 'fortress' | 'banker',
  world: WarWorld,
  note: string,
): void {
  const heal = (c: CombatantState): number => {
    let healed = 0;
    for (const group of c.wounds.groups) {
      const healQty = Math.min(
        group.quantity,
        Math.max(1, Math.floor(group.quantity * V5_COMBAT_CONSTANTS.WOUNDED_HEAL_RATE_DAILY)),
      );
      group.quantity -= healQty;
      healed += healQty;
      const stack = [...(c.user.units ?? [])].find(
        (u: any) => u.type === group.type && u.level === group.level,
      );
      if (stack) stack.quantity += healQty;
    }
    c.wounds.groups = c.wounds.groups.filter((g) => g.quantity > 0);
    return healed;
  };

  const retrain = (c: CombatantState, types: string[]): void => {
    const throughput = 270;
    let slots = throughput;
    for (const type of types) {
      const stacks = [...(c.user.units ?? [])]
        .filter((u: any) => u.type === type)
        .sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0));
      for (const stack of stacks) {
        if (slots <= 0) break;
        const info = UnitTypes.find(
          (u: any) => u.type === stack.type && u.level === stack.level,
        );
        const cost = BigInt(info?.cost ?? 0);
        if (cost <= 0n) continue;
        const affordable = Number(BigInt(c.user.gold) / cost);
        const qty = Math.min(slots, affordable);
        if (qty <= 0) break;
        stack.quantity += qty;
        slots -= qty;
        c.user.gold = BigInt(c.user.gold) - cost * BigInt(qty);
        c.retrained += qty;
        c.goldSpentRetrain += cost * BigInt(qty);
      }
    }
  };

  const healedDef = heal(defender);
  const healedAtt = heal(attacker);

  if (policy === 'fortress') {
    const fort = Fortifications.find((f) => f.level === defender.user.fortLevel);
    const costPerPoint = BigInt(fort?.costPerRepairPoint ?? 0);
    const maxHp = fort?.hitpoints ?? 0;
    const current = Number(defender.user.fortHitpoints ?? 0);
    const pointsNeeded = Math.max(0, maxHp - current);
    if (pointsNeeded > 0 && costPerPoint > 0n) {
      const affordable = Number(BigInt(defender.user.gold) / costPerPoint);
      const repair = Math.min(pointsNeeded, affordable);
      defender.user.fortHitpoints = current + repair;
      defender.user.gold =
        BigInt(defender.user.gold) - costPerPoint * BigInt(repair);
      defender.goldSpentRepair += costPerPoint * BigInt(repair);
    }
    retrain(defender, ['DEFENSE', 'OFFENSE']);
  } else {
    // Banker: everything on hand goes to the bank where raiders can't touch it.
    defender.goldBanked += BigInt(defender.user.gold);
    defender.user.gold = 0n;
    retrain(defender, ['DEFENSE', 'OFFENSE']);
  }

  retrain(attacker, ['OFFENSE']);

  world.days.push({
    day: 0, // filled by caller
    note,
    attKnights: unitCount(attacker.user, 'OFFENSE'),
    defPop: totalPop(defender.user),
    defLine: unitCount(defender.user, 'DEFENSE'),
    fortPct: Math.round(
      ((defender.user.fortHitpoints ?? 0) / fortMaxHp(defender.user)) * 100,
    ),
    attGold: BigInt(attacker.user.gold),
    defGold: BigInt(defender.user.gold),
  });
  void healedDef;
  void healedAtt;
}

function fmtRecord(r: AttackRecord): string {
  return (
    `  d${r.day} ${r.label.padEnd(22)} t=${r.turns} ${r.verdict}/${r.reason.padEnd(15)} ` +
    `att-${r.attKilled}k+${r.attWounded}w def-${r.defKilled}k+${r.defWounded}w ` +
    `gold=${r.gold.toLocaleString()} fort=${r.fortEndPct}%`
  );
}

function verdictTally(world: WarWorld, from: number, to: number): string {
  const slice = world.attacks.filter((a) => a.day >= from && a.day <= to);
  const counts: Record<string, number> = {};
  for (const a of slice) counts[a.reason] = (counts[a.reason] ?? 0) + 1;
  return Object.entries(counts)
    .map(([k, v]) => `${k}x${v}`)
    .join(' ');
}

async function scenarioEscalation(world: WarWorld): Promise<void> {
  console.log('\n=== SCENARIO 1: The escalation day (poke -> probe -> commit) ===');
  const A = combatant(raider());
  const B = combatant(fortress());
  const ctx = newDay(1);
  const plan: Array<[string, number]> = [
    ['poke (1t)', 1],
    ['probe (2t)', 2],
    ['commit (10t)', 10],
    ['commit (10t)', 10],
    ['commit (10t)', 10],
  ];
  for (let i = 0; i < plan.length; i++) {
    const [label, turns] = plan[i];
    const rec = await attackOnce(A, B, turns, label, ctx, world, `esc-${i}`);
    console.log(fmtRecord(rec));
  }
  console.log(
    `  day totals: A net gold = ${(A.goldPillaged).toLocaleString()}, A knights = ${unitCount(A.user, 'OFFENSE')}, B line = ${unitCount(B.user, 'DEFENSE')}`,
  );
}

async function scenarioWeekOfWar(
  world: WarWorld,
  banker: boolean,
  dayOffset: number,
): Promise<void> {
  console.log(
    banker
      ? '\n=== SCENARIO 5: Week of war vs a BANKER (B banks daily) ==='
      : '\n=== SCENARIO 2: Week of war vs a FORTRESS (repair + retrain) ===',
  );
  const A = combatant(raider());
  const B = combatant(fortress());
  for (let localDay = 1; localDay <= 7; localDay++) {
    const day = dayOffset + localDay;
    const ctx = newDay(day);
    for (let i = 0; i < 5; i++) {
      await attackOnce(A, B, 10, `raid ${i + 1}`, ctx, world, `wow-${day}-${i}`);
    }
    const dayRecs = world.attacks.filter((a) => a.day === day);
    const dayGold = dayRecs.reduce((s, r) => s + r.gold, 0n);
    const dayKills = dayRecs.reduce((s, r) => s + r.defKilled, 0);
    console.log(
      `  d${day}: verdicts={${verdictTally(world, day, day)}} gold=${dayGold.toLocaleString()} B-killed=${dayKills}`,
    );
    endOfDay(B, A, banker ? 'banker' : 'fortress', world, banker ? 'banked' : 'fortress');
    const last = world.days[world.days.length - 1];
    last.day = day;
    console.log(
      `       after-cron: A knights=${last.attKnights} B pop=${last.defPop} line=${last.defLine} fort=${last.fortPct}% B gold=${last.defGold.toLocaleString()}`,
    );
  }
  const netA = A.goldPillaged - A.goldSpentRetrain;
  console.log(
    `  WAR RESULT: A pillaged=${A.goldPillaged.toLocaleString()} spent-retraining=${A.goldSpentRetrain.toLocaleString()} NET=${netA.toLocaleString()} | knights 10000 -> ${unitCount(A.user, 'OFFENSE')} | B line 5000 -> ${unitCount(B.user, 'DEFENSE')} B repair-bill=${B.goldSpentRepair.toLocaleString()}`,
  );
}

async function scenarioDogpile(world: WarWorld): Promise<void> {
  console.log('\n=== SCENARIO 3: The dogpile (4 raiders x 2 assaults in one day) ===');
  const wolves = [0, 1, 2, 3].map((i) => combatant(raider(6000, 1_000_000n + BigInt(i))));
  const B = combatant(fortress());
  const ctx = newDay(20);
  let totalKilled = 0;
  let totalGold = 0n;
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < wolves.length; i++) {
      const rec = await attackOnce(
        wolves[i],
        B,
        10,
        `wolf${i + 1} raid${round + 1}`,
        ctx,
        world,
        `dog-${round}-${i}`,
      );
      totalKilled += rec.defKilled;
      totalGold += rec.gold;
      console.log(fmtRecord(rec));
    }
  }
  console.log(
    `  dogpile totals: B killed=${totalKilled} (daily casualty budget=${270 * V5_COMBAT_CONSTANTS.DAILY_CASUALTY_RECOVERY_DAYS}), gold taken=${totalGold.toLocaleString()} (cap=50% of on-hand at start=${(2500000n).toLocaleString()})`,
  );
}

async function scenarioSiege(world: WarWorld): Promise<void> {
  console.log('\n=== SCENARIO 4: Siege preparation (infiltrate, then storm) ===');
  // Infiltrators must be in the roster at construction so the spy stat is real.
  const A = combatant(raider(10000, 1_000_000n, 100));
  const B = combatant(fortress());
  for (let localDay = 1; localDay <= 2; localDay++) {
    const day = 30 + localDay;
    const ctx = newDay(day);
    for (let m = 0; m < 4; m++) {
      const res = simulateInfiltration(A.user as any, B.user as any, 10, {
        random: createSeededRandom(`siege-${day}-${m}`),
        turns: 10,
      });
      console.log(
        `  d${day} infiltration ${m + 1}: success=${res.success} spiesLost=${res.spiesLost} fortDmg=${res.fortDmg} fortNow=${B.user.fortHitpoints}`,
      );
    }
    const rec = await attackOnce(
      A,
      B,
      10,
      `storm after 4 infils`,
      ctx,
      world,
      `siege-storm-${day}`,
    );
    console.log(fmtRecord(rec));
    endOfDay(B, A, 'fortress', world, 'siege day');
    world.days[world.days.length - 1].day = day;
  }
  console.log(
    `  siege result: verdicts={${verdictTally(world, 1, 2)}} | B repair-bill=${B.goldSpentRepair.toLocaleString()} | A gold=${A.goldPillaged.toLocaleString()}`,
  );
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  setLogLevel('WARN');
  const world: WarWorld = { attacks: [], days: [] };

  const run = async () => {
    await scenarioEscalation(world);
    await scenarioWeekOfWar(world, false, 10);
    await scenarioDogpile(world);
    await scenarioSiege(world);
    await scenarioWeekOfWar(world, true, 40);
  };

  if (flags.verbose) {
    setLogLevel('DEBUG');
    await run();
    return;
  }

  const { logs } = await captureLogs(run);
  const report = {
    generatedAt: new Date().toISOString(),
    script: 'war-simulation',
    env: envSnapshot(),
    attacks: world.attacks.map((a) => ({ ...a, gold: a.gold.toString() })),
    days: world.days.map((d) => ({
      ...d,
      attGold: d.attGold.toString(),
      defGold: d.defGold.toString(),
    })),
    logSummary: { totalEntries: logs.length },
  };
  if (flags.json) {
    console.log(serializeReport(report));
    return;
  }
  if (flags.artifact) {
    const p = await writeArtifact(report, ARTIFACT_NAME);
    console.log(`\nartifact: ${p}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
