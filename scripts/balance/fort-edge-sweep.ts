/**
 * Break-even army size by fort level (#202 option 1 groundwork).
 *
 * Attacker and defender have the same unit tier and gear; the attacker's
 * fighters are scaled until it wins. Reports, per fort level and tier, the
 * attacker win rate at each army multiple, so the defender's structural edge
 * can be compared with the intended 5-10% attacker edge.
 * Run: bun --no-env-file scripts/balance/fort-edge-sweep.ts
 */
import { Fortifications, OffensiveUpgrades } from '@/constants';
import { DEFENDER_FATIGUE_PER_PRESSURE } from '@/constants/KingdomMorale';
import { executeAttack } from '@/utils/attackFunctions';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { createSeededRandom } from '@/utils/random';

const SEEDS = 40;
const SIZE = 2_000;
// Fine steps, so the 10/50/90% win thresholds are bracketed to 0.05x.
const EDGES = Array.from({ length: 49 }, (_, i) => +(1 + i * 0.05).toFixed(2));
const FORTS = [1, 2, 3, 4, 6, 8, 16, 24];
const SLOTS = ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'];
/** Tiers: level-1 units with full level-1 sets (production today), L2, L3. */
const TIERS = [
  { name: 'L1 + L1 sets', unit: 1, item: 1, minFort: 1 },
  { name: 'L2 + L2 sets', unit: 2, item: 2, minFort: 4 },
  { name: 'L3 + L3 sets', unit: 3, item: 3, minFort: 8 },
];

function makeUser(
  name: string,
  fortLevel: number,
  tier: (typeof TIERS)[number],
  scale: number,
  matchedOffense = false,
  opts: { fatigue?: number; noFortBonus?: boolean; equipShare?: number } = {},
) {
  const fort = Fortifications.find((f) => f.level === fortLevel)!;
  const fighters = Math.round(SIZE * 0.35 * scale);
  const units = [
    ['OFFENSE', tier.unit, fighters],
    ['DEFENSE', tier.unit, fighters],
    ['WORKER', 1, Math.round(SIZE * 0.25)],
    ['CITIZEN', 1, Math.round(SIZE * 0.05)],
  ].map(([type, level, quantity], i) => ({
    id: i + 1,
    userId: 1,
    type,
    level,
    quantity,
    isMercenary: false,
  }));
  // The same share of each side carries a full set (the owner's target).
  const equipped = Math.round(fighters * (opts.equipShare ?? 1));
  const items = ['OFFENSE', 'DEFENSE'].flatMap((usage) =>
    SLOTS.map((type) => ({
      usage,
      type,
      level: tier.item,
      quantity: equipped,
    })),
  );
  return {
    id: name,
    displayName: name,
    level: 5,
    race: 'HUMAN',
    class: 'FIGHTER',
    houseLevel: 1,
    fortLevel,
    fortHitpoints: fort.hitpoints,
    gold: 2_000_000n,
    units,
    mercenaries: [],
    items,
    structure_upgrades: [{ type: 'ARMORY', level: tier.item }],
    battle_upgrades: [],
    // A matched player holds the offense upgrade unlocked at the same fort.
    attackBonus: matchedOffense
      ? (OffensiveUpgrades.filter((u) => u.level <= fortLevel).at(-1)
          ?.offenseBonusPercentage ?? 0)
      : 0,
    defenseBonus: opts.noFortBonus ? 0 : fort.defenseBonusPercentage,
    defensePressureToday: (opts.fatigue ?? 0) / DEFENDER_FATIGUE_PER_PRESSURE,
    stamina: 100,
    experience: 0,
  };
}

/** Break-even army multiple at one setting (first 0.05x step with >=50% wins). */
async function breakEven(
  fortLevel: number,
  tier: (typeof TIERS)[number],
  opts: {
    fatigue?: number;
    noFortBonus?: boolean;
    equipShare?: number;
    protectedDefender: boolean;
  },
): Promise<string> {
  for (const edge of EDGES) {
    let wins = 0;
    for (let s = 0; s < SEEDS; s++) {
      const r: any = await executeAttack(
        makeUser('A', fortLevel, tier, edge, true, opts) as any,
        makeUser('D', fortLevel, tier, 1, true, opts) as any,
        10,
        opts.protectedDefender,
        { random: createSeededRandom(`fort-edge:${s}`) },
      );
      wins += r.result === 'WIN' ? 1 : 0;
    }
    if (wins / SEEDS >= 0.5) return `${edge}×`;
  }
  return `>${EDGES[EDGES.length - 1]}×`;
}

