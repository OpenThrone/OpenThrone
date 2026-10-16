/** One instrumented mirror battle to trace where attacker losses come from. */
import UserModel from '@/models/Users';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';
import { executeAttack } from '@/utils/attackFunctions';

function makeUser(level: number, fortLevel: number, units: any[], gold = 5_000_000n) {
  const g = new MockUserGenerator();
  g.setLevel(level)
    .setFortLevel(fortLevel)
    .setFortHitpoints(750)
    .adjustGold(gold - 25000n)
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades();
  g.addUnits(units.map((u, i) => ({ id: i, userId: 1, isMercenary: false, ...u })));
  return new UserModel(g.getUser() as any);
}

async function main() {
  const units = [
    { type: 'OFFENSE', level: 1, quantity: 1000 },
    { type: 'DEFENSE', level: 1, quantity: 800 },
    { type: 'CITIZEN', level: 1, quantity: 1600 },
    { type: 'WORKER', level: 1, quantity: 900 },
    { type: 'SPY', level: 1, quantity: 10 },
    { type: 'SENTRY', level: 1, quantity: 10 },
  ];
  const attacker = makeUser(20, 6, units.map((u) => ({ ...u })));
  const defender = makeUser(20, 6, units.map((u) => ({ ...u })));
  const result = await executeAttack(attacker as any, defender as any, 10, false, {
    random: createSeededRandom('debug-1'),
  });

  console.log('RESULT:', result.result);
  console.log('pillagedGold:', result.pillagedGold.toString());
  console.log('attacker losses:', JSON.stringify(result.Losses.Attacker));
  console.log('defender losses:', JSON.stringify(result.Losses.Defender));
  console.log('finalFortHP:', (result as any).finalFortHP);
  console.log('\nmitigation log (turn, source, type, raw, mitigated):');
  for (const e of (result as any).mitigationLog ?? []) {
    console.log(
      `  t${e.turn} ${e.source} ${e.attackType} raw=${Math.round(e.rawDamage)} dealt=${Math.round(e.mitigatedDamage)} fortHP=${Math.round(e.fortHpEnd)} soak=${e.fortSoakMultiplier?.toFixed(2)} mit=${e.mitigationMultiplier ?? 1}`,
    );
  }
}

main();
