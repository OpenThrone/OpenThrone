/**
 * Gear-parity gate (#202 option 1).
 *
 * Candidate (now shipped): offense gear sets keep their total stats but swap
 * their attack/defense split to mirror defense sets (L1 29/42 -> 42/29, L2
 * 59/83 -> 83/59, L3 120/165 -> 165/120), with troop-only chip. "Today" is the
 * combat-v7 stats, restored in memory. Every battle runs twice on identical
 * states and random rolls, once on the v7 stats and once on the candidate,
 * and the gate reports:
 *   - break-even fighters multiple at bare, half and full equipment;
 *   - defenders who held in both runs: any per-battle loss increase (must be 0);
 *   - hold -> defeat flips, listed with their attack/defense ratio;
 *   - farming (ratio >= 5): win rate and attacker losses;
 *   - the same checks with 5% defender fatigue;
 *   - the exported production battles, if a file is given.
 * Run: bun --no-env-file scripts/balance/gear-parity-gate.ts [prod-export.json]
 */
import { readFileSync } from 'node:fs';

import { Fortifications, ItemTypes, OffensiveUpgrades } from '@/constants';
import { DEFENDER_FATIGUE_PER_PRESSURE } from '@/constants/KingdomMorale';
import {
  calculateStrength,
  executeAttack,
  simulateBattle,
} from '@/utils/attackFunctions';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import type { CombatUserSnapshot } from '@/utils/combatReplay';
import { restoreBattleUser } from '@/utils/combatReplay';
import { createSeededRandom } from '@/utils/random';

/** Offense stats before gear parity (combat-v7): [MeleeAtkPower, MeleeDefPower]. */
const PRE_PARITY: Record<number, Record<string, [number, number]>> = {
  1: {
    WEAPON: [20, 5],
    ARMOR: [4, 15],
    SHIELD: [2, 10],
    HELM: [1, 5],
    BOOTS: [1, 5],
    BRACERS: [1, 2],
  },
  2: {
    WEAPON: [40, 10],
    ARMOR: [8, 30],
    SHIELD: [5, 20],
    HELM: [2, 10],
    BOOTS: [2, 10],
    BRACERS: [2, 3],
  },
  3: {
    WEAPON: [80, 20],
    ARMOR: [15, 60],
    SHIELD: [10, 40],
    HELM: [5, 20],
    BOOTS: [5, 20],
    BRACERS: [5, 5],
  },
};
/** The shipped gear-parity stats, read from the item constants. */
const PARITY = new Map(
  ItemTypes.filter((i) => i.usage === 'OFFENSE' && PRE_PARITY[i.level]).map(
    (i) => [i, [i.MeleeAtkPower, i.MeleeDefPower] as [number, number]],
  ),
);
/** GATE_CHIP=gear compares the gear change alone, without troop-only chip. */
const WITH_TROOP_CHIP = process.env.GATE_CHIP !== 'gear';
/** Off: combat-v7 stats and chip. On: what ships (gear parity + troop chip). */
function applyCandidate(on: boolean) {
  (
    V5_COMBAT_CONSTANTS as { CHIP_FROM_TROOPS_ONLY: boolean }
  ).CHIP_FROM_TROOPS_ONLY = on && WITH_TROOP_CHIP;
  for (const [item, parity] of PARITY) {
    const [atk, def] = on ? parity : PRE_PARITY[item.level][item.type];
    item.MeleeAtkPower = atk;
    item.MeleeDefPower = def;
  }
}

const SLOTS = ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'];
const SIZE = 2_000;
const SEEDS = 12;
type Setup = {
  fort: number;
  tier: number;
  share: number;
  edge: number;
  fatigue: number;
};

function makeUser(name: string, s: Setup, scale: number, isDefender: boolean) {
  const fort = Fortifications.find((f) => f.level === s.fort)!;
  const fighters = Math.round(SIZE * 0.35 * scale);
  const equipped = Math.round(fighters * s.share);
  return {
    id: name,
    displayName: name,
    level: 5,
    race: 'HUMAN',
    class: 'FIGHTER',
    houseLevel: 1,
    fortLevel: s.fort,
    fortHitpoints: fort.hitpoints,
    gold: 2_000_000n,
    units: [
      ['OFFENSE', s.tier, fighters],
      ['DEFENSE', s.tier, fighters],
      ['WORKER', 1, Math.round(SIZE * 0.25)],
      ['CITIZEN', 1, Math.round(SIZE * 0.05)],
    ].map(([type, level, quantity], i) => ({
      id: i + 1,
      userId: 1,
      type,
      level,
      quantity,
      isMercenary: false,
    })),
    mercenaries: [],
    items: ['OFFENSE', 'DEFENSE'].flatMap((usage) =>
      SLOTS.map((type) => ({ usage, type, level: s.tier, quantity: equipped })),
    ),
    structure_upgrades: [{ type: 'ARMORY', level: s.tier }],
    battle_upgrades: [],
    attackBonus:
      OffensiveUpgrades.filter((u) => u.level <= s.fort).at(-1)
        ?.offenseBonusPercentage ?? 0,
    defenseBonus: fort.defenseBonusPercentage,
    // Garrison fatigue comes from defense pressure taken earlier today.
    defensePressureToday: isDefender
      ? s.fatigue / DEFENDER_FATIGUE_PER_PRESSURE
      : 0,
    stamina: 100,
    experience: 0,
  };
}

