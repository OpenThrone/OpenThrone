import { describe, it, expect } from 'bun:test';
import { normUnits } from 'test/utils/testFixtures';
const { UserUnitsService } = require('../UserUnitsService');

describe('UserUnitsService', () => {
  it('calculates unit totals and population correctly', () => {
    const units = normUnits([
      { id: 1, userId: 1, type: 'CITIZEN', level: 1, quantity: 100, isMercenary: false },
      { id: 2, userId: 1, type: 'WORKER', level: 1, quantity: 10, isMercenary: false },
      { id: 3, userId: 1, type: 'OFFENSE', level: 1, quantity: 5, isMercenary: false },
      { id: 4, userId: 1, type: 'SENTRY', level: 1, quantity: 2, isMercenary: true },
    ]);

    const svc = new UserUnitsService({ units: units.filter(u => !u.isMercenary), mercenaries: units.filter(u => u.isMercenary) });

    const totals = svc.getUnitTotals();
    expect(totals.citizens).toBe(100);
    expect(totals.workers).toBe(10);
    expect(svc.getArmySize()).toBe(5 + 2); // OFFENSE + mercenary SENTRY not citizen/worker
    expect(svc.getPopulation()).toBe(100 + 10 + 5 + 2);
    expect(svc.getCitizens()).toBe(100);
  });
});
