import { describe, expect, test } from 'bun:test';
import {
  playerUnit,
  structureUpgrade,
  userFixture,
} from 'test/utils/factories';

import { UserStatsService } from '@/services/UserStatsService';

describe('UserStatsService / UserUnitsService parity checks (spy/sentry)', () => {
  test('attacker with many spies should have higher spy stat than defender sentry (attacker advantage)', () => {
    const attackerData = userFixture({
      units: [
        playerUnit('SPY', 1, 2000),
        playerUnit('SPY', 2, 1000),
        playerUnit('SPY', 3, 1000),
      ],
      structure_upgrades: [structureUpgrade('SPY', 5)],
      fortLevel: 5,
      fortHitpoints: 500,
      race: 'ELF',
      class: 'ASSASSIN',
    });

    const defenderData = userFixture({
      units: [playerUnit('SENTRY', 1, 100), playerUnit('SENTRY', 2, 50)],
      structure_upgrades: [structureUpgrade('SENTRY', 3)],
      fortLevel: 4,
      fortHitpoints: 400,
      race: 'HUMAN',
      class: 'CLERIC',
    });

    const attackerStats = new UserStatsService(attackerData);
    const defenderStats = new UserStatsService(defenderData);

    const attackerSpy =
      attackerStats.calculateArmyStat('SPY').totalStats.MeleeAtkPower;
    const defenderSentry =
      defenderStats.calculateArmyStat('SENTRY').totalStats.MeleeDefPower;

    // Parity expectation: attacker advantage => attackerSpy > defenderSentry
    expect(attackerSpy).toBeGreaterThan(defenderSentry);
  });

  test('defender with overwhelming sentries should have higher sentry stat than attacker spy (defender advantage)', () => {
    const attackerData = userFixture({
      units: [playerUnit('SPY', 1, 100), playerUnit('SPY', 2, 50)],
      structure_upgrades: [structureUpgrade('SPY', 1)],
      fortLevel: 1,
      fortHitpoints: 100,
      race: 'ELF',
      class: 'ASSASSIN',
    });

    const defenderData = userFixture({
      units: [
        playerUnit('SENTRY', 1, 6000),
        playerUnit('SENTRY', 2, 2000),
        playerUnit('DEFENSE', 1, 1000),
        playerUnit('CITIZEN', 1, 2000),
        playerUnit('WORKER', 1, 1000),
      ],
      structure_upgrades: [structureUpgrade('SENTRY', 5)],
      fortLevel: 6,
      fortHitpoints: 800,
      race: 'HUMAN',
      class: 'CLERIC',
    });

    const attackerStats = new UserStatsService(attackerData);
    const defenderStats = new UserStatsService(defenderData);

    const attackerSpy =
      attackerStats.calculateArmyStat('SPY').totalStats.MeleeAtkPower;
    const defenderSentry =
      defenderStats.calculateArmyStat('SENTRY').totalStats.MeleeDefPower;

    // Parity expectation: defender advantage => attackerSpy < defenderSentry
    expect(attackerSpy).toBeLessThan(defenderSentry);
  });
});