type Outcome = {
  won: boolean;
  attLost: number;
  defLost: number;
  ratio: number;
};
/** Attack over defense at battle start, as the engine scores it. */
const ratioOf = (attacker: any, defender: any) => {
  const a = calculateStrength(attacker, 'OFFENSE').totalStats;
  const d = calculateStrength(defender, 'DEFENSE').totalStats;
  return (
    (a.MeleeAtkPower + a.RangedAtkPower) /
    Math.max(1, d.MeleeDefPower + d.RangedDefPower)
  );
};
const lost = (r: any, side: 'Attacker' | 'Defender') =>
  r.Losses[side].total +
  (r.wounded?.[side.toLowerCase()] ?? []).reduce(
    (n: number, w: any) => n + w.quantity,
    0,
  );

async function fight(
  s: Setup,
  seed: number,
  candidate: boolean,
): Promise<Outcome> {
  applyCandidate(candidate);
  const attacker = makeUser('A', s, s.edge, false) as any;
  const defender = makeUser('D', s, 1, true) as any;
  const ratio = ratioOf(attacker, defender);
  const r: any = await executeAttack(attacker, defender, 10, true, {
    random: createSeededRandom(`gear-gate:${seed}`),
  });
  return {
    won: r.result === 'WIN',
    attLost: lost(r, 'Attacker'),
    defLost: lost(r, 'Defender'),
    ratio,
  };
}

type Gate = {
  battles: number;
  heldBoth: number;
  heldWorse: number;
  maxHeldIncrease: number;
  flips: Array<{ setup: string; ratio: number }>;
  winsBase: number;
  winsCand: number;
  heldExtra: number;
};

async function matrix(fatigue: number): Promise<Gate> {
  const g: Gate = {
    battles: 0,
    heldBoth: 0,
    heldWorse: 0,
    maxHeldIncrease: 0,
    flips: [],
    winsBase: 0,
    winsCand: 0,
    heldExtra: 0,
  };
  for (const tier of [1, 2, 3])
    for (const fort of [1, 4, 8, 16]) {
      if ((tier === 2 && fort < 4) || (tier === 3 && fort < 8)) continue;
      for (const share of [0, 0.5, 1])
        for (const edge of [0.8, 1, 1.05, 1.1, 1.2, 1.4, 1.6, 2])
          for (let seed = 0; seed < SEEDS; seed++) {
            const s: Setup = { fort, tier, share, edge, fatigue };
            const a = await fight(s, seed, false);
            const b = await fight(s, seed, true);
            g.battles++;
            g.winsBase += a.won ? 1 : 0;
            g.winsCand += b.won ? 1 : 0;
            if (!a.won && !b.won) {
              g.heldBoth++;
              const inc = b.defLost - a.defLost;
              if (inc > 0) {
                g.heldWorse++;
                g.heldExtra += inc;
              }
              g.maxHeldIncrease = Math.max(g.maxHeldIncrease, inc);
            }
            if (!a.won && b.won)
              g.flips.push({
                setup: `L${tier} fort ${fort} ${share * 100}% equipped ${edge}x`,
                ratio: a.ratio,
              });
          }
    }
  return g;
}

async function breakEven(
  tier: number,
  fort: number,
  share: number,
  candidate: boolean,
) {
  for (let edge = 0.8; edge <= 2.5; edge = +(edge + 0.025).toFixed(3)) {
    let wins = 0;
    for (let seed = 0; seed < 40; seed++)
      wins += (
        await fight({ fort, tier, share, edge, fatigue: 0 }, seed, candidate)
      ).won
        ? 1
        : 0;
    if (wins / 40 >= 0.5) return edge;
  }
  return Infinity;
}

type Row = {
  id: number;
  attacker_id: number;
  winner: number;
  replay: null | {
    turns: number;
    defenderProtected: boolean;
    defenderDailyCasualtyRemaining: number;
    defenderDailyGoldRemaining: string;
    attacker: CombatUserSnapshot;
    defender: CombatUserSnapshot;
  };
  draws: number[] | null;
};

