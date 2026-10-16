import { describe, expect, it } from 'bun:test';

import { createRng } from '../random';
import {
  countActiveThreatCategories,
  decideFarmerPolicy,
  isWealthSurgeActive,
  updateAdaptiveAlert,
} from './farmerPolicy';
import type { SelfObservationOverrides } from './fixtures';
import {
  FIXTURE_WORKER_COST,
  makeObservation,
  makeQuietFarmerSelf,
  makeSelfObservation,
  makeTactical,
  makeTarget,
} from './fixtures';
import { decidePersonaPolicy } from './policy';
import type { PersonaTacticalState } from './types';

function runGreedy(selfOverrides: SelfObservationOverrides) {
  const self = makeSelfObservation({
    farmerVariant: 'greedy',
    ...selfOverrides,
  });
  return decideFarmerPolicy(
    makeObservation(self, []),
    makeTactical('farmer', 'greedy'),
    'greedy',
    createRng(1),
  );
}

function runAdaptive(selfOverrides: SelfObservationOverrides, alertLevel = 0) {
  const self = makeSelfObservation({
    farmerVariant: 'adaptive',
    ...selfOverrides,
  });
  return decideFarmerPolicy(
    makeObservation(self, []),
    makeTactical('farmer', 'adaptive', alertLevel),
    'adaptive',
    createRng(1),
  );
}

describe('farmer policy determinism', () => {
  it('same observation + tactical state + seed yields identical decisions', () => {
    const self = makeQuietFarmerSelf('greedy');
    const obs = makeObservation(self, []);
    const tactical = makeTactical('farmer', 'greedy');
    const a = decideFarmerPolicy(obs, tactical, 'greedy', createRng(1));
    const b = decideFarmerPolicy(obs, tactical, 'greedy', createRng(1));
    expect(b.decision).toEqual(a.decision);
    expect(b.nextTactical).toEqual(a.nextTactical);
  });

  it('farmer decisions are seed-independent (arithmetic only, no hidden rng draws)', () => {
    const self = makeQuietFarmerSelf('adaptive');
    const obs = makeObservation(self, []);
    const tactical = makeTactical('farmer', 'adaptive', 1);
    const a = decideFarmerPolicy(obs, tactical, 'adaptive', createRng(1));
    const b = decideFarmerPolicy(obs, tactical, 'adaptive', createRng(98765));
    expect(b.decision).toEqual(a.decision);
  });

  it('preserves farmer identity and variant in the next tactical state', () => {
    const result = runAdaptive({}, 2);
    expect(result.nextTactical.persona).toBe('farmer');
    expect(result.nextTactical.farmerVariant).toBe('adaptive');
  });

  it('ignores opponent hidden state entirely (no hidden-data effect)', () => {
    const self = makeQuietFarmerSelf('greedy');
    const emptyTargets = makeObservation(self, []);
    const richTargets = makeObservation(self, [
      makeTarget({
        targetId: 'rich-1',
        goldBand: 'opulent',
        powerBand: 'much-weaker',
        fortStatusBand: 'breached',
        observedLoot: 9_999_999,
        freshIntel: {
          fortIntegrityFraction: 0.1,
          observedDefenseBand: 'much-weaker',
          observedGoldBand: 'opulent',
        },
      }),
    ]);
    const tactical = makeTactical('farmer', 'greedy');
    const a = decidePersonaPolicy(
      emptyTargets,
      tactical,
      createRng(1),
    ).decision;
    const b = decidePersonaPolicy(richTargets, tactical, createRng(1)).decision;
    expect(b).toEqual(a);
  });
});

