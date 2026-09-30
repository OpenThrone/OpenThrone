import { describe, expect, it } from 'bun:test';

import { evaluateBalanceGates } from './balanceGates';
import type { CohortMetricRecord } from './cohortMetrics';
import {
  ERA_REPORT_REQUIRED_HEADINGS,
  eraArtifactsToJson,
  eraMetricsToCsv,
  eraReportToMarkdown,
} from './eraExport';
import type { EraSimulationRunState } from './eraIntegration';

const summary = (value: number) => ({
  p05: value,
  median: value,
  p95: value,
});

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

function record(
  overrides: Partial<Omit<CohortMetricRecord, 'viability'>> & {
    viability?: number | CohortMetricRecord['viability'];
  },
): CohortMetricRecord {
  const q = summary(1);
  const { viability, ...rest } = overrides;
  const viabilitySummary =
    viability == null
      ? q
      : typeof viability === 'number'
        ? summary(viability)
        : viability;
  return {
    day: 1,
    cohortId: 'primary',
    persona: 'farmer',
    activityClass: 'active',
    count: 1,
    citizens: q,
    workers: q,
    handGold: q,
    bankGold: q,
    strategicPower: q,
    income: q,
    level: q,
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
    populationViabilityMedian: 1,
    cumulativeEvents: ZERO_EVENTS,
    viability: viabilitySummary,
    ...rest,
  };
}

function makeStateStub(): Pick<
  EraSimulationRunState,
  'base' | 'scenario' | 'config'
> {
  return {
    base: {
      day: 730,
      totalDays: 730,
      history: [],
      metrics: {
        dailyResults: [],
        attackerWinRateOverTime: [],
        defenderWinRateOverTime: [],
        intelSuccessRateOverTime: [],
        intelToAttackConversionRate: [],
        totalGoldInEconomy: [],
        wealthGiniCoefficient: [],
        levelDistributionOverTime: [],
        avgUnitsPerPlayer: [],
        powerCreepIndex: [],
        avgTurnsPerAttack: [],
        attacksPerActivePlayer: [],
        lowTurnVsHighTurnRatio: [],
        activePlayersPerDay: [],
        defeatedPlayersPerDay: [],
        breachedPlayersPerDay: [],
        attackTurnsHeldPerDay: [],
      },
      config: {},
      players: new Map([['stub', { id: 'stub' } as object]]),
    } as object,
    scenario: {
      manifest: {
        id: 'era-export-stub',
        rulesetId: 'production',
        seed: 42,
        totalDays: 730,
        primaryCohort: {
          activeCount: 0,
          passiveCount: 0,
          personaMix: { active: {}, passive: {} },
          farmerVariantMix: { active: {}, passive: {} },
        },
        recruitment: {
          rewardsPerDay: 0,
          band: 0,
          recipientMode: 'self',
          selectionShare: 0,
        },
        allianceMode: 'none',
        lateJoinerDays: [],
      },
      playerMeta: new Map(),
      allianceMeta: new Map(),
      dailyCasualtyCapUsage: new Map(),
      rebuildShields: new Map(),
      checkpoints: [{ day: 730, cohortSnapshots: [] }],
      events: [],
      cumulative: {
        totalRewardEvents: 0,
        totalRewardGold: 0,
        totalRewardCitizens: 0,
        totalAllianceAid: 0,
        totalLootAwarded: 0,
        totalWipes: 0,
        totalReactivations: 0,
      },
    } as object,
    config: { seed: 42, rulesetId: 'production' },
  } as unknown as Pick<EraSimulationRunState, 'base' | 'scenario' | 'config'>;
}

describe('ERA export - CSV', () => {
  it('emits a stable CSV header and equal column counts across rows', () => {
    const csv = eraMetricsToCsv([record({})]);
    const rows = csv.split('\n').map((row) => row.split(','));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(rows[1].length);
    expect(rows[0]![0]).toBe('day');
  });

  it('every data row has the same column count as the header for mixed records', () => {
    const records = [
      record({ day: 1, cohortId: 'primary', persona: 'farmer' }),
      record({
        day: 730,
        cohortId: 'lateJoiner-365',
        persona: 'balanced',
        farmerVariant: undefined,
        allianceIds: ['alpha', 'beta'],
        joinedOnDayRange: [365, 365],
        count: 3,
      }),
    ];
    const csv = eraMetricsToCsv(records);
    const rows = csv.split('\n').map((row) => row.split(','));
    expect(rows).toHaveLength(3);
    const headerCols = rows[0]!.length;
    expect(rows.every((row) => row.length === headerCols)).toBe(true);
  });

  it('sorts rows by day, then cohortId, then persona, then activity', () => {
    const records = [
      record({
        day: 730,
        cohortId: 'primary',
        persona: 'spy',
        activityClass: 'active',
      }),
      record({
        day: 1,
        cohortId: 'primary',
        persona: 'farmer',
        activityClass: 'active',
      }),
      record({
        day: 30,
        cohortId: 'lateJoiner-30',
        persona: 'balanced',
        activityClass: 'active',
      }),
    ];
    const csv = eraMetricsToCsv(records);
    const rows = csv
      .split('\n')
      .slice(1)
      .map((row) => row.split(','));
    expect(rows[0]![1]).toBe('primary');
    expect(rows[0]![2]).toBe('farmer');
    expect(rows[1]![1]).toBe('lateJoiner-30');
    expect(rows[2]![1]).toBe('primary');
    expect(rows[2]![2]).toBe('spy');
  });

  it('serializes joinedOnDayRange and allianceIds columns deterministically', () => {
    const csv = eraMetricsToCsv([
      record({
        day: 365,
        allianceIds: ['alpha', 'beta'],
        joinedOnDayRange: [30, 30],
      }),
    ]);
    const dataRow = csv.split('\n')[1]!.split(',');
    const allianceIdx = csv.split('\n')[0]!.split(',').indexOf('allianceIds');
    const joinedMinIdx = csv
      .split('\n')[0]!
      .split(',')
      .indexOf('joinedOnDayMin');
    expect(dataRow[allianceIdx]).toBe('alpha|beta');
    expect(dataRow[joinedMinIdx]).toBe('30');
  });
});

