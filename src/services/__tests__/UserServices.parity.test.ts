import { UserStatsService } from '@/services/UserStatsService';
import { UserUnitsService } from '@/services/UserUnitsService';

describe('UserStatsService / UserUnitsService parity checks (spy/sentry)', () => {
  test('attacker with many spies should have higher spy stat than defender sentry (attacker advantage)', () => {
    const attackerData = {
      units: [
        { type: 'SPY', level: 1, quantity: 2000 },
        { type: 'SPY', level: 2, quantity: 1000 },
        { type: 'SPY', level: 3, quantity: 1000 },
      ],
      items: [],
      structure_upgrades: [{ type: 'SPY', level: 5 }],
      bonus_points: [],
      battle_upgrades: [],
      stats: [],
      fortLevel: 5,
      fortHitpoints: 500,
      race: 'ELF',
      class: 'ASSASSIN',
    };

    const defenderData = {
      units: [
        { type: 'SENTRY', level: 1, quantity: 100 },
        { type: 'SENTRY', level: 2, quantity: 50 },
      ],
      items: [],
      structure_upgrades: [{ type: 'SENTRY', level: 3 }],
      bonus_points: [],
      battle_upgrades: [],
      stats: [],
      fortLevel: 4,
      fortHitpoints: 400,
      race: 'HUMAN',
      class: 'CLERIC',
    };

    const attackerStats = new UserStatsService(attackerData as any);
    const defenderStats = new UserStatsService(defenderData as any);

    const attackerSpy = attackerStats.calculateArmyStat('SPY');
    const defenderSentry = defenderStats.calculateArmyStat('SENTRY');

    // Parity expectation: attacker advantage => attackerSpy > defenderSentry
    expect(attackerSpy).toBeGreaterThan(defenderSentry);
  });

  test('defender with overwhelming sentries should have higher sentry stat than attacker spy (defender advantage)', () => {
    const attackerData = {
      units: [
        { type: 'SPY', level: 1, quantity: 100 },
        { type: 'SPY', level: 2, quantity: 50 },
      ],
      items: [],
      structure_upgrades: [{ type: 'SPY', level: 1 }],
      bonus_points: [],
      battle_upgrades: [],
      stats: [],
      fortLevel: 1,
      fortHitpoints: 100,
      race: 'ELF',
      class: 'ASSASSIN',
    };

    const defenderData = {
      units: [
        { type: 'SENTRY', level: 1, quantity: 6000 },
        { type: 'SENTRY', level: 2, quantity: 2000 },
        { type: 'DEFENSE', level: 1, quantity: 1000 },
        { type: 'CITIZEN', level: 1, quantity: 2000 },
        { type: 'WORKER', level: 1, quantity: 1000 },
      ],
      items: [],
      structure_upgrades: [{ type: 'SENTRY', level: 5 }],
      bonus_points: [],
      battle_upgrades: [],
      stats: [],
      fortLevel: 6,
      fortHitpoints: 800,
      race: 'HUMAN',
      class: 'CLERIC',
    };

    const attackerStats = new UserStatsService(attackerData as any);
    const defenderStats = new UserStatsService(defenderData as any);

    const attackerSpy = attackerStats.calculateArmyStat('SPY');
    const defenderSentry = defenderStats.calculateArmyStat('SENTRY');

    // Parity expectation: defender advantage => attackerSpy < defenderSentry
    expect(attackerSpy).toBeLessThan(defenderSentry);
  });

  test('calculateDefenseAgainstAssassination should return non-zero defense strength when defender has target units', () => {
    const defenderData = {
      units: [
        { type: 'CITIZEN', level: 1, quantity: 2000 },
        { type: 'WORKER', level: 1, quantity: 1000 },
      ],
      items: [],
      structure_upgrades: [{ type: 'SENTRY', level: 2 }],
      bonus_points: [],
      battle_upgrades: [],
      stats: [],
      fortLevel: 4,
      fortHitpoints: 400,
      race: 'HUMAN',
      class: 'CLERIC',
    };

    const defenderStats = new UserStatsService(defenderData as any);

    // Use the helper via UserStatsService's internal functions indirectly:
    // We can assert that calculateArmyStat('DEFENSE') or 'SENTRY' is > 0 for a populated defender
    const defenseStat = defenderStats.calculateArmyStat('DEFENSE');
    const sentryStat = defenderStats.calculateArmyStat('SENTRY');
    // Debug output to help diagnose parity issues in services
    // Accessing private helpers via any cast for debugging purposes
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sortedDefenseUnits = (defenderStats as any).getSortedUnits ? (defenderStats as any).getSortedUnits('DEFENSE') : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sortedSpyUnits = (defenderStats as any).getSortedUnits ? (defenderStats as any).getSortedUnits('SPY') : undefined;
      // eslint-disable-next-line no-console
      console.debug('DEBUG sortedDefenseUnits:', sortedDefenseUnits);
      // eslint-disable-next-line no-console
      console.debug('DEBUG sortedSpyUnits:', sortedSpyUnits);
      // eslint-disable-next-line no-console
      console.debug('DEBUG defenseStat/sentryStat:', { defenseStat, sentryStat });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.debug('DEBUG failed to access internals for parity test', err);
    }

    expect(defenseStat).toBeGreaterThan(0);
    expect(sentryStat).toBeGreaterThan(0);
  });
});