describe('greedy farmer', () => {
  it('applies a minimum worker floor when affordable in quiet harvest posture', () => {
    const result = runGreedy({
      gold: 12_000,
      goldInBank: 0,
      citizensAvailable: 500,
      bankExposure: 1,
      units: undefined,
    });
    expect(result.decision.stance).toBe('farmer-greedy-harvest');
    expect(result.decision.recruitment.worker ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('reacts to a fort breach by dropping the worker floor and shifting defensive', () => {
    const quiet = runGreedy({ fortBreachedLast7d: false });
    const breached = runGreedy({
      fortBreachedLast7d: true,
      fortBreachDaysAgo: 1,
      daysSinceLastThreat: 1,
      fortHp: 1000,
      fortMaxHp: 4000,
      repairCost: 45_000,
    });
    expect(quiet.decision.stance).toBe('farmer-greedy-harvest');
    expect(breached.decision.stance).toBe('farmer-greedy-reactive');
    const quietWorkers = quiet.decision.recruitment.worker ?? 0;
    const breachedWorkers = breached.decision.recruitment.worker ?? 0;
    expect(breachedWorkers).toBeLessThanOrEqual(quietWorkers);
  });

  it('reacts to a major worker loss', () => {
    const reactive = runGreedy({
      units: { worker: 1000 },
      workersLostLastDay: 400,
      daysSinceLastThreat: 0,
    });
    expect(reactive.decision.stance).toBe('farmer-greedy-reactive');
  });
});

describe('cautious farmer', () => {
  it('prioritizes defense/sentry/repair/banking over workers', () => {
    const self = makeSelfObservation({
      farmerVariant: 'cautious',
      gold: 4_000_000,
      fortHp: 1000,
      fortMaxHp: 4000,
      repairCost: 45_000,
      bankExposure: 0.8,
    });
    const cautious = decideFarmerPolicy(
      makeObservation(self, []),
      makeTactical('farmer', 'cautious'),
      'cautious',
      createRng(1),
    );
    expect(cautious.decision.stance).toBe('farmer-cautious-turtle');

    const greedy = runGreedy({
      gold: 4_000_000,
      fortHp: 1000,
      fortMaxHp: 4000,
      repairCost: 45_000,
      bankExposure: 0.8,
    });
    const cautiousWorkers = cautious.decision.recruitment.worker ?? 0;
    const greedyWorkers = greedy.decision.recruitment.worker ?? 0;
    expect(cautiousWorkers).toBeLessThan(greedyWorkers);
    expect(cautious.decision.bankGold).toBeGreaterThan(0);
  });
});

describe('adaptive farmer alert updates', () => {
  it('stays relaxed when quiet', () => {
    const self = makeQuietFarmerSelf('adaptive');
    const next = updateAdaptiveAlert(
      makeTactical('farmer', 'adaptive', 0),
      self,
    );
    expect(next).toBe(0);
  });

  it('raises after two attacks in 7d', () => {
    const self = makeSelfObservation({
      farmerVariant: 'adaptive',
      attacksSuffered7d: 2,
      daysSinceLastThreat: 1,
    });
    const next = updateAdaptiveAlert(
      makeTactical('farmer', 'adaptive', 0),
      self,
    );
    expect(next).toBeGreaterThanOrEqual(1);
  });

  it('raises after worker assassination', () => {
    const self = makeSelfObservation({
      farmerVariant: 'adaptive',
      workersAssassinated7d: 3,
      daysSinceLastThreat: 1,
    });
    expect(countActiveThreatCategories(self)).toBeGreaterThanOrEqual(1);
    const next = updateAdaptiveAlert(
      makeTactical('farmer', 'adaptive', 0),
      self,
    );
    expect(next).toBeGreaterThanOrEqual(1);
  });

  it('raises after a fort breach', () => {
    const self = makeSelfObservation({
      farmerVariant: 'adaptive',
      fortBreachedLast7d: true,
      daysSinceLastThreat: 1,
    });
    const next = updateAdaptiveAlert(
      makeTactical('farmer', 'adaptive', 0),
      self,
    );
    expect(next).toBeGreaterThanOrEqual(1);
  });

  it('raises after a 7d wealth (loot+income) surge beyond 20%', () => {
    const self = makeSelfObservation({
      farmerVariant: 'adaptive',
      income7d: 1_000_000,
      incomeLastDay: 10_000,
      loot7d: 900_000,
      lootGainedLastDay: 5_000,
    });
    expect(isWealthSurgeActive(self)).toBe(true);
    const next = updateAdaptiveAlert(
      makeTactical('farmer', 'adaptive', 0),
      self,
    );
    expect(next).toBeGreaterThanOrEqual(1);
  });

  it('scales the floor with concurrent threat categories (capped at 3)', () => {
    const self = makeSelfObservation({
      farmerVariant: 'adaptive',
      attacksSuffered7d: 3,
      workersAssassinated7d: 5,
      fortBreachedLast7d: true,
      income7d: 5_000_000,
      incomeLastDay: 1,
      loot7d: 5_000_000,
      lootGainedLastDay: 1,
      daysSinceLastThreat: 0,
    });
    expect(countActiveThreatCategories(self)).toBe(4);
    const next = updateAdaptiveAlert(
      makeTactical('farmer', 'adaptive', 0),
      self,
    );
    expect(next).toBe(3);
  });

  it('keeps the alert sticky when quiet for less than 30 days', () => {
    const self = makeQuietFarmerSelf('adaptive');
    expect(self.daysSinceLastThreat).toBeGreaterThanOrEqual(30);
    const shortQuiet = makeSelfObservation({
      farmerVariant: 'adaptive',
      daysSinceLastThreat: 10,
    });
    const raised: PersonaTacticalState = {
      persona: 'farmer',
      farmerVariant: 'adaptive',
      alertLevel: 2,
    };
    expect(updateAdaptiveAlert(raised, shortQuiet)).toBe(2);
  });

  it('relaxes one step after 30 quiet days', () => {
    const longQuiet = makeSelfObservation({
      farmerVariant: 'adaptive',
      daysSinceLastThreat: 35,
    });
    const raised: PersonaTacticalState = {
      persona: 'farmer',
      farmerVariant: 'adaptive',
      alertLevel: 1,
    };
    expect(updateAdaptiveAlert(raised, longQuiet)).toBe(0);
  });

  it('reflects alert level in stance through the full policy', () => {
    const relaxed = runAdaptive({}, 0);
    expect(relaxed.decision.stance).toBe('farmer-adaptive-relaxed');
    const raised = runAdaptive(
      {
        attacksSuffered7d: 3,
        workersAssassinated7d: 5,
        fortBreachedLast7d: true,
        daysSinceLastThreat: 0,
      },
      0,
    );
    expect(['farmer-adaptive-raised', 'farmer-adaptive-fortified']).toContain(
      raised.decision.stance,
    );
    expect(raised.nextTactical.alertLevel).toBeGreaterThan(0);
  });
});

describe('farmer policy weighs every required factor', () => {
  it('banks more when bank exposure is high', () => {
    const low = runGreedy({ bankExposure: 0.1, goldInBank: 9_000_000 });
    const high = runGreedy({ bankExposure: 0.95, goldInBank: 100_000 });
    expect(high.decision.bankGold).toBeGreaterThanOrEqual(
      low.decision.bankGold,
    );
  });

  it('repairs the fort when damaged and gold allows', () => {
    const result = runGreedy({
      fortHp: 500,
      fortMaxHp: 4000,
      repairCost: 60_000,
      gold: 4_000_000,
    });
    expect(result.decision.repairFort).toBe(true);
  });

  it('skips repair when gold is insufficient', () => {
    const result = runGreedy({
      fortHp: 500,
      fortMaxHp: 4000,
      repairCost: 60_000,
      gold: 10_000,
    });
    expect(result.decision.repairFort).toBe(false);
  });

  it('shifts from workers to defense under incoming attackers', () => {
    const quiet = runGreedy({ incomingAttackersLast7d: 0 });
    const pressured = runGreedy({
      incomingAttackersLast7d: 6,
      attacksSuffered7d: 4,
      daysSinceLastThreat: 0,
    });
    const quietDefense =
      (quiet.decision.recruitment.guard ?? 0) +
      (quiet.decision.recruitment.sentry ?? 0);
    const pressuredDefense =
      (pressured.decision.recruitment.guard ?? 0) +
      (pressured.decision.recruitment.sentry ?? 0);
    expect(pressuredDefense).toBeGreaterThanOrEqual(quietDefense);
    expect(pressured.decision.recruitment.worker ?? 0).toBeLessThanOrEqual(
      quiet.decision.recruitment.worker ?? 0,
    );
  });

  it('invests fewer workers when the remaining-tick horizon is short', () => {
    const long = runGreedy({ expectedRemainingTicks: 48 * 365 });
    const short = runGreedy({ expectedRemainingTicks: 1 });
    expect(short.decision.recruitment.worker ?? 0).toBeLessThanOrEqual(
      long.decision.recruitment.worker ?? 0,
    );
  });

  it('reacts to alliance threat with more defensive spending', () => {
    const calm = runGreedy({ allianceThreatLevel: 0 });
    const threatened = runGreedy({
      allianceThreatLevel: 0.9,
      daysSinceLastThreat: 0,
    });
    const calmDefense =
      (calm.decision.recruitment.guard ?? 0) +
      (calm.decision.recruitment.sentry ?? 0);
    const threatenedDefense =
      (threatened.decision.recruitment.guard ?? 0) +
      (threatened.decision.recruitment.sentry ?? 0);
    expect(threatenedDefense).toBeGreaterThanOrEqual(calmDefense);
  });

  it('trains defenders when coverage is low', () => {
    const covered = runGreedy({ coverageFraction: 1 });
    const exposed = runGreedy({ coverageFraction: 0.1 });
    const coveredDefense =
      (covered.decision.recruitment.guard ?? 0) +
      (covered.decision.recruitment.sentry ?? 0);
    const exposedDefense =
      (exposed.decision.recruitment.guard ?? 0) +
      (exposed.decision.recruitment.sentry ?? 0);
    expect(exposedDefense).toBeGreaterThanOrEqual(coveredDefense);
  });

  it('factors observed loot/income into worker profitability', () => {
    const barren = runGreedy({ loot7d: 0, income7d: 0 });
    const flush = runGreedy({ loot7d: 2_000_000, income7d: 2_000_000 });
    expect(flush.decision.recruitment.worker ?? 0).toBeGreaterThanOrEqual(
      barren.decision.recruitment.worker ?? 0,
    );
  });
});

describe('farmer policy guard clauses', () => {
  it('produces no recruitment when out of citizens', () => {
    const result = runGreedy({ citizensAvailable: 0 });
    expect(Object.keys(result.decision.recruitment)).toHaveLength(0);
  });

  it('produces no recruitment when out of gold', () => {
    const result = runGreedy({ gold: 0 });
    expect(Object.keys(result.decision.recruitment)).toHaveLength(0);
  });

  it('never returns negative recruitment, bank, or turns', () => {
    const result = runGreedy({
      gold: 500,
      fortHp: 10,
      fortMaxHp: 4000,
      repairCost: 1_000_000,
    });
    const r = result.decision.recruitment;
    for (const value of Object.values(r)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(result.decision.bankGold).toBeGreaterThanOrEqual(0);
    expect(result.decision.attackTurnsToSpend).toBe(0);
  });

  it('rejects a non-farmer tactical state', () => {
    const self = makeQuietFarmerSelf('greedy');
    expect(() =>
      decideFarmerPolicy(
        makeObservation(self, []),
        { persona: 'attacker', alertLevel: 0 },
        'greedy',
        createRng(1),
      ),
    ).toThrow();
  });
});

describe('worker cost fixture sanity', () => {
  it('uses the production worker cost of 2000', () => {
    expect(FIXTURE_WORKER_COST).toBe(2000);
  });
});
