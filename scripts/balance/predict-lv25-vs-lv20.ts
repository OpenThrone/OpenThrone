/**
 * Scenario: Lv25 Human raider (A) attacks Lv20 Undead (B).
 *
 * A: 10,000 x OFFENSE lvl2 (Knights)
 * B: 4,000 x DEFENSE lvl2 (Archers), 1,000 x DEFENSE lvl1 (Guards),
 *    5,000 Workers, 5,000 x OFFENSE lvl2 (Knights), fort 100% (level 5 = 500hp)
 *
 * No items, no bonus points, no battle upgrades. Both FIGHTER class.
 * Run: bun scripts/balance/predict-lv25-vs-lv20.ts
 */
import { Fortifications, levelXPArray } from '@/constants';
import UserModel from '@/models/Users';
import { captureLogs, setLogLevel } from '@/utils/logger';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';
import { executeAttack } from '@/utils/attackFunctions';

const REPEATS = 200;

function build(opts: {
  race: string;
  playerClass: string;
  level: number;
  fortLevel: number;
  gold: bigint;
  units: Array<[string, number, number]>;
}): UserModel {
  const g = new MockUserGenerator();
  g.setLevel(opts.level)
    .setFortLevel(opts.fortLevel)
    .setFortHitpoints(Fortifications.find((f) => f.level === opts.fortLevel)?.hitpoints ?? 500)
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
  raw.class = opts.playerClass;
  raw.experience = levelXPArray.find((l) => l.level === opts.level)?.xp ?? 0;
  return new UserModel(raw);
}

async function main() {
  setLogLevel('WARN'); // capture noise; only real problems surface
  const { logs } = await captureLogs(async () => {
    let wins = 0;
    let attLossPct = 0;
    let defLossPct = 0;
    let defTroopLossPct = 0; // losses among B's 5,000 DEFENSE units only
    let workerLoss = 0;
    let bOffenseLoss = 0;
    let pillage = 0;
    let fortEndPct = 0;

    for (let i = 0; i < REPEATS; i++) {
      const A = build({
        race: 'HUMAN',
        playerClass: 'FIGHTER',
        level: 25,
        fortLevel: 6,
        gold: 1_000_000n,
        units: [['OFFENSE', 2, 10000]],
      });
      const B = build({
        race: 'UNDEAD',
        playerClass: 'FIGHTER',
        level: 20,
        fortLevel: 5,
        gold: 5_000_000n,
        units: [
          ['DEFENSE', 2, 4000],
          ['DEFENSE', 1, 1000],
          ['WORKER', 1, 5000],
          ['OFFENSE', 2, 5000],
        ],
      });
      const result = await executeAttack(A as any, B as any, 10, false, {
        random: createSeededRandom(`ab-${i}`),
      });

      if (result.result === 'WIN') wins++;
      const attOffenseLost = (result.Losses?.Attacker?.units ?? [])
        .filter((u: any) => u.type === 'OFFENSE')
        .reduce((s: number, u: any) => s + u.quantity, 0);
      attLossPct += (attOffenseLost / 10000) * 100;

      const defLosses = result.Losses?.Defender?.units ?? [];
      const defTroop = defLosses
        .filter((u: any) => u.type === 'DEFENSE')
        .reduce((s: number, u: any) => s + u.quantity, 0);
      const workers = defLosses
        .filter((u: any) => u.type === 'WORKER')
        .reduce((s: number, u: any) => s + u.quantity, 0);
      const bOffense = defLosses
        .filter((u: any) => u.type === 'OFFENSE')
        .reduce((s: number, u: any) => s + u.quantity, 0);
      defLossPct += (result.Losses?.Defender?.total ?? 0) / 15000 * 100;
      defTroopLossPct += (defTroop / 5000) * 100;
      workerLoss += workers;
      bOffenseLoss += bOffense;
      pillage += Number(result.pillagedGold ?? 0);
      fortEndPct += ((result as any).finalFortHP / 500) * 100;
    }

    console.log(`levels: A=${build({ race: 'HUMAN', playerClass: 'FIGHTER', level: 25, fortLevel: 6, gold: 1n, units: [] }).level} B=20`);
    console.log(`A win rate:            ${(wins / REPEATS * 100).toFixed(0)}%`);
    console.log(`A knights lost:        ${(attLossPct / REPEATS).toFixed(1)}% of 10,000`);
    console.log(`B def troops lost:     ${(defTroopLossPct / REPEATS).toFixed(1)}% of 5,000`);
    console.log(`B workers lost:        ${(workerLoss / REPEATS).toFixed(1)} of 5,000`);
    console.log(`B knights lost:        ${(bOffenseLoss / REPEATS).toFixed(1)} of 5,000`);
    console.log(`B total pop lost:      ${(defLossPct / REPEATS).toFixed(2)}% of 15,000`);
    console.log(`pillaged gold:         ${Math.round(pillage / REPEATS).toLocaleString()} (of 5M on hand)`);
    console.log(`B fort HP at end:      ${(fortEndPct / REPEATS).toFixed(0)}%`);
    return null;
  });
  void logs;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
