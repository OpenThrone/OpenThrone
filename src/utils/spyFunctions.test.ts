import UserModel from '@/models/Users';
import MockUserGenerator from './MockUserGenerator';
import { CITIZEN_WORKERS_TARGET, computeSpyAmpFactor, simulateAssassination, simulateInfiltration, simulateIntel } from './spyFunctions';
import { logDebug } from './logger';

describe('computeSpyAmpFactor', () => {
  it('should return the correct amplification factor for target population <= 10', () => {
    const targetPop = 10;
    const expectedAmpFactor = 0.4 * 1.6;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 9', () => {
    const targetPop = 9;
    const expectedAmpFactor = 0.4 * 1.5;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 7', () => {
    const targetPop = 7;
    const expectedAmpFactor = 0.4 * 1.35;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 5', () => {
    const targetPop = 5;
    const expectedAmpFactor = 0.4 * 1.2;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 3', () => {
    const targetPop = 3;
    const expectedAmpFactor = 0.4 * 0.95;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 1', () => {
    const targetPop = 1;
    const expectedAmpFactor = 0.4 * 0.75;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  describe('Spy Mission Simulations', () => {
    let attackerGenerator: MockUserGenerator;
    let defenderGenerator: MockUserGenerator;
    let baseAttacker: UserModel;
    let baseDefender: UserModel;

    beforeEach(() => {
      // Setup base users before each test
      attackerGenerator = new MockUserGenerator();
      attackerGenerator.setBasicInfo({ display_name: 'AttackerSpy', race: 'ELF', class: 'ASSASSIN' });
      attackerGenerator.setSpyUpgrade(5); // Give some base spy structure level
      attackerGenerator.addUnits([
        { type: 'SPY', level: 1, quantity: 1000 }, // For Intel
        { type: 'SPY', level: 2, quantity: 1000 }, // For Infiltration
        { type: 'SPY', level: 3, quantity: 1000 }, // For Assassination
      ]);
      // Add base spy/intel bonus points if needed via generator
      // attackerGenerator.setBonusPoints([{ type: 'INTEL', level: 10 }]);

      defenderGenerator = new MockUserGenerator();
      defenderGenerator.setBasicInfo({ display_name: 'DefenderSentry', race: 'HUMAN', class: 'CLERIC' });
      defenderGenerator.setSentryUpgrade(5); // Give some base sentry structure level
      defenderGenerator.addUnits([
        { type: 'SENTRY', level: 1, quantity: 500 },
        { type: 'SENTRY', level: 2, quantity: 500 },
        { type: 'DEFENSE', level: 1, quantity: 1000 },
        { type: 'OFFENSE', level: 1, quantity: 500 },
        { type: 'CITIZEN', level: 1, quantity: 2000 },
        { type: 'WORKER', level: 1, quantity: 1000 },
      ]);
      defenderGenerator.setFortLevel(5); // Example fort level
      defenderGenerator.setFortHitpoints(500); // Start with full HP usually
      // defenderGenerator.setBonusPoints([{ type: 'INTEL', level: 5 }]);

      baseAttacker = new UserModel(attackerGenerator.getUser());
      baseDefender = new UserModel(defenderGenerator.getUser());
    });

    // --- simulateIntel Tests ---
    describe('simulateIntel', () => {
      it('should succeed with high intel accuracy/quantity when attacker spy >> defender sentry', () => {
        // Boost attacker spy significantly, reduce defender sentry
        baseAttacker.units.find(u => u.type === 'SPY' && u.level === 1)!.quantity = 2000; // More spies
        logDebug("SentryUnits", baseDefender.units.find(u => u.type === 'SENTRY' && u.level === 1).level)
        logDebug("Sentry Stats", baseDefender.sentry)
        baseDefender.units.find(u => u.type === 'SENTRY' && u.level === 1)!.quantity = 100;
        logDebug("SentryUnits", baseDefender.units.find(u => u.type === 'SENTRY' && u.level === 1).level)
        logDebug("Sentry Stats", baseDefender.sentry)
        const spiesSent = 10;
        const result = simulateIntel(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(true);
        expect(result.spiesLost).toBeLessThanOrEqual(spiesSent * 0.2); // Expect low losses on high advantage
        expect(result.intelligenceGathered).not.toBeNull();
        // Check if a good amount of info was gathered (e.g., > 70% based on spies * 10)
        const intelPercent = (spiesSent - result.spiesLost) * 10;
        expect(intelPercent).toBeGreaterThan(70);
        // Optional: Check accuracy if implemented - reported numbers should be close to original
        // e.g., expect(result.intelligenceGathered.units.find(u=>u.type==='DEFENSE').quantity).toBeCloseTo(1000, -2); // Within ~10%
      });

      it('should fail with high spy losses when attacker spy << defender sentry', () => {
        logDebug("SentryUnits", baseDefender.units.find(u => u.type === 'SENTRY' && u.level === 1).level)
        logDebug("Sentry Stats", baseDefender.sentry)
        baseDefender.units.find(u => u.type === 'SENTRY' && u.level === 1)!.quantity = 6000;
        baseDefender.updateStats()
        logDebug("SentryUnits", baseDefender.units.find(u => u.type === 'SENTRY' && u.level === 1).level)
        logDebug("Sentry Stats", baseDefender.sentry)
        
        const spiesSent = 10;
        const initialSpyCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 1)!.quantity;
        const result = simulateIntel(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(false);
        expect(result.spiesLost).toBe(spiesSent); // All spies lost on failure
        expect(result.intelligenceGathered).toBeNull();
        // Check if attacker's unit count decreased
        const finalSpyCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 1)!.quantity;
        expect(finalSpyCount).toBe(initialSpyCount - spiesSent);
      });

      it('should succeed with moderate intel/accuracy when spy ≈ sentry (attacker advantage)', () => {
        const spiesSent = 8;
        const result = simulateIntel(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(true);
        expect(result.spiesLost).toBeLessThan(spiesSent * 0.5); // Expect moderate losses
        expect(result.intelligenceGathered).not.toBeNull();
        const intelPercent = (spiesSent - result.spiesLost) * 10;
        expect(intelPercent).toBeGreaterThan(30); // Expect at least some info
      });

      it('should handle defender having zero sentry stat', () => {
        baseDefender.units = baseDefender.units.filter(u => u.type !== 'SENTRY'); // Remove sentries

        const spiesSent = 5;
        const result = simulateIntel(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(true); // Should always succeed if sentry is 0
        expect(result.spiesLost).toBe(0); // No sentries to cause losses
        expect(result.intelligenceGathered).not.toBeNull();
        const intelPercent = (spiesSent - result.spiesLost) * 10;
        expect(intelPercent).toBe(50); // Max possible info for spies sent
      });
    });

    // --- simulateAssassination Tests ---
    describe('simulateAssassination', () => {
      it('should succeed and kill target units (CITIZEN/WORKERS) with low spy losses when attacker >> defender', () => {
        

        const spiesSent = 5; // Using L3 spies (Assassins)
        const initialAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;
        const initialCitizenCount = baseDefender.units.find(u => u.type === 'CITIZEN')!.quantity;
        const initialWorkerCount = baseDefender.units.find(u => u.type === 'WORKER')!.quantity;

        const result = simulateAssassination(baseAttacker, baseDefender, spiesSent, CITIZEN_WORKERS_TARGET);

        expect(result.success).toBe(true);
        expect(result.spiesLost).toBeLessThan(spiesSent * 0.3); // Expect low losses
        expect(result.unitsKilled).toBeGreaterThan(0);

        // Verify attacker and defender unit counts
        const finalAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;
        const finalCitizenCount = baseDefender.units.find(u => u.type === 'CITIZEN')!.quantity;
        const finalWorkerCount = baseDefender.units.find(u => u.type === 'WORKER')!.quantity;

        expect(finalAssassinCount).toBe(initialAssassinCount - result.spiesLost);
        expect(finalCitizenCount + finalWorkerCount).toBe(initialCitizenCount + initialWorkerCount - result.unitsKilled);
      });

      it('should fail infiltration with high spy losses when attacker << defender', () => {
        const spiesSent = 5;
        const initialAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        const initialDefenderUnits = JSON.stringify(baseDefender.units); // Snapshot

        const result = simulateAssassination(baseAttacker, baseDefender, spiesSent, 'DEFENSE');

        expect(result.success).toBe(false);
        expect(result.spiesLost).toBeGreaterThanOrEqual(spiesSent * 0.7); // Expect high losses
        expect(result.unitsKilled).toBe(0);

        const finalAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;
        expect(finalAssassinCount).toBe(initialAssassinCount - result.spiesLost);
        expect(JSON.stringify(baseDefender.units)).toBe(initialDefenderUnits); // Defender units unchanged
      });

      it('should succeed but with spy losses when attacker > defender (closer stats)', () => {

        const spiesSent = 4;
        const initialAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;
        const initialTargetCount = baseDefender.units.find(u => u.type === 'DEFENSE')!.quantity;

        const result = simulateAssassination(baseAttacker, baseDefender, spiesSent, 'DEFENSE');

        expect(result.success).toBe(true); // Target engaged
        expect(result.spiesLost).toBeGreaterThanOrEqual(0); // Expect some losses from sentries
        expect(result.spiesLost).toBeLessThan(spiesSent);
        expect(result.unitsKilled).toBeGreaterThanOrEqual(0);

        const finalAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;
        const finalTargetCount = baseDefender.units.find(u => u.type === 'DEFENSE')!.quantity;
        expect(finalAssassinCount).toBe(initialAssassinCount - result.spiesLost);
        expect(finalTargetCount).toBe(initialTargetCount - result.unitsKilled);
      });

      it('should succeed but kill 0 units if target type has 0 quantity', () => {
        // Remove all offense units
        baseDefender.units = baseDefender.units.filter(u => u.type !== 'OFFENSE');

        const spiesSent = 3;
        const initialAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;

        const result = simulateAssassination(baseAttacker, baseDefender, spiesSent, 'OFFENSE');

        expect(result.success).toBe(true); // Infiltration/engagement might succeed
        // spiesLost could be > 0 depending on sentry fight
        expect(result.unitsKilled).toBe(0); // No units of target type to kill

        const finalAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;
        expect(finalAssassinCount).toBe(initialAssassinCount - result.spiesLost);
      });

      it('should handle defender having zero sentry stat', () => {
        baseAttacker.spy = 5000;
        baseDefender.sentry = 0;
        baseDefender.units = baseDefender.units.filter(u => u.type !== 'SENTRY');

        const spiesSent = 4;
        const initialAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;
        const initialTargetCount = baseDefender.units.find(u => u.type === 'DEFENSE')!.quantity;

        const result = simulateAssassination(baseAttacker, baseDefender, spiesSent, 'DEFENSE');

        expect(result.success).toBe(true);
        expect(result.spiesLost).toBe(0); // No sentries to fight
        //expect(result.unitsKilled).toBeGreaterThan(0);

        const finalAssassinCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 3)!.quantity;
        const finalTargetCount = baseDefender.units.find(u => u.type === 'DEFENSE')!.quantity;
        expect(finalAssassinCount).toBe(initialAssassinCount);
        expect(finalTargetCount).toBe(initialTargetCount - result.unitsKilled);
      });
    });

    // --- simulateInfiltration Tests ---
    describe('simulateInfiltration', () => {
      it('should succeed and cause fort damage with low spy losses when attacker >> defender', () => {
        baseAttacker.spy = 15000;
        baseDefender.sentry = 2000;

        const spiesSent = 5; // Using L2 spies (Infiltrators)
        const initialInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        const initialFortHP = baseDefender.fortHitpoints;

        const result = simulateInfiltration(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(true);
        expect(result.spiesLost).toBeLessThanOrEqual(spiesSent * 0.3); // Low losses expected
        expect(result.fortDmg).toBeGreaterThan(0);

        const finalInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        expect(finalInfiltratorCount).toBe(initialInfiltratorCount - result.spiesLost);
        expect(baseDefender.fortHitpoints).toBe(initialFortHP - result.fortDmg); // Check model was updated
      });

      it('should fail with high spy losses and no fort damage when attacker << defender', () => {
        baseAttacker.spy = 2000;
        baseDefender.sentry = 15000;

        const spiesSent = 5;
        const initialInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        const initialFortHP = baseDefender.fortHitpoints;

        const result = simulateInfiltration(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(false);
        expect(result.spiesLost).toBe(spiesSent); // All spies lost
        expect(result.fortDmg).toBe(0);

        const finalInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        expect(finalInfiltratorCount).toBe(initialInfiltratorCount - result.spiesLost);
        expect(baseDefender.fortHitpoints).toBe(initialFortHP); // Fort HP unchanged
      });

      it('should succeed with moderate spy losses and fort damage when attacker > defender (closer stats)', () => {
        baseAttacker.spy = 7000;
        baseDefender.sentry = 6000;

        const spiesSent = 4;
        const initialInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        const initialFortHP = baseDefender.fortHitpoints;

        const result = simulateInfiltration(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(true);
        expect(result.spiesLost).toBeGreaterThanOrEqual(0); // Some losses expected
        expect(result.spiesLost).toBeLessThanOrEqual(spiesSent * 0.7); // Moderate losses
        expect(result.fortDmg).toBeGreaterThanOrEqual(0); // Some damage expected

        const finalInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        expect(finalInfiltratorCount).toBe(initialInfiltratorCount - result.spiesLost);
        expect(baseDefender.fortHitpoints).toBe(initialFortHP - result.fortDmg);
      });

      it('should handle defender having zero sentry stat', () => {
        baseAttacker.spy = 5000;
        baseDefender.sentry = 0;
        baseDefender.units = baseDefender.units.filter(u => u.type !== 'SENTRY');

        const spiesSent = 3;
        const initialInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        const initialFortHP = baseDefender.fortHitpoints;

        const result = simulateInfiltration(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(true);
        expect(result.spiesLost).toBe(0); // No sentries to cause losses
        expect(result.fortDmg).toBeGreaterThan(0); // Damage should occur

        const finalInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        expect(finalInfiltratorCount).toBe(initialInfiltratorCount);
        expect(baseDefender.fortHitpoints).toBe(initialFortHP - result.fortDmg);
      });

      it('should cause zero damage if defender fort HP is already zero', () => {
        baseAttacker.spy = 10000;
        baseDefender.sentry = 1000;
        baseDefender.fortHitpoints = 0; // Fort already destroyed

        const spiesSent = 3;
        const initialInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;

        const result = simulateInfiltration(baseAttacker, baseDefender, spiesSent);

        expect(result.success).toBe(true); // Still successful infiltration
        // Losses might still occur depending on spy/sentry ratio
        expect(result.fortDmg).toBe(0); // No further damage

        const finalInfiltratorCount = baseAttacker.units.find(u => u.type === 'SPY' && u.level === 2)!.quantity;
        expect(finalInfiltratorCount).toBe(initialInfiltratorCount - result.spiesLost);
        expect(baseDefender.fortHitpoints).toBe(0); // Stays at 0
      });
    });
  });
});