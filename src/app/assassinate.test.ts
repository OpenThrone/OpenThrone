import { expect, it } from 'bun:test';
import { playerUnit } from 'test/utils/factories';

import { SpyUser } from '@/models/SpyUser';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { simulateAssassination } from '@/utils/spyFunctions';

it('an actually unlocked SpyUser assassin damages workers and reports their actual removal', () => {
  const attackerData = new MockUserGenerator();
  attackerData.clearUnits().setFortLevel(16).setSpyUpgrade(16);
  attackerData.addUnits([playerUnit('SPY', 3, 1)]);
  const defenderData = new MockUserGenerator();
  defenderData.clearUnits().setFortLevel(16);
  defenderData.addUnits([playerUnit('WORKER', 1, 1000)]);
  const attacker = new SpyUser(attackerData.getUser());
  const defender = new SpyUser(defenderData.getUser());
  const before = defender.unitTotals.workers;
  const result = simulateAssassination(attacker, defender, 1, 'WORKER', {
    random: () => 0.5,
    turns: 10,
  });
  expect(result.success).toBe(true);
  expect(result.unitsKilled).toBeGreaterThan(0);
  expect(before - defender.unitTotals.workers).toBe(result.unitsKilled);
  expect(result.spiesLost).toBeLessThanOrEqual(1);
});