/**
 * One-at-a-time switches at fort 1 with level-1 armies (today's game) and
 * matched offense upgrades. The attacker's per-turn combat fatigue and the
 * assault-success test live inside the engine and are not switchable here.
 */
async function decompose() {
  const tier = TIERS[0];
  const weights = V5_COMBAT_CONSTANTS as {
    RANGED_DEFENSE_ASSAULT_WEIGHT: number;
  };
  const original = weights.RANGED_DEFENSE_ASSAULT_WEIGHT;
  const rows: Array<[string, () => Promise<string>]> = [
    [
      'Baseline (level-5 defender is protected)',
      () => breakEven(1, tier, { protectedDefender: true }),
    ],
    ['Protection off', () => breakEven(1, tier, { protectedDefender: false })],
    [
      'Fort defense bonus off',
      () => breakEven(1, tier, { protectedDefender: true, noFortBonus: true }),
    ],
    [
      'Ranged defenders do not support melee assaults',
      async () => {
        weights.RANGED_DEFENSE_ASSAULT_WEIGHT = 0;
        try {
          return await breakEven(1, tier, { protectedDefender: true });
        } finally {
          weights.RANGED_DEFENSE_ASSAULT_WEIGHT = original;
        }
      },
    ],
    [
      'Protection, fort bonus and ranged support all off',
      async () => {
        weights.RANGED_DEFENSE_ASSAULT_WEIGHT = 0;
        try {
          return await breakEven(1, tier, {
            protectedDefender: false,
            noFortBonus: true,
          });
        } finally {
          weights.RANGED_DEFENSE_ASSAULT_WEIGHT = original;
        }
      },
    ],
    [
      'Baseline, half of each side equipped',
      () => breakEven(1, tier, { protectedDefender: true, equipShare: 0.5 }),
    ],
    [
      'Baseline, nobody equipped',
      () => breakEven(1, tier, { protectedDefender: true, equipShare: 0 }),
    ],
    [
      'Baseline with 10% defender fatigue',
      () => breakEven(1, tier, { protectedDefender: true, fatigue: 0.1 }),
    ],
  ];
  console.log(
    '\n## Fort 1, L1 units, matched offense: break-even by switch (one change vs the protected baseline unless noted)\n',
  );
  console.log('| Setting | Break-even |');
  console.log('|---|---|');
  for (const [label, run] of rows) console.log(`| ${label} | ${await run()} |`);
}

async function main() {
  console.log(
    `# Fort edge sweep (${SIZE}-unit armies, 10 turns, ${SEEDS} seeds, level-5 protected defender; fighters multiple needed)\n`,
  );
  console.log(
    '| Fort (def bonus) | Tier | 10% wins | 50% wins (break-even) | 90% wins |',
  );
  console.log('|---|---|---|---|---|');
  for (const matched of [false, true])
    for (const tier of TIERS)
      for (const fortLevel of FORTS) {
        if (fortLevel < tier.minFort) continue;
        const fort = Fortifications.find((f) => f.level === fortLevel)!;
        const rates: number[] = [];
        for (const edge of EDGES) {
          let wins = 0;
          for (let s = 0; s < SEEDS; s++) {
            const r: any = await executeAttack(
              makeUser('A', fortLevel, tier, edge, matched) as any,
              makeUser('D', fortLevel, tier, 1) as any,
              10,
              // Level-5 players are protected (level 9 and under), as live.
              true,
              { random: createSeededRandom(`fort-edge:${s}`) },
            );
            wins += r.result === 'WIN' ? 1 : 0;
          }
          rates.push(wins / SEEDS);
        }
        // Smallest sampled multiple reaching each win rate; the true threshold
        // lies within 0.05x below it.
        const at = (p: number) => {
          const i = rates.findIndex((r) => r >= p);
          return i < 0 ? `>${EDGES[EDGES.length - 1]}×` : `${EDGES[i]}×`;
        };
        console.log(
          `| ${fortLevel} (+${fort.defenseBonusPercentage}%) | ${tier.name}${matched ? ', matched offense upgrade' : ''} | ${at(0.1)} | ${at(0.5)} | ${at(0.9)} |`,
        );
      }
  await decompose();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
