import type { CohortMetricRecord } from './cohortMetrics';
import type { Persona } from './scenarioTypes';

export type BalanceGateKind =
  | 'personaViability'
  | 'lateJoinerCatchup'
  | 'cohortPresence'
  | 'crossSeedRequired'
  | 'dataNotTracked';

export interface BalanceGateFinding {
  readonly id: string;
  readonly passed: boolean;
  readonly message: string;
  readonly day: number;
  /**
   * `gate` findings pass/fail the run. `info` findings report a real
   * measurement that cannot pass/fail on its own (e.g. a single-seed
   * observation of a cross-seed gate).
   */
  readonly severity: 'gate' | 'info';
  readonly kind: BalanceGateKind;
}

export const VIABILITY_GATE_DAYS = [365, 730] as const;
export const LATE_JOINER_CATCHUP_DAYS = [365, 730] as const;
export const LATE_JOINER_CATCHUP_RATIO = 0.5;
export const VIABILITY_MIN_RATIO = 0.5;
export const VIABILITY_MAX_RATIO = 1.5;
export const REQUIRED_PERSONAS: readonly Persona[] = [
  'farmer',
  'attacker',
  'defender',
  'spy',
  'sentry',
  'balanced',
];

function medianOf(values: readonly number[]): number {
  if (values.length === 0)
    throw new Error('medianOf requires at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function groupByDay(
  records: readonly CohortMetricRecord[],
): Map<number, CohortMetricRecord[]> {
  const byDay = new Map<number, CohortMetricRecord[]>();
  for (const record of records) {
    const list = byDay.get(record.day) ?? [];
    list.push(record);
    byDay.set(record.day, list);
  }
  return byDay;
}

/**
 * Persona viability gate (gate #1, corrected). The reference is
 * `record.populationViabilityMedian` (the same-day per-player median stored
 * denormalized on every record by `collectCohortMetrics`); averaging cohort
 * medians is wrong because a 1-player cohort would weight the same as a
 * 25-player cohort. Persona cohorts split across cohortIds (primary +
 * lateJoiner-*) collapse into a single per-persona median-of-medians.
 */
function evaluatePersonaViabilityGate(
  records: readonly CohortMetricRecord[],
): BalanceGateFinding[] {
  const findings: BalanceGateFinding[] = [];
  const byDay = groupByDay(records);
  for (const day of VIABILITY_GATE_DAYS) {
    const dayRecords = byDay.get(day);
    if (!dayRecords || dayRecords.length === 0) continue;
    const populationMedian = dayRecords[0]?.populationViabilityMedian ?? 0;
    if (populationMedian <= 0) continue;
    const byPersona = new Map<Persona, number[]>();
    for (const record of dayRecords) {
      const list = byPersona.get(record.persona) ?? [];
      list.push(record.viability.median);
      byPersona.set(record.persona, list);
    }
    const personas = Array.from(byPersona.keys()).sort();
    for (const persona of personas) {
      const medians = byPersona.get(persona) ?? [];
      const cohortMedian = medianOf(medians);
      const ratio = cohortMedian / populationMedian;
      const passed =
        ratio >= VIABILITY_MIN_RATIO && ratio <= VIABILITY_MAX_RATIO;
      findings.push({
        id: `persona-viability-${day}-${persona}`,
        day,
        passed,
        severity: 'gate',
        kind: 'personaViability',
        message: `${persona} median viability is ${ratio.toFixed(3)}x population median at day ${day} (gate: ${VIABILITY_MIN_RATIO}x-${VIABILITY_MAX_RATIO}x).`,
      });
    }
  }
  return findings;
}

function evaluateCohortPresenceGate(
  records: readonly CohortMetricRecord[],
): BalanceGateFinding[] {
  const findings: BalanceGateFinding[] = [];
  const byDay = groupByDay(records);
  for (const day of VIABILITY_GATE_DAYS) {
    const dayRecords = byDay.get(day);
    if (!dayRecords || dayRecords.length === 0) continue;
    const primaryPersonas = new Set(
      dayRecords
        .filter((record) => record.cohortId === 'primary')
        .map((record) => record.persona),
    );
    const missing = REQUIRED_PERSONAS.filter(
      (persona) => !primaryPersonas.has(persona),
    );
    findings.push({
      id: `cohort-presence-${day}`,
      day,
      passed: missing.length === 0,
      severity: 'gate',
      kind: 'cohortPresence',
      message:
        missing.length === 0
          ? `All required personas present in primary cohort at day ${day}.`
          : `Primary cohort missing personas at day ${day}: ${missing.join(', ')}.`,
    });
  }
  return findings;
}

function evaluateLateJoinerCatchupGate(
  records: readonly CohortMetricRecord[],
): BalanceGateFinding[] {
  const findings: BalanceGateFinding[] = [];
  const byDay = groupByDay(records);
  for (const day of LATE_JOINER_CATCHUP_DAYS) {
    const dayRecords = byDay.get(day);
    if (!dayRecords || dayRecords.length === 0) continue;
    const primaryRecords = dayRecords.filter(
      (record) => record.cohortId === 'primary',
    );
    if (primaryRecords.length === 0) continue;
    const lateJoinerRecords = dayRecords.filter((record) =>
      record.cohortId.startsWith('lateJoiner-'),
    );
    if (lateJoinerRecords.length === 0) continue;
    const primaryByPersona = new Map<Persona, number>();
    for (const record of primaryRecords) {
      primaryByPersona.set(record.persona, record.viability.median);
    }
    const primaryMedians = primaryRecords.map((r) => r.viability.median);
    const overallPrimaryMedian = medianOf(primaryMedians);
    const lateJoinerPersonas = new Set(lateJoinerRecords.map((r) => r.persona));
    for (const persona of Array.from(lateJoinerPersonas).sort()) {
      const joinerRecords = lateJoinerRecords.filter(
        (record) => record.persona === persona,
      );
      const joinerMedians = joinerRecords.map((r) => r.viability.median);
      const joinerMedian = medianOf(joinerMedians);
      const reference = primaryByPersona.get(persona) ?? overallPrimaryMedian;
      if (reference <= 0) continue;
      const ratio = joinerMedian / reference;
      const passed = ratio >= LATE_JOINER_CATCHUP_RATIO;
      findings.push({
        id: `late-joiner-catchup-${day}-${persona}`,
        day,
        passed,
        severity: 'gate',
        kind: 'lateJoinerCatchup',
        message: `Late-joiner ${persona} viability is ${ratio.toFixed(3)}x primary ${persona} median at day ${day} (gate: >= ${LATE_JOINER_CATCHUP_RATIO}x).`,
      });
    }
  }
  return findings;
}

/**
 * Cross-seed gates cannot pass/fail from a single-seed report. `info`
 * findings use `passed=true` to mean "observation recorded successfully",
 * not "gate verdict". `hasBalanceFailures` ignores `info` findings.
 */
function evaluateCrossSeedInfoFindings(
  records: readonly CohortMetricRecord[],
): BalanceGateFinding[] {
  const findings: BalanceGateFinding[] = [];
  const byDay = groupByDay(records);
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);
  const evaluationDays = days.filter((day) =>
    (VIABILITY_GATE_DAYS as readonly number[]).includes(day),
  );
  for (const day of evaluationDays) {
    const dayRecords = byDay.get(day) ?? [];
    const totalPopulation = dayRecords.reduce(
      (sum, record) => sum + record.count,
      0,
    );
    findings.push({
      id: `cross-seed-top-quartile-${day}`,
      day,
      passed: true,
      severity: 'info',
      kind: 'crossSeedRequired',
      message: `Top power-quartile persona concentration gate requires multi-seed aggregation (>=80% of seeds). Single-seed population at day ${day}: ${totalPopulation} players; per-persona top-quartile share not aggregated cross-seed.`,
    });
  }
  if (evaluationDays.length > 0) {
    const lastDay = evaluationDays[evaluationDays.length - 1] ?? 0;
    findings.push({
      id: 'cross-seed-action-drought',
      day: lastDay,
      passed: true,
      severity: 'info',
      kind: 'dataNotTracked',
      message:
        'Action drought gate (p95 drought <=14 active / 30 passive days) requires per-player action-drought aggregation not yet exposed at cohort level. No synthetic data emitted.',
    });
    findings.push({
      id: 'cross-seed-recruiter-advantage',
      day: lastDay,
      passed: true,
      severity: 'info',
      kind: 'crossSeedRequired',
      message:
        'Recruiter advantage gate (<=1.5x at day 90) requires multi-seed aggregation comparing recruited vs non-recruited cohorts. Single-seed recruitment award events are recorded in cumulativeEvents.recruitmentAwardGold.',
    });
    findings.push({
      id: 'cross-seed-rebuild-time',
      day: lastDay,
      passed: true,
      severity: 'info',
      kind: 'dataNotTracked',
      message:
        'Median 90% rebuild time gate (<=30 active / 60 passive days) requires sustained-recovery-day aggregation not yet exposed at cohort level. Wipe/recovery event counts are recorded in cumulativeEvents.wipes/recoveries.',
    });
  }
  return findings;
}

export function evaluateBalanceGates(
  records: readonly CohortMetricRecord[],
): BalanceGateFinding[] {
  return [
    ...evaluatePersonaViabilityGate(records),
    ...evaluateCohortPresenceGate(records),
    ...evaluateLateJoinerCatchupGate(records),
    ...evaluateCrossSeedInfoFindings(records),
  ];
}

export function hasBalanceFailures(
  findings: readonly BalanceGateFinding[],
): boolean {
  return findings.some(
    (finding) => !finding.passed && finding.severity === 'gate',
  );
}
