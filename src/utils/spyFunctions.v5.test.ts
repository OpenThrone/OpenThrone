import { describe, expect, it } from 'bun:test';
import { normUnits } from 'test/utils/testFixtures';

import UserModel from '@/models/Users';
import type { UnitType } from '@/types/typings';
import MockUserGenerator from '@/utils/MockUserGenerator';
import {
  CITIZEN_WORKERS_TARGET,
  simulateAssassination,
  simulateInfiltration,
  simulateIntel,
} from '@/utils/spyFunctions';

const random = () => 0.5;

const createSpyUser = ({
  id,
  spy,
  sentry,
  fortHitpoints = 1000,
}: {
  id: number;
  spy: number;
  sentry: number;
  fortHitpoints?: number;
}) => {
  const generator = new MockUserGenerator();
  generator.getPrismaUser().id = id;
  generator.setBasicInfo({
    display_name: `SpyUser${id}`,
    race: id % 2 === 0 ? 'HUMAN' : 'ELF',
    class: 'ASSASSIN',
  });
  generator.clearUnits();
  generator.setSpyUpgrade(5);
  generator.setSentryUpgrade(5);
  generator.setFortLevel(5);
  generator.setFortHitpoints(fortHitpoints);
  generator.addUnits(
    normUnits([
      { type: 'SPY' as UnitType, level: 1, quantity: 1000, isMercenary: false },
      { type: 'SPY' as UnitType, level: 2, quantity: 1000, isMercenary: false },
      { type: 'SPY' as UnitType, level: 3, quantity: 1000, isMercenary: false },
      {
        type: 'SENTRY' as UnitType,
        level: 1,
        quantity: 1000,
        isMercenary: false,
      },
      {
        type: 'DEFENSE' as UnitType,
        level: 1,
        quantity: 1000,
        isMercenary: false,
      },
      {
        type: 'OFFENSE' as UnitType,
        level: 1,
        quantity: 1000,
        isMercenary: false,
      },
      {
        type: 'CITIZEN' as UnitType,
        level: 1,
        quantity: 3000,
        isMercenary: false,
      },
      {
        type: 'WORKER' as UnitType,
        level: 1,
        quantity: 2000,
        isMercenary: false,
      },
    ]),
  );

  const user = new UserModel(generator.getUser(), false, false);
  user.spy = spy;
  user.sentry = sentry;
  return user;
};

describe('v5 spy mission turn mechanics', () => {
  it('lets committed intel turns overcome a slight sentry advantage', () => {
    const attacker = createSpyUser({ id: 1, spy: 8000, sentry: 1000 });
    const defender = createSpyUser({ id: 2, spy: 1000, sentry: 10000 });

    const shallow = simulateIntel(attacker, defender, 5, {
      random,
      turns: 1,
      debug: false,
    });
    const committed = simulateIntel(attacker, defender, 5, {
      random,
      turns: 5,
      debug: false,
    });

    expect(shallow.success).toBe(false);
    expect(committed.success).toBe(true);
    expect(committed.turns).toBe(5);
  });

  it('makes repeated spy pressure protect the defender from shallow intel', () => {
    const attacker = createSpyUser({ id: 1, spy: 10000, sentry: 1000 });
    const defender = createSpyUser({ id: 2, spy: 1000, sentry: 9000 });

    const firstLook = simulateIntel(attacker, defender, 5, {
      random,
      turns: 1,
      debug: false,
      spyPressureToday: 0,
    });
    const pressuredLook = simulateIntel(attacker, defender, 5, {
      random,
      turns: 1,
      debug: false,
      spyPressureToday: 64,
    });

    expect(firstLook.success).toBe(true);
    expect(pressuredLook.success).toBe(false);
  });

  it('scales infiltration damage with committed turns without exceeding the v5 fort cap', () => {
    const shallowAttacker = createSpyUser({ id: 1, spy: 10000, sentry: 1000 });
    const shallowDefender = createSpyUser({
      id: 2,
      spy: 1000,
      sentry: 9000,
      fortHitpoints: 1000,
    });
    const deepAttacker = createSpyUser({ id: 3, spy: 10000, sentry: 1000 });
    const deepDefender = createSpyUser({
      id: 4,
      spy: 1000,
      sentry: 9000,
      fortHitpoints: 1000,
    });

    const shallow = simulateInfiltration(shallowAttacker, shallowDefender, 10, {
      random,
      turns: 2,
    });
    const deep = simulateInfiltration(deepAttacker, deepDefender, 10, {
      random,
      turns: 10,
    });

    expect(shallow.success).toBe(true);
    expect(deep.success).toBe(true);
    expect(deep.fortDmg).toBeGreaterThanOrEqual(shallow.fortDmg);
    expect(deep.fortDmg).toBeLessThanOrEqual(120);
    expect(deep.turns).toBe(10);
  });

  it('scales assassination impact with turns while keeping one mission below the population cap', () => {
    const shallowAttacker = createSpyUser({ id: 1, spy: 20000, sentry: 1000 });
    const shallowDefender = createSpyUser({ id: 2, spy: 1000, sentry: 9000 });
    const deepAttacker = createSpyUser({ id: 3, spy: 20000, sentry: 1000 });
    const deepDefender = createSpyUser({ id: 4, spy: 1000, sentry: 9000 });

    const shallow = simulateAssassination(
      shallowAttacker,
      shallowDefender,
      50,
      CITIZEN_WORKERS_TARGET,
      { random, turns: 3 },
    );
    const deep = simulateAssassination(
      deepAttacker,
      deepDefender,
      50,
      CITIZEN_WORKERS_TARGET,
      { random, turns: 10 },
    );

    expect(shallow.success).toBe(true);
    expect(deep.success).toBe(true);
    expect(deep.unitsKilled).toBeGreaterThanOrEqual(shallow.unitsKilled);
    expect(deep.unitsKilled).toBeLessThanOrEqual(200);
    expect(deep.turns).toBe(10);
  });
});
