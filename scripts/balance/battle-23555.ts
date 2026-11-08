/**
 * Battle #23555 reconstruction on the current engine (#200).
 *
 * Synthetic reconstruction of the recorded fight: 164 level-1 offense soldiers
 * with 84 level-1 offense sets (player level 3, 18,365 XP) against 770 level-1
 * guards with 589 level-1 defense sets (player level 1, 3,038 XP), fort level 1
 * at 50 HP, 2,192 population (770 guards + 1,271 workers + 101 citizens + 50
 * offense soldiers). The original random rolls and prior attack pressure were
 * not recovered, so this is not a seeded replay: the default roll is the
 * midpoint, and a seeded spread shows how far real rolls move the outcome.
 *
 * Reports casualties (killed + wounded), chip damage, fort damage and the cap
 * that bound each side, for: the recorded setup, both protection states,
 * 1-10 committed turns, attacker stamina and defender fatigue, a prior
 * dogpile allowance, and mirrored / near-even / overwhelming variants.
 * Run: bun --no-env-file scripts/balance/battle-23555.ts [--phases]
 */
import { calculateStrength } from '@/utils/attackFunctions';
import { CURRENT_COMBAT_RULESET } from '@/utils/balance/combatRulesets';

import {
  ATTACKER,
  CHIP_TAPER_OFF,
  DEFENDER,
  makeUser,
  run,
  type Scenario,
  type Setup,
  withChipRules,
} from './lib/battle23555';

type Outcome = Awaited<ReturnType<typeof run>>;
const pad = (v: unknown, n: number) => String(v).padEnd(n);
const header = () =>
  console.log(
    `${pad('scenario', 46)}${pad('res', 6)}${pad('att k+w=t', 11)}${pad('def k+w=t', 11)}${pad('fort', 5)}${pad('chip', 8)}${pad('xp a/d', 12)}${pad('att cap', 13)}${pad('def cap', 13)}`,
  );
const row = (label: string, o: Outcome) =>
  console.log(
    `${pad(label, 46)}${pad(o.result, 6)}${pad(`${o.attKilled}+${o.attWounded}=${o.attLost}`, 11)}` +
      `${pad(`${o.defKilled}+${o.defWounded}=${o.defLost}`, 11)}${pad(o.fortDmg, 5)}${pad(Math.round(o.chipRaw), 8)}` +
      `${pad(`${o.xp[0]}/${o.xp[1]}`, 12)}${pad(o.attBind, 13)}${pad(o.defBind, 13)}`,
  );

const base: Scenario = {
  label: '',
  attacker: ATTACKER,
  defender: DEFENDER,
  turns: 10,
  protectedDefender: false,
};
const withDefender = (over: Partial<Setup>): Setup => ({
  ...DEFENDER,
  ...over,
});
const withDefRoster = (over: Setup['roster']): Setup => ({
  ...DEFENDER,
  roster: { ...DEFENDER.roster, ...over },
});