async function replay(file: string) {
  const rows: Row[] = JSON.parse(readFileSync(file, 'utf8'));
  const out = {
    battles: 0,
    heldBoth: 0,
    heldWorse: 0,
    maxHeldIncrease: 0,
    flips: [] as number[],
    farm: 0,
    farmWinsBase: 0,
    farmWinsCand: 0,
    farmAttLostBase: 0,
    farmAttLostCand: 0,
  };
  for (const row of rows) {
    if (!row.replay || !row.draws) continue;
    const run = async (candidate: boolean) => {
      applyCandidate(candidate);
      const r = row.replay!;
      let i = 0;
      const attacker = restoreBattleUser(r.attacker);
      const defender = restoreBattleUser(r.defender);
      const ratio = ratioOf(attacker, defender);
      const res: any = await simulateBattle(
        attacker,
        defender,
        r.defender.fortHitpoints,
        r.turns,
        false,
        r.defenderProtected,
        {
          random: () => row.draws![i++] ?? 0.5,
          defenderDailyCasualtyRemaining: r.defenderDailyCasualtyRemaining,
          defenderDailyGoldRemaining: BigInt(r.defenderDailyGoldRemaining),
        },
      );
      return {
        won: res.result === 'WIN',
        attLost: lost(res, 'Attacker'),
        defLost: lost(res, 'Defender'),
        ratio,
      };
    };
    const a = await run(false);
    const b = await run(true);
    out.battles++;
    if (!a.won && !b.won) {
      out.heldBoth++;
      const inc = b.defLost - a.defLost;
      if (inc > 0) {
        out.heldWorse++;
        console.log(
          `  held but worse: log ${row.id}, defender lost ${a.defLost} -> ${b.defLost}`,
        );
      }
      out.maxHeldIncrease = Math.max(out.maxHeldIncrease, inc);
    }
    if (!a.won && b.won) out.flips.push(row.id);
    if (a.ratio >= 5) {
      out.farm++;
      out.farmWinsBase += a.won ? 1 : 0;
      out.farmWinsCand += b.won ? 1 : 0;
      out.farmAttLostBase += a.attLost;
      out.farmAttLostCand += b.attLost;
    }
  }
  return out;
}

async function main() {
  console.log(
    `# Gear-parity gate (candidate${WITH_TROOP_CHIP ? ' + troop-only chip' : ''} vs today, paired on identical rolls)\n`,
  );
  console.log(
    '## Break-even fighters multiple (40 seeds, 0.025x steps, matched offense upgrade, protected defender)\n',
  );
  console.log('| Tier | Fort | Equipped | Today | Candidate |');
  console.log('|---|---|---|---|---|');
  for (const [tier, fort] of [
    [1, 1],
    [1, 8],
    [2, 4],
    [2, 16],
    [3, 8],
    [3, 16],
  ])
    for (const share of [0, 0.5, 1])
      console.log(
        `| L${tier} | ${fort} | ${share * 100}% | ${await breakEven(tier, fort, share, false)}× | ${await breakEven(tier, fort, share, true)}× |`,
      );

  for (const fatigue of [0, 0.05]) {
    const g = await matrix(fatigue);
    console.log(
      `\n## Paired matrix, defender fatigue ${fatigue * 100}% (${g.battles} battle pairs)\n`,
    );
    console.log('| Check | Result |');
    console.log('|---|---|');
    console.log(
      `| Attacker wins today → candidate | ${g.winsBase} → ${g.winsCand} |`,
    );
    console.log(`| Defender held in both runs | ${g.heldBoth} |`);
    console.log(
      `| …and lost more units with the candidate | ${g.heldWorse} (max +${g.maxHeldIncrease}) |`,
    );
    console.log(`| Hold → defeat flips | ${g.flips.length} |`);
    const byEdge = new Map<string, number>();
    for (const f of g.flips) {
      const e = f.setup.match(/ (\d+(\.\d+)?)x$/)?.[1] ?? '?';
      byEdge.set(e, (byEdge.get(e) ?? 0) + 1);
    }
    console.log(
      `| Flips by attacker army multiple | ${[...byEdge].map(([e, n]) => `${e}×: ${n}`).join(', ')} |`,
    );
    console.log(
      `| Mean extra units per worse hold | ${g.heldWorse ? (g.heldExtra / g.heldWorse).toFixed(1) : '0'} |`,
    );
  }

  const file = process.argv[2];
  if (file) {
    const r = await replay(file);
    console.log(`\n## Production replay (${r.battles} battles)\n`);
    console.log('| Check | Result |');
    console.log('|---|---|');
    console.log(`| Defender held in both runs | ${r.heldBoth} |`);
    console.log(
      `| …and lost more units with the candidate | ${r.heldWorse} (max +${r.maxHeldIncrease}) |`,
    );
    console.log(
      `| Hold → defeat flips | ${r.flips.length ? r.flips.join(', ') : 'none'} |`,
    );
    console.log(`| Farming battles (ratio ≥ 5) | ${r.farm} |`);
    console.log(
      `| Farming win rate today → candidate | ${r.farmWinsBase}/${r.farm} → ${r.farmWinsCand}/${r.farm} |`,
    );
    console.log(
      `| Farming attacker losses today → candidate | ${r.farmAttLostBase} → ${r.farmAttLostCand} |`,
    );
  }
  applyCandidate(false);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
