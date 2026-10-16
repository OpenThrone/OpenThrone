/**
 * 30-day early-game era simulation under the CURRENT combat engine (30%
 * per-battle fort siege clock, same-turn ranged counters, budgeted level<=9
 * protection). Reuses the src/sim ERA harness (createEraSimulation /
 * simulateEraDay -> daycycle -> runSingleBattle -> simulateBattle) and wraps
 * `runSingleBattle` with a passive recorder to attribute loot/casualties.
 *
 * Parent mode (default): spawns one child process per (seed, cap-share) so
 * the process-global battle constants never leak, then aggregates.
 *   bun --no-env-file scripts/balance/era-early-game.ts [--days 30] [--seeds 1,2,3] [--caps 0.3,0.2,0.4]
 * Child mode (internal): --child --seed N --cap X --out FILE
 *
 * Writes scripts/balance/output/latest-era-early-game.json
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
}
const DAYS = Number(arg('days', '30'));
const TICKS_PER_DAY = 48;

type ArchetypeKey =
  | 'raider'
  | 'balanced'
  | 'turtle'
  | 'farmer'
  | 'gearedTurtle';
const ARCHETYPES: ArchetypeKey[] = [
  'raider',
  'balanced',
  'turtle',
  'farmer',
  'gearedTurtle',
];
const COHORT: Record<ArchetypeKey, number> = {
  raider: 10,
  balanced: 10,
  turtle: 8,
  farmer: 8,
  gearedTurtle: 4,
};
// Archetype -> harness persona (selects the allocation band / policy).
const PERSONA_FOR: Record<ArchetypeKey, string> = {
  raider: 'attacker',
  balanced: 'balanced',
  turtle: 'defender',
  farmer: 'farmer',
  gearedTurtle: 'sentry',
};
// Shares: workers / defense / offense / spy / sentry (each archetype 5% spy, 5% sentry).
const BANDS: Record<
  Exclude<ArchetypeKey, 'farmer'>,
  [number, number, number, number, number, number, number, number, number]
> = {
  // worker, defense, offense, spy, sentry, repairPri, bankPri, attackAgg, intelAgg
  raider: [0.15, 0.15, 0.6, 0.05, 0.05, 0.3, 0.35, 0.9, 0.65],
  balanced: [0.2, 0.35, 0.35, 0.05, 0.05, 0.6, 0.6, 0.45, 0.45],
  turtle: [0.2, 0.55, 0.15, 0.05, 0.05, 0.9, 0.65, 0.1, 0.3],
  gearedTurtle: [0.15, 0.65, 0.05, 0.05, 0.1, 0.9, 0.65, 0.1, 0.3],
};
const BEHAVIOR: Record<ArchetypeKey, Record<string, number | string>> = {
  raider: {
    aggression: 0.9,
    riskTolerance: 0.7,
    activityLevel: 0.9,
    wealthPreference: 0.4,
    spyPreference: 0.5,
    turnStrategy: 'aggressive',
    playStyle: 'aggressive',
    primaryGoal: 'dominance',
  },
  balanced: {
    aggression: 0.5,
    riskTolerance: 0.5,
    activityLevel: 0.6,
    wealthPreference: 0.5,
    spyPreference: 0.5,
    turnStrategy: 'balanced',
    playStyle: 'balanced',
    primaryGoal: 'growth',
  },
  turtle: {
    aggression: 0.2,
    riskTolerance: 0.3,
    activityLevel: 0.4,
    wealthPreference: 0.6,
    spyPreference: 0.3,
    turnStrategy: 'balanced',
    playStyle: 'defensive',
    primaryGoal: 'defense',
  },
  farmer: {
    aggression: 0.1,
    riskTolerance: 0.3,
    activityLevel: 0.4,
    wealthPreference: 0.9,
    spyPreference: 0.3,
    turnStrategy: 'balanced',
    playStyle: 'economic',
    primaryGoal: 'wealth',
  },
  gearedTurtle: {
    aggression: 0.2,
    riskTolerance: 0.3,
    activityLevel: 0.4,
    wealthPreference: 0.6,
    spyPreference: 0.3,
    turnStrategy: 'balanced',
    playStyle: 'defensive',
    primaryGoal: 'defense',
  },
};

const mean = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
function pctile(v: number[], p: number): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[
    Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))
  ] as number;
}
const sumUnits = (u: Record<string, number>) =>
  Object.values(u).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Child: one seed, one cap share
// ---------------------------------------------------------------------------
async function runChild(seed: number, cap: number, outFile: string) {
  const { mock } = await import('bun:test');
  const realEngineNs = await import('@/sim/engine');
  const realEngine = { ...realEngineNs };
  interface BattleRec {
    day: number;
    attackerId: string;
    defenderId: string;
    turns: number;
    winner: string;
    loot: number;
    attCas: number;
    defCas: number;
    attXp: number;
    defXp: number;
    fortBefore: number;
    fortDamage: number;
    fortMax: number;
    defenderLevel: number;
    defenderIncomeDay: number;
  }
  const battles: BattleRec[] = [];
  let curDay = 0;
  let stateRef: any = null;
  const { calculateTurnIncome } = await import('@/sim/economy');

  mock.module('@/sim/engine', () => ({
    ...realEngine,
    runSingleBattle: async (a: any, d: any, cfg: any) => {
      const r = await realEngine.runSingleBattle(a, d, cfg);
      const live = stateRef?.base.players.get(d.id);
      battles.push({
        day: curDay,
        attackerId: a.id,
        defenderId: d.id,
        turns: r.turns,
        winner: r.winner,
        loot: r.loot,
        attCas: sumUnits(r.attackerCasualties as any),
        defCas: sumUnits(r.defenderCasualties as any),
        attXp: r.attackerXp,
        defXp: r.defenderXp,
        fortBefore: d.fortHp,
        fortDamage: r.fortDamage,
        fortMax: live?.fortMaxHp ?? 50,
        defenderLevel: d.level,
        defenderIncomeDay: live ? calculateTurnIncome(live) * TICKS_PER_DAY : 0,
      });
      return r;
    },
  }));

  const { V5_COMBAT_CONSTANTS } = await import('@/utils/balance/v5Combat');
  (V5_COMBAT_CONSTANTS.FORT_DAMAGE as any).PER_BATTLE_CAP_SHARE = cap;

  const { PERSONA_ALLOCATION_BANDS } = await import('@/sim/personas/bands');
  for (const key of Object.keys(BANDS) as Array<keyof typeof BANDS>) {
    const [w, d, o, s, se, rep, bank, atk, intel] = BANDS[key];
    Object.assign((PERSONA_ALLOCATION_BANDS as any)[PERSONA_FOR[key]], {
      workerShare: w,
      defenseShare: d,
      offenseShare: o,
      spyShare: s,
      sentryShare: se,
      fortRepairPriority: rep,
      bankingPriority: bank,
      attackAggression: atk,
      intelAggression: intel,
    });
  }

  const { createEraSimulation, simulateEraDay } =
    await import('@/sim/eraIntegration');
  const { createEraPlayer, PRIMARY_COHORT_MANIFEST } =
    await import('@/sim/eraPopulation');
  const { HouseUpgrades } = await import('@/constants/Structure_Upgrades');
  const { ItemTypes } = await import('@/constants/Items');
  const { UNIT_COSTS } = await import('@/sim/population');
  const { evaluateBalanceGates } = await import('@/sim/balanceGates');

  const archOf = new Map<string, ArchetypeKey>();
  const players: any[] = [];
  const FARMER_VARIANTS = ['greedy', 'cautious', 'adaptive'] as const;
  for (const arch of ARCHETYPES) {
    for (let i = 0; i < COHORT[arch]; i++) {
      const id = `${arch}-${i}`;
      const p: any = createEraPlayer({
        id,
        displayName: id,
        persona: PERSONA_FOR[arch] as any,
        farmerVariant: arch === 'farmer' ? FARMER_VARIANTS[i % 3] : undefined,
        activityClass: 'active',
      });
      p.behavior = { ...BEHAVIOR[arch] };
      archOf.set(id, arch);
      players.push(p);
    }
  }

  const manifest: any = {
    id: 'early-game-30d',
    rulesetId: 'production',
    seed,
    totalDays: DAYS,
    primaryCohort: PRIMARY_COHORT_MANIFEST,
    recruitment: {
      rewardsPerDay: 25,
      band: 25,
      recipientMode: 'self',
      selectionShare: 1,
    },
    allianceMode: 'none',
    lateJoinerDays: [],
    calibrationStatus: 'uncalibrated',
  };
  const state: any = await createEraSimulation({
    manifest,
    players,
    days: DAYS,
    config: { seed, rulesetId: 'production' } as any,
  });
  stateRef = state;

  const houseBonus = (houseLevel: number): number => {
    const h = Object.values(HouseUpgrades as any).find(
      (x: any) => x.level === houseLevel,
    ) as any;
    return h?.citizensDaily ?? 1;
  };
  const gearCost = (usage: string, type: string) =>
    (ItemTypes as any[]).find(
      (i) => i.usage === usage && i.type === type && i.level === 1,
    )?.cost ?? 0;
  const defPairCost =
    gearCost('DEFENSE', 'WEAPON') + gearCost('DEFENSE', 'ARMOR');

  const dayRows: any[] = [];
  const snapshots: Array<
    Map<
      string,
      { pop: number; lvl: number; xp: number; fortPct: number; fortHp: number }
    >
  > = [];
  const popAtEnd: Array<Map<string, number>> = [];
  const initial = new Map<string, number>();
  for (const p of state.base.players.values())
    initial.set(p.id, sumUnits(p.units));
  popAtEnd.push(initial);

  const t0 = Date.now();
  for (let day = 1; day <= DAYS; day++) {
    curDay = day;
    for (const p of state.base.players.values()) {
      // Production era rule: 100 bonus citizens/day on top of housing output.
      p.recruitBonus = houseBonus(p.houseLevel) + 100;
      if (archOf.get(p.id) === 'gearedTurtle' && p.status !== 'defeated') {
        const budget = Math.floor(p.gold * 0.5);
        const cap = p.units.guard + p.units.citizen;
        const n = Math.min(cap, Math.floor(budget / Math.max(1, defPairCost)));
        if (n > 0) {
          p.items.meleeDef += n;
          p.items.rangedDef += n;
          p.gold -= n * defPairCost;
        }
      }
    }
    await simulateEraDay(state);

    const snap = new Map<string, any>();
    const pops = new Map<string, number>();
    for (const p of state.base.players.values()) {
      const pop = sumUnits(p.units);
      pops.set(p.id, pop);
      snap.set(p.id, {
        pop,
        lvl: p.level,
        xp: p.xp,
        fortHp: p.fortHp,
        fortPct: p.fortMaxHp > 0 ? (100 * p.fortHp) / p.fortMaxHp : 0,
      });
    }
    snapshots.push(snap);
    popAtEnd.push(pops);

    const dayBattles = battles.filter((b) => b.day === day);
    const breachedToday = new Set<string>();
    for (const b of dayBattles)
      if (b.fortBefore > 0 && b.fortBefore - b.fortDamage <= 0)
        breachedToday.add(b.defenderId);
    for (const [id, s] of snap) {
      const prev = snapshots[snapshots.length - 2]?.get(id);
      if (s.fortHp <= 0 && (prev?.fortHp ?? 1) > 0) breachedToday.add(id);
    }
    const n = state.base.players.size;
    const fortPcts = [...snap.values()].map((s) => s.fortPct);
    const wins = dayBattles.filter((b) => b.winner === 'attacker').length;
    const lootPcts = dayBattles
      .filter((b) => b.winner === 'attacker' && b.defenderIncomeDay > 0)
      .map((b) => (100 * b.loot) / b.defenderIncomeDay);
    const allLootPcts = dayBattles
      .filter((b) => b.defenderIncomeDay > 0)
      .map((b) => (100 * b.loot) / b.defenderIncomeDay);
    dayRows.push({
      day,
      attacks: dayBattles.length,
      attacksPerPlayer: dayBattles.length / n,
      winRate: dayBattles.length ? wins / dayBattles.length : 0,
      breachRatePct: (100 * breachedToday.size) / n,
      fortZeroAtEndPct:
        (100 * [...snap.values()].filter((s) => s.fortHp <= 0).length) / n,
      fortHpPctMean: mean(fortPcts),
      fortHpPctP90: pctile(fortPcts, 0.9),
      lootPctOfDefDailyIncomeMean: mean(allLootPcts),
      lootPctOfDefDailyIncomeWinsMean: mean(lootPcts),
      lootTotal: dayBattles.reduce((s, b) => s + b.loot, 0),
      attackTurnsSpent: dayBattles.reduce((s, b) => s + b.turns, 0),
      protectedTargetSharePct: dayBattles.length
        ? (100 * dayBattles.filter((b) => b.defenderLevel <= 9).length) /
          dayBattles.length
        : 0,
    });
  }
  const elapsedMs = Date.now() - t0;

  // Weekly casualties (killed + wounded, both roles) as % of average population.
  const weeks: any[] = [];
  const nWeeks = Math.ceil(DAYS / 7);
  for (let w = 0; w < nWeeks; w++) {
    const d0 = w * 7 + 1;
    const d1 = Math.min(DAYS, d0 + 6);
    const perPlayer: number[] = [];
    const perArch: Record<string, number[]> = {};
    for (const id of archOf.keys()) {
      let cas = 0;
      for (const b of battles) {
        if (b.day < d0 || b.day > d1) continue;
        if (b.attackerId === id) cas += b.attCas;
        if (b.defenderId === id) cas += b.defCas;
      }
      const pops: number[] = [];
      for (let d = d0; d <= d1; d++) pops.push(popAtEnd[d]?.get(id) ?? 0);
      const avgPop = Math.max(1, mean(pops));
      const pct = (100 * cas) / avgPop;
      perPlayer.push(pct);
      (perArch[archOf.get(id) as string] ??= []).push(pct);
    }
    const weekBattles = battles.filter((b) => b.day >= d0 && b.day <= d1);
    weeks.push({
      week: w + 1,
      days: [d0, d1],
      attacks: weekBattles.length,
      attacksPerPlayerPerDay: weekBattles.length / archOf.size / (d1 - d0 + 1),
      winRate: weekBattles.length
        ? weekBattles.filter((b) => b.winner === 'attacker').length /
          weekBattles.length
        : 0,
      breachRatePctMeanDaily: mean(
        dayRows.slice(d0 - 1, d1).map((r) => r.breachRatePct),
      ),
      fortHpPctMeanOfDays: mean(
        dayRows.slice(d0 - 1, d1).map((r) => r.fortHpPctMean),
      ),
      casualtyPctMean: mean(perPlayer),
      casualtyPctP90: pctile(perPlayer, 0.9),
      casualtyPctByArchetype: Object.fromEntries(
        Object.entries(perArch).map(([k, v]) => [k, mean(v)]),
      ),
      lootPctOfDefDailyIncomeMean: mean(
        weekBattles
          .filter((b) => b.defenderIncomeDay > 0)
          .map((b) => (100 * b.loot) / b.defenderIncomeDay),
      ),
    });
  }

  // Per-archetype aggregates.
  const byArch: Record<string, any> = {};
  for (const arch of ARCHETYPES) {
    const mine = battles.filter((b) => archOf.get(b.attackerId) === arch);
    const turns = mine.reduce((s, b) => s + b.turns, 0);
    const loot = mine.reduce((s, b) => s + b.loot, 0);
    const asDef = battles.filter((b) => archOf.get(b.defenderId) === arch);
    const prog: Record<string, any> = {};
    for (const d of [7, 14, 21, 30]) {
      if (d > DAYS) continue;
      const rows = [...archOf.entries()]
        .filter(([, a]) => a === arch)
        .map(([id]) => snapshots[d - 1]?.get(id));
      prog[`day${d}`] = {
        meanLevel: mean(rows.map((r) => r?.lvl ?? 0)),
        maxLevel: Math.max(...rows.map((r) => r?.lvl ?? 0)),
        meanXp: mean(rows.map((r) => r?.xp ?? 0)),
        shareLevel10PlusPct:
          (100 * rows.filter((r) => (r?.lvl ?? 0) >= 10).length) / rows.length,
      };
    }
    byArch[arch] = {
      players: COHORT[arch],
      attacksMade: mine.length,
      attacksPerPlayerPerDay: mine.length / COHORT[arch] / DAYS,
      winRatePct: mine.length
        ? (100 * mine.filter((b) => b.winner === 'attacker').length) /
          mine.length
        : 0,
      goldStolenPerAttackTurn: turns ? loot / turns : 0,
      goldStolenPerAttack: mine.length ? loot / mine.length : 0,
      attacksReceived: asDef.length,
      timesBreachedByBattle: asDef.filter(
        (b) => b.fortBefore > 0 && b.fortBefore - b.fortDamage <= 0,
      ).length,
      progression: prog,
      finalMeanPop: mean(
        [...archOf.entries()]
          .filter(([, a]) => a === arch)
          .map(([id]) => snapshots[DAYS - 1]?.get(id)?.pop ?? 0),
      ),
      finalMeanFortPct: mean(
        [...archOf.entries()]
          .filter(([, a]) => a === arch)
          .map(([id]) => snapshots[DAYS - 1]?.get(id)?.fortPct ?? 0),
      ),
    };
  }
  const last = snapshots[DAYS - 1] as Map<string, any>;
  const lvAll = [...last.values()].map((s) => s.lvl);
  const level10SharePct =
    (100 * lvAll.filter((l) => l >= 10).length) / lvAll.length;

  // Gate check: harness gates are defined only for day 365/730. Re-label the
  // last checkpoint to 365 so the persona-viability gate runs on day-30 data.
  const lastCp = state.checkpointMetrics.filter((r: any) => r.day === DAYS);
  const relabeled = lastCp.map((r: any) => ({ ...r, day: 365 }));
  const gateFindings = evaluateBalanceGates(relabeled).filter((f: any) =>
    f.id.startsWith('persona-viability'),
  );
  const nativeFindings = evaluateBalanceGates(state.checkpointMetrics);

  const result = {
    seed,
    capShare: cap,
    days: DAYS,
    elapsedMs,
    totalBattles: battles.length,
    days_: dayRows,
    weeks,
    byArchetype: byArch,
    level10SharePctDay30: level10SharePct,
    levelDistributionDay30: Object.fromEntries(
      [...new Set(lvAll)]
        .sort((a, b) => a - b)
        .map((l) => [l, lvAll.filter((x) => x === l).length]),
    ),
    gates: {
      nativeFindingsAtCheckpoints: nativeFindings.map((f: any) => ({
        id: f.id,
        passed: f.passed,
        severity: f.severity,
      })),
      viabilityRelabeledDay30: gateFindings.map((f: any) => ({
        id: f.id,
        passed: f.passed,
        message: f.message,
      })),
    },
    populationMeanEndOfDay: dayRows.map((_, i) =>
      mean([...snapshots[i]!.values()].map((s) => s.pop)),
    ),
    unitCostsUsed: {
      soldier: UNIT_COSTS.soldier,
      worker: UNIT_COSTS.worker,
      defGearPair: defPairCost,
    },
  };
  await writeFile(outFile, JSON.stringify(result), 'utf-8');
}

// ---------------------------------------------------------------------------
// Parent
// ---------------------------------------------------------------------------
function aggregate(vals: any[]): any {
  const first = vals[0];
  if (typeof first === 'number') {
    const nums = vals as number[];
    return { mean: mean(nums), min: Math.min(...nums), max: Math.max(...nums) };
  }
  if (Array.isArray(first))
    return first.map((_, i) => aggregate(vals.map((v) => v[i])));
  if (first && typeof first === 'object') {
    const out: any = {};
    for (const k of Object.keys(first))
      out[k] = aggregate(vals.map((v) => v[k]));
    return out;
  }
  return first;
}
const f = (x: any, d = 1) =>
  x && typeof x.mean === 'number'
    ? `${x.mean.toFixed(d)} [${x.min.toFixed(d)}-${x.max.toFixed(d)}]`
    : String(x);

async function runParent() {
  const seeds = arg('seeds', '1,2,3').split(',').map(Number);
  const caps = arg('caps', '0.3,0.2,0.4').split(',').map(Number);
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'era-early-'));
  const jobs: Array<{ seed: number; cap: number; file: string }> = [];
  for (const cap of caps)
    for (const seed of seeds)
      jobs.push({ seed, cap, file: path.join(tmp, `r-${cap}-${seed}.json`) });
  const pool = Number(arg('parallel', '3'));
  let idx = 0;
  const worker = async () => {
    while (idx < jobs.length) {
      const job = jobs[idx++] as (typeof jobs)[number];
      const proc = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          process.argv[1] as string,
          '--child',
          '--seed',
          String(job.seed),
          '--cap',
          String(job.cap),
          '--days',
          String(DAYS),
          '--out',
          job.file,
        ],
        { stdout: 'inherit', stderr: 'inherit', cwd: process.cwd() },
      );
      const code = await proc.exited;
      if (code !== 0)
        throw new Error(
          `child failed seed=${job.seed} cap=${job.cap} code=${code}`,
        );
      console.error(`done seed=${job.seed} cap=${job.cap}`);
    }
  };
  await Promise.all(Array.from({ length: pool }, worker));

  const byCap: Record<string, any> = {};
  const raw: any[] = [];
  for (const cap of caps) {
    const runs: any[] = [];
    for (const seed of seeds) {
      const r = JSON.parse(
        await readFile(path.join(tmp, `r-${cap}-${seed}.json`), 'utf-8'),
      );
      runs.push(r);
      raw.push(r);
    }
    const numeric = runs.map((r) => ({
      days: r.days_,
      weeks: r.weeks,
      byArchetype: r.byArchetype,
      level10SharePctDay30: r.level10SharePctDay30,
      populationMeanEndOfDay: r.populationMeanEndOfDay,
      totalBattles: r.totalBattles,
    }));
    byCap[String(cap)] = {
      aggregate: aggregate(numeric),
      gatesPerSeed: runs.map((r) => ({ seed: r.seed, ...r.gates })),
      levelDistributionDay30PerSeed: runs.map((r) => r.levelDistributionDay30),
      elapsedMsPerSeed: runs.map((r) => r.elapsedMs),
    };
  }
  await rm(tmp, { recursive: true, force: true });

  const outDir = path.resolve(process.cwd(), 'scripts/balance/output');
  await mkdir(outDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    days: DAYS,
    seeds,
    caps,
    cohort: COHORT,
    personaMapping: PERSONA_FOR,
    bands: BANDS,
    byCapShare: byCap,
  };
  await writeFile(
    path.join(outDir, 'latest-era-early-game.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  );

  for (const cap of caps) {
    const a = byCap[String(cap)].aggregate;
    console.log(
      `\n===== PER_BATTLE_CAP_SHARE=${cap} (mean [min-max] over seeds ${seeds.join(',')}) =====`,
    );
    console.log('\nDaily');
    console.log(
      'day | attacks/plr | win% | breach% | fort0@end% | fortHP% mean | fortHP% p90 | loot%defInc | protectedTgt%',
    );
    for (const d of a.days) {
      console.log(
        `${d.day.mean} | ${f(d.attacksPerPlayer, 2)} | ${f({ mean: d.winRate.mean * 100, min: d.winRate.min * 100, max: d.winRate.max * 100 }, 0)} | ${f(d.breachRatePct)} | ${f(d.fortZeroAtEndPct)} | ${f(d.fortHpPctMean)} | ${f(d.fortHpPctP90)} | ${f(d.lootPctOfDefDailyIncomeMean)} | ${f(d.protectedTargetSharePct, 0)}`,
      );
    }
    console.log('\nWeekly');
    console.log(
      'wk | attacks | att/plr/day | win% | breach%/day | fortHP% | cas% mean | cas% p90 | loot%defInc | cas% by arch',
    );
    for (const w of a.weeks) {
      const arch = ARCHETYPES.map(
        (k) => `${k}:${f(w.casualtyPctByArchetype[k])}`,
      ).join(' ');
      console.log(
        `${w.week.mean} | ${f(w.attacks, 0)} | ${f(w.attacksPerPlayerPerDay, 2)} | ${f({ mean: w.winRate.mean * 100, min: w.winRate.min * 100, max: w.winRate.max * 100 }, 0)} | ${f(w.breachRatePctMeanDaily)} | ${f(w.fortHpPctMeanOfDays)} | ${f(w.casualtyPctMean, 2)} | ${f(w.casualtyPctP90, 2)} | ${f(w.lootPctOfDefDailyIncomeMean)} | ${arch}`,
      );
    }
    console.log('\nArchetype (attacking) and progression');
    for (const k of ARCHETYPES) {
      const b = a.byArchetype[k];
      const pr = Object.entries(b.progression)
        .map(
          ([dk, v]: [string, any]) =>
            `${dk}: L${f(v.meanLevel)} xp${f(v.meanXp, 0)}`,
        )
        .join(' | ');
      console.log(
        `${k}: atk/plr/day ${f(b.attacksPerPlayerPerDay, 2)}, win% ${f(b.winRatePct, 0)}, gold/attack-turn ${f(b.goldStolenPerAttackTurn, 0)}, recv ${f(b.attacksReceived, 0)}, popEnd ${f(b.finalMeanPop, 0)}, fort% end ${f(b.finalMeanFortPct, 0)}\n   ${pr}`,
      );
    }
    console.log(
      `\nShare at level>=10 on day ${DAYS}: ${f(a.level10SharePctDay30)}%`,
    );
    for (const g of byCap[String(cap)].gatesPerSeed)
      console.log(
        `gates seed ${g.seed}: ${
          g.viabilityRelabeledDay30
            .map((x: any) => `${x.passed ? 'PASS' : 'FAIL'} ${x.message}`)
            .join(' / ') || 'none'
        }`,
      );
  }
}

if (argv.includes('--child')) {
  await runChild(
    Number(arg('seed', '1')),
    Number(arg('cap', '0.3')),
    arg('out', '/tmp/era-child.json'),
  );
} else {
  await runParent();
}
