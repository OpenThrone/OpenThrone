import { expect, it } from 'bun:test';
import { playerUnit } from 'test/utils/factories';

import { SpyUser } from '@/models/SpyUser';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';
import { simulateIntel } from '@/utils/spyFunctions';

it('a full SpyUser intel report uses consumer camelCase fort fields and exact unit quantities', () => {
  const attackerData = new MockUserGenerator();
  attackerData.clearUnits().setFortLevel(16).setSpyUpgrade(16);
  attackerData.addUnits([playerUnit('SPY', 1, 1000)]);
  const defenderData = new MockUserGenerator();
  defenderData.clearUnits().setFortLevel(16).setFortHitpoints(7312);
  defenderData.addUnits([playerUnit('WORKER', 1, 173)]);
  defenderData.getPrismaUser().gold_in_bank = 654321n;
  const attacker = new SpyUser(attackerData.getUser());
  const defender = new SpyUser(defenderData.getUser());
  const result = simulateIntel(attacker, defender, 10, {
    random: createSeededRandom('model-intel'),
  });
  expect(result.success).toBe(true);
  expect(result.intelligenceGathered?.fortLevel).toBe(16);
  expect(result.intelligenceGathered?.fortHitpoints).toBe(7312);
  expect(result.intelligenceGathered?.goldInBank).toBe(654321n);
  expect(
    result.intelligenceGathered?.units?.find((unit) => unit.type === 'WORKER')
      ?.quantity,
  ).toBe(173);
});
