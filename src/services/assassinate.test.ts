import UserModel from "@/models/Users";
import { simulateAssassination } from "../utils/spyFunctions";
import MockUserGenerator from "@/utils/MockUserGenerator";
import { logInfo } from "@/utils/logger";

describe('Assassination Test', () => {
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
    userGenerator.addUnits([
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 0 },
      {type: 'SPY', level: 1, quantity: 7000},
      { type: 'SPY', level: 2, quantity: 6000},
      { type: 'SPY', level: 3, quantity: spies + 2000 },
      { type: 'SENTRY', level: 1, quantity: 0 },
    ]);
    userGenerator.addItems([
      { usage: 'SPY', level: 3, type: 'ARMOR', quantity: 0 },
    ]);
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
    userGenerator2.addUnits([
      { type: 'SENTRY', level: 3, quantity: 1000 },
      { type: 'SENTRY', level: 2, quantity: 7200 },
      { type: 'CITIZEN', level: 1, quantity: 10330 },
      { type: 'WORKER', level: 1, quantity: 20002 },
      { type: 'OFFENSE', level: 1, quantity: 10000 },
    ]);
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
    const result = simulateAssassination(attackPlayer, defensePlayer, spies, 'OFFENSE');

    // Log results for debugging
    logInfo(`The attacker ${result.success ? 'won' : 'lost'} the mission`);
    logInfo(`Spies Sent: ${result.spiesSent}`);
    logInfo(`Spies Lost: ${result.spiesLost}`);
    logInfo(`Units Killed: ${result.unitsKilled}`);

    // Assertions
    expect(result.success).toBe(true);
    expect(result.unitsKilled).toBeGreaterThan(0);
    expect(result.spiesLost).toBeLessThanOrEqual(spies);
  });
});
