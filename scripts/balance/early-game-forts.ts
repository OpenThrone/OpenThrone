/**
 * Early-game fort and casualty envelope.
 *
 * Replays the two reported production/alpha battles and a matrix of
 * week-1..3 armies (100 bonus citizens/day plus housing, Manor forts,
 * level 1-5 players) so fort erosion, counter-kills and protection can be
 * eyeballed before shipping. Run: `bun --no-env-file scripts/balance/early-game-forts.ts`
 */
import { Fortifications, HouseUpgrades } from '@/constants';
import { executeAttack } from '@/utils/attackFunctions';
import {
  calculateDailyReplacementThroughput,
  calculateDefenderDailyCasualtyRemaining,
  calculateDefenderDailyGoldRemaining,
} from '@/utils/balance/v5Combat';
import { createSeededRandom } from '@/utils/random';

type Roster = {
  soldier?: number;
  guard?: number;
  worker?: number;
  citizen?: number;
  spy?: number;
  sentry?: number;
};

type Build = {
  name: string;
  level: number;
  fortLevel?: number;
  fortHp?: number;
  gold: number;
  units: Roster;
  /** Number of units carrying a full level-1 gear set (offense and defense). */
  gearedOffense?: number;
  gearedDefense?: number;
};

const DEFENSE_SLOTS = ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'];
const OFFENSE_SLOTS = ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'];

function makeUser(build: Build) {
  const fortLevel = build.fortLevel ?? 1;
  const fort = Fortifications.find((f) => f.level === fortLevel)!;
  const u = build.units;
  const units = [
    ['CITIZEN', u.citizen ?? 0],
    ['WORKER', u.worker ?? 0],
    ['OFFENSE', u.soldier ?? 0],
    ['DEFENSE', u.guard ?? 0],
    ['SPY', u.spy ?? 0],
    ['SENTRY', u.sentry ?? 0],
  ]
    .filter(([, q]) => (q as number) > 0)
    .map(([type, quantity], i) => ({
      id: i + 1,
      userId: 1,
      type,
      level: 1,
      quantity,
      isMercenary: false,
    }));
  const items: any[] = [];
  if (build.gearedOffense)
    for (const type of OFFENSE_SLOTS)
      items.push({
        usage: 'OFFENSE',
        type,
        level: 1,
        quantity: build.gearedOffense,
      });
  if (build.gearedDefense)
    for (const type of DEFENSE_SLOTS)
      items.push({
        usage: 'DEFENSE',
        type,
        level: 1,
        quantity: build.gearedDefense,
      });
  return {
    id: build.name,
    displayName: build.name,
    level: build.level,
    race: 'HUMAN',
    class: 'FIGHTER',
    houseLevel: 0,
    fortLevel,
    fortHitpoints: build.fortHp ?? fort.hitpoints,
    gold: BigInt(build.gold),
    units,
    mercenaries: [],
    items,
    structure_upgrades: [],
    battle_upgrades: [],
    attackBonus: 0,
    defenseBonus: fort.defenseBonusPercentage,
    stamina: 100,
    experience: 0,
  };
}

async function fight(a: Build, d: Build, turns: number, seed = 'early') {
  const attacker: any = makeUser(a);
  const defender: any = makeUser(d);
  const fortStart = defender.fortHitpoints;
  // Same daily budgets production applies to a defender with no losses yet today.
  const dailyThroughput = calculateDailyReplacementThroughput({
    houseCitizens: Number(HouseUpgrades[0]?.citizensDaily ?? 1),
    race: 'HUMAN',
  });
  const r: any = await executeAttack(attacker, defender, turns, undefined, {
    random: createSeededRandom(`${seed}:${a.name}:${d.name}:${turns}`),
    defenderDailyCasualtyRemaining: calculateDefenderDailyCasualtyRemaining({
      dailyThroughput,
      casualtiesToday: 0,
    }),
    defenderDailyGoldRemaining: calculateDefenderDailyGoldRemaining({
      goldOnHand: BigInt(d.gold),
      goldTakenToday: 0n,
    }),
  });
  const wounded = (side: 'attacker' | 'defender') =>
    r.wounded[side].reduce((s: number, w: any) => s + w.quantity, 0);
  return {
    result: r.result as string,
    reason: r.canonicalOutcome.reason as string,
    fortStart,
    fortEnd: r.finalFortHP as number,
    fortPct: Math.round(((fortStart - r.finalFortHP) / fortStart) * 100),
    attLost: r.Losses.Attacker.total + wounded('attacker'),
    defLost: r.Losses.Defender.total + wounded('defender'),
    loot: Number(r.pillagedGold),
    attXp: r.experienceGained.attacker,
    defXp: r.experienceGained.defender,
    turns: r.turnsTaken,
    counterTurns: r.mitigationLog
      .filter((e: any) => e.source === 'DEFENDER' && e.mitigatedDamage > 0)
      .map((e: any) => e.turn),
  };
}

function row(label: string, f: Awaited<ReturnType<typeof fight>>) {
  return `| ${label} | ${f.result} (${f.reason}) | ${f.turns} | ${f.fortStart}→${f.fortEnd} (-${f.fortPct}%) | ${f.attLost} | ${f.defLost} | ${f.loot.toLocaleString()} | ${f.attXp}/${f.defXp} |`;
}
const HEADER =
  '| Scenario | Result | Turns | Fort HP | Att lost | Def lost | Gold | XP A/D |\n|---|---|---|---|---|---|---|---|';