describe('ERA export - Markdown', () => {
  it('includes every required heading in declaration order', () => {
    const stub = makeStateStub();
    const markdown = eraReportToMarkdown({
      state: stub as EraSimulationRunState,
      records: [record({ day: 365 })],
      findings: evaluateBalanceGates([record({ day: 365 })]),
    });
    const lines = markdown.split('\n');
    let lastFound = -1;
    for (const heading of ERA_REPORT_REQUIRED_HEADINGS) {
      const idx = lines.indexOf(heading);
      expect(idx, `heading "${heading}" must appear in report`).toBeGreaterThan(
        -1,
      );
      expect(
        idx,
        `heading "${heading}" must respect declaration order`,
      ).toBeGreaterThan(lastFound);
      lastFound = idx;
    }
  });

  it('renders late-joiner section content when late joiner records exist', () => {
    const stub = makeStateStub();
    const records = [
      record({ day: 730, cohortId: 'primary', persona: 'farmer' }),
      record({
        day: 730,
        cohortId: 'lateJoiner-365',
        persona: 'balanced',
        joinedOnDayRange: [365, 365],
      }),
    ];
    const markdown = eraReportToMarkdown({
      state: stub as EraSimulationRunState,
      records,
      findings: [],
    });
    expect(markdown).toContain('lateJoiner-365');
    expect(markdown).toContain('Catch-up ratio');
  });

  it('renders farmer focus table when farmer records exist', () => {
    const stub = makeStateStub();
    const records = [
      record({
        day: 365,
        persona: 'farmer',
        farmerVariant: 'greedy',
        cohortId: 'primary',
      }),
    ];
    const markdown = eraReportToMarkdown({
      state: stub as EraSimulationRunState,
      records,
      findings: [],
    });
    expect(markdown).toContain('## Farmer focus');
    expect(markdown).toContain('greedy');
  });

  it('renders gate failures as FAIL lines and info findings as INFO lines', () => {
    const stub = makeStateStub();
    const failing = record({
      day: 365,
      persona: 'attacker',
      viability: 99,
      populationViabilityMedian: 1,
    });
    const markdown = eraReportToMarkdown({
      state: stub as EraSimulationRunState,
      records: [failing],
      findings: evaluateBalanceGates([failing]),
    });
    expect(markdown).toContain('- FAIL');
    expect(markdown).toContain('- INFO');
  });

  it('does not present an uncalibrated report as a passing gate result', () => {
    const stub = makeStateStub();
    const markdown = eraReportToMarkdown({
      state: stub as EraSimulationRunState,
      records: [record({})],
      findings: [
        {
          id: 'uncalibrated-era-model',
          day: 730,
          passed: true,
          severity: 'info',
          kind: 'dataNotTracked',
          message: 'Balance gates are suppressed.',
        },
      ],
    });

    expect(markdown).toContain('No balance gates were evaluated');
    expect(markdown).not.toContain('All evaluated gate findings passed');
  });
});

describe('ERA export - JSON', () => {
  it('emits parseable JSON with schemaVersion 2 and required top-level keys', () => {
    const stub = makeStateStub();
    const json = eraArtifactsToJson({
      state: stub as EraSimulationRunState,
      records: [record({})],
      findings: [],
    });
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.manifest.id).toBe('era-export-stub');
    expect(parsed.day).toBe(730);
    expect(Array.isArray(parsed.records)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.cumulative).toBeDefined();
    expect(parsed.populationSize).toBe(1);
    expect(parsed.checkpoints).toBe(1);
  });

  it('serializes full CohortMetricRecord including cumulativeEvents', () => {
    const stub = makeStateStub();
    const r = record({
      day: 730,
      cumulativeEvents: {
        wipes: 2,
        recoveries: 1,
        reactivations: 0,
        adaptations: 4,
        focusFireNominationsReceived: 3,
        recruitmentAwardEvents: 12,
        recruitmentAwardGold: 3000,
        allianceAidEvents: 5,
        allianceAidGold: 7500,
      },
    });
    const json = eraArtifactsToJson({
      state: stub as EraSimulationRunState,
      records: [r],
      findings: [],
    });
    const parsed = JSON.parse(json);
    expect(parsed.records[0].cumulativeEvents.allianceAidGold).toBe(7500);
    expect(
      parsed.records[0].cumulativeEvents.focusFireNominationsReceived,
    ).toBe(3);
  });
});
