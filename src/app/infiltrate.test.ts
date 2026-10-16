import { expect, it } from 'bun:test';
import { playerUnit } from 'test/utils/factories';

import { SpyUser } from '@/models/SpyUser';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { simulateInfiltration } from '@/utils/spyFunctions';

it('failed infiltration removes the actual dispatched regular and mercenary tier without touching other spies or fort HP', () => {
  const attackerData = new MockUserGenerator();
  attackerData.clearUnits().setFortLevel(16).setSpyUpgrade(16);
  const units = [
    playerUnit('SPY', 1, 10),
    playerUnit('SPY', 2, 1),
    { ...playerUnit('SPY', 2, 2), isMercenary: true },
  ];
  const defenderData = new MockUserGenerator();
  defenderData.clearUnits().setFortLevel(16).setFortHitpoints(10000);
  defenderData.addUnits([playerUnit('SENTRY', 3, 1000)]);
  const attacker = new SpyUser(attackerData.getUser(), { units });
  const defender = new SpyUser(defenderData.getUser());
  const before = attacker.unitTotals.infiltrators;
  const result = simulateInfiltration(attacker, defender, 7, {
    random: () => 0.999,
    turns: 10,
  });
  expect(result.success).toBe(false);
  expect(result.spiesSent).toBe(3);
  expect(result.spiesLost).toBe(3);
  expect(before - attacker.unitTotals.infiltrators).toBe(result.spiesLost);
  expect(attacker.unitTotals.spies).toBe(10);
  expect(defender.fortHitpoints).toBe(10000);
  expect(result.fortDmg).toBe(0);
});