// --- Reported battles -------------------------------------------------------
const dasTaco23501: Build = {
  name: 'DasTacoMann (77 soldiers)',
  level: 1,
  gold: 50_000,
  units: {
    soldier: 77,
    guard: 10,
    worker: 20,
    citizen: 150,
    spy: 3,
    sentry: 3,
  },
};
const nunosGeared: Build = {
  name: 'Nunos (20 geared guards)',
  level: 1,
  gold: 60_000,
  units: {
    guard: 20,
    soldier: 10,
    worker: 20,
    citizen: 120,
    spy: 3,
    sentry: 3,
  },
  gearedDefense: 20,
};
const dasTaco23502: Build = {
  name: 'DasTacoMann (20 soldiers)',
  level: 1,
  gold: 50_000,
  units: {
    soldier: 20,
    guard: 10,
    worker: 20,
    citizen: 150,
    spy: 3,
    sentry: 3,
  },
};
const nunosBare: Build = {
  name: 'Nunos (5 bare guards)',
  level: 1,
  gold: 2_000,
  units: { guard: 5, soldier: 5, worker: 10, citizen: 100, spy: 2, sentry: 2 },
};

// --- Weekly archetypes ------------------------------------------------------
// ~110 citizens/day (100 era bonus + housing + a few recruits) and ~48k
// gold/day from a Manor at 48 turns/day, so trained units lag citizens.
const WEEKS = [
  { week: 1, level: 2, trained: 150, citizens: 600, gold: 60_000 },
  { week: 2, level: 4, trained: 330, citizens: 1200, gold: 120_000 },
  { week: 3, level: 6, trained: 540, citizens: 1700, gold: 200_000 },
];
const ARCHETYPES: Record<string, Roster> = {
  balanced: {
    soldier: 0.35,
    guard: 0.35,
    worker: 0.2,
    spy: 0.05,
    sentry: 0.05,
  },
  raider: { soldier: 0.6, guard: 0.15, worker: 0.15, spy: 0.05, sentry: 0.05 },
  turtle: { soldier: 0.15, guard: 0.55, worker: 0.2, spy: 0.05, sentry: 0.05 },
  farmer: { soldier: 0.15, guard: 0.25, worker: 0.5, spy: 0.05, sentry: 0.05 },
};
function archetype(name: string, w: (typeof WEEKS)[number], geared = 0): Build {
  const mix = ARCHETYPES[name]!;
  const units: Roster = { citizen: w.citizens };
  for (const [k, share] of Object.entries(mix))
    (units as any)[k] = Math.round(w.trained * share);
  return {
    name: `${name} wk${w.week}`,
    level: w.level,
    fortLevel: w.week >= 3 ? 2 : 1,
    gold: w.gold,
    units,
    gearedDefense: geared ? Math.min(geared, units.guard ?? 0) : 0,
  };
}

async function main() {
  const out: string[] = [];
  out.push('## Reported battles, replayed\n', HEADER);
  for (const turns of [1, 5, 10]) {
    out.push(
      row(
        `23501-like, ${turns}t`,
        await fight(dasTaco23501, nunosGeared, turns),
      ),
    );
  }
  for (const turns of [1, 5, 10]) {
    out.push(
      row(`23502-like, ${turns}t`, await fight(dasTaco23502, nunosBare, turns)),
    );
  }

  out.push('\n## Siege clock: repeated 10-turn assaults, no repair\n', HEADER);
  for (const [a, d] of [
    [dasTaco23502, nunosBare],
    [archetype('raider', WEEKS[1]!), archetype('turtle', WEEKS[1]!)],
  ] as const) {
    let hp = Fortifications.find(
      (f) => f.level === (d.fortLevel ?? 1),
    )!.hitpoints;
    for (let i = 1; i <= 6 && hp > 0; i++) {
      const f = await fight(a, { ...d, fortHp: hp }, 10, `siege${i}`);
      out.push(row(`${a.name} → ${d.name} #${i}`, f));
      hp = f.fortEnd;
    }
  }

  out.push('\n## Weekly matrix, 10-turn attacks\n', HEADER);
  for (const w of WEEKS) {
    for (const an of ['raider', 'balanced']) {
      for (const dn of ['farmer', 'balanced', 'turtle']) {
        out.push(
          row(
            `${an} → ${dn} wk${w.week}`,
            await fight(archetype(an, w), archetype(dn, w), 10),
          ),
        );
      }
      out.push(
        row(
          `${an} → turtle+20 geared wk${w.week}`,
          await fight(archetype(an, w), archetype('turtle', w, 20), 10),
        ),
      );
    }
  }

  out.push(
    '\n## Level gap, 10 turns (week-3 raider punching down / week-1 raider punching up)\n',
    HEADER,
  );
  out.push(
    row(
      'raider wk3 → farmer wk1',
      await fight(
        archetype('raider', WEEKS[2]!),
        archetype('farmer', WEEKS[0]!),
        10,
      ),
    ),
  );
  out.push(
    row(
      'raider wk3 → turtle wk1',
      await fight(
        archetype('raider', WEEKS[2]!),
        archetype('turtle', WEEKS[0]!),
        10,
      ),
    ),
  );
  out.push(
    row(
      'raider wk1 → farmer wk3',
      await fight(
        archetype('raider', WEEKS[0]!),
        archetype('farmer', WEEKS[2]!),
        10,
      ),
    ),
  );

  out.push('\n## Short raids, 1 turn\n', HEADER);
  for (const w of WEEKS) {
    out.push(
      row(
        `raider → farmer wk${w.week}, 1t`,
        await fight(archetype('raider', w), archetype('farmer', w), 1),
      ),
    );
    out.push(
      row(
        `raider → turtle+20 geared wk${w.week}, 1t`,
        await fight(archetype('raider', w), archetype('turtle', w, 20), 1),
      ),
    );
  }
  console.log(out.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