async function main() {
  const a = calculateStrength(makeUser('A', ATTACKER) as any, 'OFFENSE');
  const d = calculateStrength(makeUser('D', DEFENDER) as any, 'DEFENSE');
  console.log('Current engine strength before rolls');
  console.log(
    `  attacker melee attack ${a.totalStats.MeleeAtkPower}, defender melee defense ${d.totalStats.MeleeDefPower} ` +
      `(ratio ${(a.totalStats.MeleeAtkPower / d.totalStats.MeleeDefPower).toFixed(3)}; taper starts at ${CURRENT_COMBAT_RULESET.constants.CHIP_TAPER_START_RATIO})`,
  );
  console.log(
    'The issue recorded 3,256 attack vs 28,588 defense on the pre-parity (combat-v7) set split.\n',
  );

  header();
  const baseline = await run({ ...base });
  row('#23555 recorded setup, 10 turns, midpoint', baseline);
  row('  defender protected', await run({ ...base, protectedDefender: true }));
  row(
    '  prior dogpile: 20 casualties left today',
    await run({ ...base, options: { defenderDailyCasualtyRemaining: 20 } }),
  );
  row(
    '  attacker stamina 40',
    await run({ ...base, attacker: { ...ATTACKER, stamina: 40 } }),
  );
  row(
    '  defender garrison fatigue 10%',
    await run({ ...base, defender: withDefender({ fatigue: 0.1 }) }),
  );
  row(
    '  fort at 25/50 HP',
    await run({ ...base, defender: withDefender({ fortHp: 25 }) }),
  );
  row(
    '  fort destroyed (0 HP)',
    await run({ ...base, defender: withDefender({ fortHp: 0 }) }),
  );
  row(
    '  no civilians',
    await run({
      ...base,
      defender: withDefRoster({ workers: 0, citizens: 0 }),
    }),
  );
  row(
    '  civilians doubled',
    await run({
      ...base,
      defender: withDefRoster({ workers: 2_542, citizens: 202 }),
    }),
  );
  row(
    '  defender half equipped (295 sets)',
    await run({ ...base, defender: withDefRoster({ defenseSets: 295 }) }),
  );
  row(
    '  defender unequipped (0 sets)',
    await run({ ...base, defender: withDefRoster({ defenseSets: 0 }) }),
  );
  row(
    '  unequipped + 5 casualties left today',
    await run({
      ...base,
      defender: withDefRoster({ defenseSets: 0 }),
      options: { defenderDailyCasualtyRemaining: 5 },
    }),
  );
  row(
    '  attacker L1 v defender L5 (level gap reversed)',
    await run({
      ...base,
      attacker: { ...ATTACKER, level: 1 },
      defender: withDefender({ level: 5 }),
    }),
  );
  row(
    '  attacker L11 v defender L1 (level gap 10)',
    await run({ ...base, attacker: { ...ATTACKER, level: 11 } }),
  );

  // Which of the post-#200 rules keeps the guards unhurt: switch each off.
  console.log('\nRule attribution (recorded setup, unprotected, midpoint)');
  header();
  const withRules = (rules: Parameters<typeof withChipRules>[0]): Scenario => ({
    ...base,
    options: { ruleset: withChipRules(rules) },
  });
  row('  chip taper off (#201 reverted)', await run(withRules(CHIP_TAPER_OFF)));
  row(
    '  troop-only chip off (#251 reverted)',
    await run(withRules({ CHIP_FROM_TROOPS_ONLY: false })),
  );
  row(
    '  both off: chip as filed in the issue',
    await run(withRules({ ...CHIP_TAPER_OFF, CHIP_FROM_TROOPS_ONLY: false })),
  );

  console.log('\nCommitted turns (recorded setup, unprotected, midpoint)');
  header();
  for (const turns of [1, 2, 3, 5, 7, 10]) {
    row(`  ${turns} turns`, await run({ ...base, turns }));
  }

  console.log('\nSeeded rolls, 200 seeds, recorded setup');
  for (const protectedDefender of [false, true]) {
    const N = 200;
    let wins = 0;
    let attLost = 0;
    let defLost = 0;
    let moreDefDeaths = 0;
    const caps: Record<string, number> = {};
    for (let seed = 0; seed < N; seed++) {
      const o = await run({
        ...base,
        protectedDefender,
        seed: `23555:${seed}`,
      });
      wins += o.result === 'WIN' ? 1 : 0;
      attLost += o.attLost;
      defLost += o.defLost;
      moreDefDeaths += o.defLost > o.attLost ? 1 : 0;
      const key = `att:${o.attBind}/def:${o.defBind}`;
      caps[key] = (caps[key] ?? 0) + 1;
    }
    console.log(
      `  protected=${protectedDefender}: attacker wins ${wins}/${N}, mean losses att ${(attLost / N).toFixed(1)} def ${(defLost / N).toFixed(1)}, ` +
        `defender lost more ${moreDefDeaths}/${N}, binding caps ${JSON.stringify(caps)}`,
    );
  }

  console.log('\nOther matchups (unprotected, 10 turns, midpoint)');
  header();
  const army = (offense: number): Setup => ({
    level: 3,
    xp: 18_365,
    fort: 1,
    roster: { offense, offenseSets: offense },
  });
  const guards = (defense: number, civilians = 1_271): Setup => ({
    level: 3,
    xp: 18_365,
    fort: 1,
    roster: { defense, defenseSets: defense, workers: civilians },
  });
  row(
    'mirrored 770 v 770, full sets',
    await run({ ...base, attacker: army(770), defender: guards(770) }),
  );
  for (const edge of [1.05, 1.1, 1.5, 3]) {
    row(
      `attacker x${edge} v 770 guards`,
      await run({
        ...base,
        attacker: army(Math.round(770 * edge)),
        defender: guards(770),
      }),
    );
  }
  row(
    'civilian check: x1.5 with no civilians',
    await run({
      ...base,
      attacker: army(1_155),
      defender: guards(770, 0),
    }),
  );
  row(
    'civilian check: x1.5 with 5,000 workers',
    await run({
      ...base,
      attacker: army(1_155),
      defender: guards(770, 5_000),
    }),
  );
  row(
    'overwhelming defense: 164 v 3,000 guards',
    await run({ ...base, defender: guards(3_000) }),
  );
  row(
    'overwhelming attack: 2,000 v 164 guards',
    await run({ ...base, attacker: army(2_000), defender: guards(164) }),
  );
  row(
    'tiny stacks: 5 v 5',
    await run({ ...base, attacker: army(5), defender: guards(5, 20) }),
  );

  if (process.argv.includes('--phases')) {
    console.log('\nPer-phase trace (recorded setup, midpoint)');
    console.log('turn  source    type    raw      mitigated  fortHp  breach');
    for (const m of baseline.log) {
      console.log(
        `${pad(m.turn, 6)}${pad(m.source, 10)}${pad(m.attackType, 8)}${pad(Math.round(m.rawDamage), 9)}${pad(Math.round(m.mitigatedDamage), 11)}${pad(`${m.fortHpStart}->${m.fortHpEnd}`, 8)}${m.fortBreached}`,
      );
    }
    console.log('\nBaseline damage audit (keys are the receiving side)');
    console.log(
      JSON.stringify(
        { attacker: baseline.attAudit, defender: baseline.defAudit },
        null,
        1,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
