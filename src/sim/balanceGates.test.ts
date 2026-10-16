import { describe, expect, it } from 'bun:test';

import {
  evaluateBalanceGates,
  hasBalanceFailures,
  LATE_JOINER_CATCHUP_RATIO,
  REQUIRED_PERSONAS,
  VIABILITY_GATE_DAYS,
  VIABILITY_MAX_RATIO,
  VIABILITY_MIN_RATIO,
} from './balanceGates';
import type { CohortMetricRecord } from './cohortMetrics';
import type { Persona } from './scenarioTypes';

const ZERO_EVENTS = {
  wipes: 0,
  recoveries: 0,
  reactivations: 0,
  adaptations: 0,
  focusFireNominationsReceived: 0,
  recruitmentAwardEvents: 0,
  recruitmentAwardGold: 0,
  allianceAidEvents: 0,
  allianceAidGold: 0,
};

const summary = (value: number) => ({
  p05: value,
  median: value,
  p95: value,
});

function primaryDay(
  day: number,
  populationViabilityMedian: number,
  perPersona: Partial<Record<Persona, number>> = {},
): CohortMetricRecord[] {
  return REQUIRED_PERSONAS.map((persona) =>
    makeRecord({
      day,
      persona,
      viability: perPersona[persona] ?? 1,
      cohortId: 'primary',
      populationViabilityMedian,
    }),
  );
}

function makeRecord(input: {
  day: number;
  persona: Persona;
  viability: number;
  cohortId?: string;
  populationViabilityMedian?: number;
  activityClass?: string;
  count?: number;
}): CohortMetricRecord {
  const q = summary(input.viability);
  return {
    day: input.day,
    cohortId: input.cohortId ?? 'primary',
    persona: input.persona,
    activityClass: input.activityClass ?? 'active',
    count: input.count ?? 1,
    citizens: q,
    workers: q,
    handGold: q,
    bankGold: q,
    strategicPower: q,
    income: q,
    level: q,
    viability: q,
    fortLevel: q,
    fortHp: q,
    xp: q,
    attackTurns: q,
    stamina: q,
    military: q,
    spies: q,
    sentries: q,
    defensePressure: q,
    spyPressure: q,
    populationViabilityMedian: input.populationViabilityMedian ?? 1,
    cumulativeEvents: ZERO_EVENTS,
  };
}

describe('balance gates - persona viability (gate #1, corrected)', () => {
  it('uses the per-day population viability median as the reference', () => {
    const records = [
      makeRecord({
        day: 365,
        persona: 'farmer',
        viability: 1,
        populationViabilityMedian: 1,
      }),
      makeRecord({
        day: 365,
        persona: 'attacker',
        viability: 4,
        populationViabilityMedian: 1,
      }),
    ];
    const findings = evaluateBalanceGates(records);
    const farmerFinding = findings.find(
      (f) => f.id === 'persona-viability-365-farmer',
    );
    const attackerFinding = findings.find(
      (f) => f.id === 'persona-viability-365-attacker',
    );
    expect(farmerFinding?.passed).toBe(true);
    expect(attackerFinding?.passed).toBe(false);
    expect(attackerFinding?.severity).toBe('gate');
    expect(attackerFinding?.kind).toBe('personaViability');
    expect(hasBalanceFailures(findings)).toBe(true);
  });

  it('passes when persona viability is within [0.5x, 1.5x] of population median', () => {
    const records = primaryDay(365, 1, { farmer: 0.5, attacker: 1.5 });
    const findings = evaluateBalanceGates(records);
    const gates = findings.filter((f) => f.severity === 'gate');
    expect(gates.every((g) => g.passed)).toBe(true);
    expect(hasBalanceFailures(findings)).toBe(false);
  });

  it('evaluates the boundary ratios exactly at 0.5 and 1.5', () => {
    expect(VIABILITY_MIN_RATIO).toBe(0.5);
    expect(VIABILITY_MAX_RATIO).toBe(1.5);
    expect(VIABILITY_GATE_DAYS).toEqual([365, 730]);
  });

  it('emits no persona viability findings when the day is missing', () => {
    const records = [
      makeRecord({
        day: 100,
        persona: 'farmer',
        viability: 1,
        populationViabilityMedian: 1,
      }),
    ];
    const findings = evaluateBalanceGates(records);
    expect(
      findings.filter(
        (f) => f.kind === 'personaViability' && f.severity === 'gate',
      ),
    ).toEqual([]);
  });

  it('aggregates same-persona records across cohorts into a single finding', () => {
    const records = [
      makeRecord({
        day: 365,
        persona: 'farmer',
        viability: 1,
        cohortId: 'primary',
        populationViabilityMedian: 1,
      }),
      makeRecord({
        day: 365,
        persona: 'farmer',
        viability: 1,
        cohortId: 'lateJoiner-30',
        populationViabilityMedian: 1,
      }),
    ];
    const findings = evaluateBalanceGates(records);
    expect(
      findings.filter((f) => f.id === 'persona-viability-365-farmer'),
    ).toHaveLength(1);
  });
});

