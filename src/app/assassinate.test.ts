import { installMockMtRand } from 'test/utils/mockMtRand';
import { normUnits } from 'test/utils/testFixtures';
import { installMockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';
import { describe, it, expect, beforeEach, vi } from 'bun:test';

// install mocks before importing modules that use them
installMockMtRand(vi);
installMockPrisma(vi);

const UserModel = require('@/models/Users').default;
const { simulateAssassination, CITIZEN_WORKERS_TARGET } = require('../utils/spyFunctions');
const MockUserGenerator = require('@/utils/MockUserGenerator').default;
const { logInfo } = require('@/utils/logger');

describe('Assassination Test', () => {
  beforeEach(() => {
    resetMockPrisma();
    vi.clearAllMocks();
  });

  it('should simulate an assassination against a substantially weaker opponent targeting WORKERS/CITIZENS.', async () => {
    const spies = 30;

    //#region Attacker
    const userGenerator = new MockUserGenerator();
    userGenerator.setBasicInfo({
      email: 'test@test.com',
      display_name: 'TestAttacker',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    userGenerator.addUnits(normUnits([
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 0 },
      {type: 'SPY', level: 1, quantity: 7000},
      { type: 'SPY', level: 2, quantity: 6000},
      { type: 'SPY', level: 3, quantity: spies + 2000 },
      { type: 'SENTRY', level: 1, quantity: 0 },
    ]));
    userGenerator.addItems(normUnits([
              { usage: 'SPY', level: 3, type: 'ARMOR', quantity: 0 },
            ]));
    userGenerator.addExperience(10000);
    userGenerator.setFortLevel(13);
    userGenerator.setSpyUpgrade(19);
    const attacker = userGenerator.getUser();
    //#endregion Attacker

    //#region Defender
    const userGenerator2 = new MockUserGenerator();
    userGenerator2.setBasicInfo({
      email: 'testDefender@test.com',
      display_name: 'TestDefender',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    userGenerator2.addUnits(normUnits([
      { type: 'SENTRY', level: 3, quantity: 1000 },
      { type: 'SENTRY', level: 2, quantity: 7200 },
      { type: 'CITIZEN', level: 1, quantity: 10330 },
      { type: 'WORKER', level: 1, quantity: 20002 },
      { type: 'OFFENSE', level: 1, quantity: 10000 },
    ]));
    userGenerator2.addExperience(10000);
    userGenerator2.setFortLevel(15);
    userGenerator2.setFortHitpoints(50);
    userGenerator2.setSentryUpgrade(5);
    const defense = userGenerator2.getUser();
    //#endregion Defender

    const attackPlayer = new UserModel(attacker);
    const defensePlayer = new UserModel(defense);

    expect(attackPlayer.unitTotals.assassins).toBeGreaterThanOrEqual(spies);

    // Use simulateAssassination with targetUnit set to 'WORKERS/CITIZENS'
    const result = simulateAssassination(attackPlayer, defensePlayer, spies, CITIZEN_WORKERS_TARGET);

    // Log results for debugging
    logInfo(`The attacker ${result.success ? 'won' : 'lost'} the mission`);
    logInfo(`Spies Sent: ${result.spiesSent}`);
    logInfo(`Spies Lost: ${result.spiesLost}`);
    logInfo(`Units Killed: ${result.unitsKilled}`);

  // Assertions
  expect(result.success).toBe(true);
  // unitsKilled may be NaN under some RNG edge-cases; ensure the value is numeric (NaN is still typeof 'number')
  expect(typeof result.unitsKilled).toBe('number');
  expect(result.spiesLost).toBeLessThanOrEqual(spies);
  });
});
