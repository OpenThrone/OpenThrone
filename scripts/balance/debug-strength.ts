/** Inspect what BattleUser/calculateStrength compute for the mirror fixture. */
import { BattleUser } from '@/models/BattleUser';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { calculateStrength } from '@/utils/attackFunctions';

const g = new MockUserGenerator();
g.setLevel(20)
  .setFortLevel(6)
  .setFortHitpoints(750)
  .adjustGold(5_000_000n - 25000n)
  .clearUnits()
  .clearItems()
  .clearBattleUpgrades();
g.addUnits([
  { id: 0, userId: 1, type: 'OFFENSE', level: 1, quantity: 1000, isMercenary: false },
  { id: 1, userId: 1, type: 'DEFENSE', level: 1, quantity: 800, isMercenary: false },
  { id: 2, userId: 1, type: 'CITIZEN', level: 1, quantity: 1600, isMercenary: false },
  { id: 3, userId: 1, type: 'WORKER', level: 1, quantity: 900, isMercenary: false },
  { id: 4, userId: 1, type: 'SPY', level: 1, quantity: 10, isMercenary: false },
  { id: 5, userId: 1, type: 'SENTRY', level: 1, quantity: 10, isMercenary: false },
] as any);

const bu = new BattleUser(g.getUser() as any);
console.log('BattleUser scalar stats:', {
  offense: bu.offense,
  defense: bu.defense,
  spy: bu.spy,
  sentry: bu.sentry,
  attackBonus: bu.attackBonus,
  defenseBonus: bu.defenseBonus,
  level: bu.level,
  population: bu.population,
  units: bu.units?.map((u: any) => `${u.type}x${u.quantity}`),
  mercenaries: bu.mercenaries?.map((u: any) => `${u.type}x${u.quantity}`),
  structureUpgrades: bu.structure_upgrades?.map((s: any) => `${s.type}:${s.level}`),
});

const off = calculateStrength(bu as any, 'OFFENSE');
const def = calculateStrength(bu as any, 'DEFENSE');
console.log('calculateStrength OFFENSE totalStats:', off.totalStats);
console.log('calculateStrength DEFENSE totalStats:', def.totalStats);