describe('balance gates - cohort presence', () => {
  it('flags missing required personas in the primary cohort', () => {
    const records = [
      makeRecord({
        day: 365,
        persona: 'farmer',
        viability: 1,
        cohortId: 'primary',
      }),
      makeRecord({
        day: 365,
        persona: 'attacker',
        viability: 1,
        cohortId: 'primary',
      }),
    ];
    const findings = evaluateBalanceGates(records);
    const presence = findings.find((f) => f.id === 'cohort-presence-365');
    expect(presence?.kind).toBe('cohortPresence');
    expect(presence?.passed).toBe(false);
    expect(presence?.message).toContain('defender');
    expect(presence?.message).toContain('spy');
    expect(presence?.message).toContain('sentry');
    expect(presence?.message).toContain('balanced');
  });

  it('passes when every required persona is present in primary', () => {
    const records: CohortMetricRecord[] = REQUIRED_PERSONAS.map((persona) =>
      makeRecord({ day: 365, persona, viability: 1 }),
    );
    const findings = evaluateBalanceGates(records);
    const presence = findings.find((f) => f.id === 'cohort-presence-365');
    expect(presence?.passed).toBe(true);
  });

  it('does not count lateJoiner cohorts toward primary presence', () => {
    const records = REQUIRED_PERSONAS.map((persona) =>
      makeRecord({
        day: 365,
        persona,
        viability: 1,
        cohortId: 'lateJoiner-365',
      }),
    );
    const findings = evaluateBalanceGates(records);
    const presence = findings.find((f) => f.id === 'cohort-presence-365');
    expect(presence?.passed).toBe(false);
  });
});

describe('balance gates - late joiner catch-up', () => {
  it('passes when late-joiner cohort reaches the catch-up threshold', () => {
    const records = [
      makeRecord({
        day: 730,
        persona: 'farmer',
        viability: 1,
        cohortId: 'primary',
        populationViabilityMedian: 1,
      }),
      makeRecord({
        day: 730,
        persona: 'farmer',
        viability: LATE_JOINER_CATCHUP_RATIO,
        cohortId: 'lateJoiner-365',
        populationViabilityMedian: 1,
      }),
    ];
    const findings = evaluateBalanceGates(records);
    const catchup = findings.find(
      (f) => f.id === 'late-joiner-catchup-730-farmer',
    );
    expect(catchup?.kind).toBe('lateJoinerCatchup');
    expect(catchup?.passed).toBe(true);
  });

  it('fails when late-joiner cohort is below the catch-up threshold', () => {
    const records = [
      makeRecord({
        day: 730,
        persona: 'farmer',
        viability: 1,
        cohortId: 'primary',
        populationViabilityMedian: 1,
      }),
      makeRecord({
        day: 730,
        persona: 'farmer',
        viability: 0.1,
        cohortId: 'lateJoiner-365',
        populationViabilityMedian: 1,
      }),
    ];
    const findings = evaluateBalanceGates(records);
    const catchup = findings.find(
      (f) => f.id === 'late-joiner-catchup-730-farmer',
    );
    expect(catchup?.passed).toBe(false);
    expect(hasBalanceFailures(findings)).toBe(true);
  });

  it('does not evaluate catch-up when no late-joiner cohort exists', () => {
    const records = [
      makeRecord({
        day: 730,
        persona: 'farmer',
        viability: 1,
        cohortId: 'primary',
        populationViabilityMedian: 1,
      }),
    ];
    const findings = evaluateBalanceGates(records);
    expect(findings.some((f) => f.kind === 'lateJoinerCatchup')).toBe(false);
  });
});

describe('balance gates - cross-seed informational findings', () => {
  it('emits informational findings for cross-seed and untracked gates', () => {
    const records = [...primaryDay(365, 1), ...primaryDay(730, 1)];
    const findings = evaluateBalanceGates(records);
    const infoFindings = findings.filter((f) => f.severity === 'info');
    const kinds = new Set(infoFindings.map((f) => f.kind));
    expect(kinds.has('crossSeedRequired')).toBe(true);
    expect(kinds.has('dataNotTracked')).toBe(true);
    for (const finding of infoFindings) {
      expect(finding.passed).toBe(true);
    }
    expect(hasBalanceFailures(findings)).toBe(false);
  });

  it('does not include info findings in failure aggregation', () => {
    const records = [
      makeRecord({
        day: 365,
        persona: 'farmer',
        viability: 99,
        populationViabilityMedian: 1,
      }),
    ];
    const findings = evaluateBalanceGates(records);
    expect(hasBalanceFailures(findings)).toBe(true);
    const failing = findings.filter((f) => !f.passed);
    expect(failing.every((f) => f.severity === 'gate')).toBe(true);
  });
});
