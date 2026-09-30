import type { BalanceGateFinding } from './balanceGates';
import type { CohortMetricRecord, QuantileSummary } from './cohortMetrics';
import type { EraSimulationRunState } from './eraIntegration';

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = [
  'day',
  'cohortId',
  'persona',
  'farmerVariant',
  'activityClass',
  'allianceIds',
  'joinedOnDayMin',
  'joinedOnDayMax',
  'count',
  'citizensP05',
  'citizensMedian',
  'citizensP95',
  'workersMedian',
  'militaryMedian',
  'spiesMedian',
  'sentriesMedian',
  'fortLevelMedian',
  'fortHpMedian',
  'xpMedian',
  'attackTurnsMedian',
  'staminaMedian',
  'goldMedian',
  'bankMedian',
  'powerMedian',
  'incomeMedian',
  'defensePressureMedian',
  'spyPressureMedian',
  'viabilityMedian',
  'populationViabilityMedian',
  'wipes',
  'recoveries',
  'reactivations',
  'adaptations',
  'focusFireNominationsReceived',
  'recruitmentAwardEvents',
  'recruitmentAwardGold',
  'allianceAidEvents',
  'allianceAidGold',
] as const;

function quantile(values: QuantileSummary, key: keyof QuantileSummary): number {
  return values[key];
}

function formatRange(
  range: readonly [number, number] | undefined,
  index: 0 | 1,
): number {
  return range ? range[index] : 0;
}

export function eraMetricsToCsv(
  records: readonly CohortMetricRecord[],
): string {
  const sorted = [...records].sort(
    (left, right) =>
      left.day - right.day ||
      left.cohortId.localeCompare(right.cohortId) ||
      left.persona.localeCompare(right.persona) ||
      left.activityClass.localeCompare(right.activityClass),
  );
  const rows: Array<Array<string | number>> = [Array.from(CSV_HEADER)];
  for (const record of sorted) {
    rows.push([
      record.day,
      record.cohortId,
      record.persona,
      record.farmerVariant ?? '',
      record.activityClass,
      record.allianceIds?.join('|') ?? '',
      formatRange(record.joinedOnDayRange, 0),
      formatRange(record.joinedOnDayRange, 1),
      record.count,
      quantile(record.citizens, 'p05'),
      quantile(record.citizens, 'median'),
      quantile(record.citizens, 'p95'),
      quantile(record.workers, 'median'),
      quantile(record.military, 'median'),
      quantile(record.spies, 'median'),
      quantile(record.sentries, 'median'),
      quantile(record.fortLevel, 'median'),
      quantile(record.fortHp, 'median'),
      quantile(record.xp, 'median'),
      quantile(record.attackTurns, 'median'),
      quantile(record.stamina, 'median'),
      quantile(record.handGold, 'median'),
      quantile(record.bankGold, 'median'),
      quantile(record.strategicPower, 'median'),
      quantile(record.income, 'median'),
      quantile(record.defensePressure, 'median'),
      quantile(record.spyPressure, 'median'),
      quantile(record.viability, 'median'),
      record.populationViabilityMedian,
      record.cumulativeEvents.wipes,
      record.cumulativeEvents.recoveries,
      record.cumulativeEvents.reactivations,
      record.cumulativeEvents.adaptations,
      record.cumulativeEvents.focusFireNominationsReceived,
      record.cumulativeEvents.recruitmentAwardEvents,
      record.cumulativeEvents.recruitmentAwardGold,
      record.cumulativeEvents.allianceAidEvents,
      record.cumulativeEvents.allianceAidGold,
    ]);
  }
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}

const REQUIRED_MARKDOWN_HEADINGS = [
  '# ERA Simulation Balance Report',
  '## Cohort snapshots',
  '## Late-joiner cohorts',
  '## Farmer focus',
  '## Cumulative cohort events',
  '## Balance gates',
  '## Cross-seed gates (informational)',
] as const;

export const ERA_REPORT_REQUIRED_HEADINGS: readonly string[] =
  REQUIRED_MARKDOWN_HEADINGS;

function focusPersonas(
  records: readonly CohortMetricRecord[],
  persona: 'farmer',
): CohortMetricRecord[] {
  return records.filter((record) => record.persona === persona);
}

export function eraReportToMarkdown(input: {
  readonly state: EraSimulationRunState;
  readonly records: readonly CohortMetricRecord[];
  readonly findings: readonly BalanceGateFinding[];
}): string {
  const { state, records, findings } = input;
  const sortedRecords = [...records].sort(
    (left, right) =>
      left.day - right.day ||
      left.cohortId.localeCompare(right.cohortId) ||
      left.persona.localeCompare(right.persona),
  );
  const failures = findings.filter(
    (finding) => !finding.passed && finding.severity === 'gate',
  );
  const gateFindings = findings.filter(
    (finding) => finding.severity === 'gate',
  );
  const infoFindings = findings.filter(
    (finding) => finding.severity === 'info',
  );
  const lateJoinerRecords = sortedRecords.filter((record) =>
    record.cohortId.startsWith('lateJoiner-'),
  );
  const farmerRecords = focusPersonas(sortedRecords, 'farmer');
  const dayGroups = new Map<number, CohortMetricRecord[]>();
  for (const record of sortedRecords) {
    const list = dayGroups.get(record.day) ?? [];
    list.push(record);
    dayGroups.set(record.day, list);
  }
  const daysWithFarmer = new Set(farmerRecords.map((record) => record.day));

  const lines: string[] = [];
  lines.push('# ERA Simulation Balance Report', '');
  lines.push(
    `- Scenario: \`${state.scenario.manifest.id}\``,
    `- Ruleset: \`${state.config.rulesetId ?? state.scenario.manifest.rulesetId}\``,
    `- Calibration: \`${state.scenario.manifest.calibrationStatus ?? 'uncalibrated'}\``,
    `- Seed: ${state.config.seed ?? state.scenario.manifest.seed}`,
    `- Days simulated: ${state.base.day}`,
    `- Checkpoints: ${state.scenario.checkpoints.length}`,
    `- Population: ${state.base.players.size}`,
    `- Cumulative wipe events: ${state.scenario.cumulative.totalWipes}`,
    `- Cumulative reactivations: ${state.scenario.cumulative.totalReactivations}`,
    `- Cumulative recruitment gold: ${state.scenario.cumulative.totalRewardGold}`,
    `- Cumulative alliance aid gold: ${state.scenario.cumulative.totalAllianceAid}`,
  );
  lines.push('', '## Cohort snapshots', '');
  lines.push(
    '| Day | Cohort | Persona | Variant | Activity | N | Pop. median | Viability median | Power median | Income median | Fort median | Turns median |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const record of sortedRecords) {
    lines.push(
      `| ${record.day} | ${record.cohortId} | ${record.persona} | ${record.farmerVariant ?? '-'} | ${record.activityClass} | ${record.count} | ${record.populationViabilityMedian.toFixed(3)} | ${record.viability.median.toFixed(3)} | ${record.strategicPower.median.toFixed(0)} | ${record.income.median.toFixed(0)} | ${record.fortLevel.median.toFixed(0)} | ${record.attackTurns.median.toFixed(0)} |`,
    );
  }
  lines.push('', '## Late-joiner cohorts', '');
  if (lateJoinerRecords.length === 0) {
    lines.push('_No late-joiner cohort records at evaluated checkpoints._');
  } else {
    lines.push(
      '| Day | Cohort | Persona | Joined (min-max) | N | Viability median | Primary ref | Catch-up ratio |',
      '| --- | --- | --- | --- | ---: | ---: | ---: | ---: |',
    );
    for (const record of lateJoinerRecords) {
      const primaryReference =
        record.populationViabilityMedian > 0
          ? record.populationViabilityMedian
          : 1;
      const ratio = record.viability.median / primaryReference;
      const range = record.joinedOnDayRange ?? [0, 0];
      lines.push(
        `| ${record.day} | ${record.cohortId} | ${record.persona} | ${range[0]}-${range[1]} | ${record.count} | ${record.viability.median.toFixed(3)} | ${primaryReference.toFixed(3)} | ${ratio.toFixed(3)} |`,
      );
    }
  }
  lines.push('', '## Farmer focus', '');
  if (farmerRecords.length === 0) {
    lines.push('_No farmer cohort records at evaluated checkpoints._');
  } else {
    lines.push(
      '| Day | Cohort | Variant | Activity | N | Workers median | Income median | Defense pressure p95 | Spy pressure p95 | Wipes | Focus-fire nominations received |',
      '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    );
    for (const record of farmerRecords) {
      lines.push(
        `| ${record.day} | ${record.cohortId} | ${record.farmerVariant ?? '-'} | ${record.activityClass} | ${record.count} | ${record.workers.median.toFixed(0)} | ${record.income.median.toFixed(0)} | ${record.defensePressure.p95.toFixed(0)} | ${record.spyPressure.p95.toFixed(0)} | ${record.cumulativeEvents.wipes} | ${record.cumulativeEvents.focusFireNominationsReceived} |`,
      );
    }
    const focusDays = Array.from(daysWithFarmer).sort((a, b) => a - b);
    if (focusDays.length > 0) {
      const last = focusDays[focusDays.length - 1] ?? 0;
      const lastFarmers = farmerRecords.filter((r) => r.day === last);
      lines.push(
        '',
        `_Farmer records observed on days: ${focusDays.join(', ')}._`,
        `_At day ${last}: ${lastFarmers.length} farmer cohort record(s)._`,
      );
    }
  }
  lines.push('', '## Cumulative cohort events', '');
  lines.push(
    '| Day | Cohort | Persona | Wipes | Recoveries | Reactivations | Adaptations | Recruitment events | Recruitment gold | Alliance aid events | Alliance aid gold |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const record of sortedRecords) {
    const events = record.cumulativeEvents;
    lines.push(
      `| ${record.day} | ${record.cohortId} | ${record.persona} | ${events.wipes} | ${events.recoveries} | ${events.reactivations} | ${events.adaptations} | ${events.recruitmentAwardEvents} | ${events.recruitmentAwardGold} | ${events.allianceAidEvents} | ${events.allianceAidGold} |`,
    );
  }
  lines.push('', '## Balance gates', '');
  if (gateFindings.length === 0) {
    lines.push(
      '_No balance gates were evaluated because this artifact is uncalibrated._',
    );
  } else if (failures.length === 0) {
    lines.push('_All evaluated gate findings passed._');
  } else {
    for (const finding of failures) {
      lines.push(
        `- FAIL [${finding.kind}] day ${finding.day}: ${finding.message}`,
      );
    }
  }
  const passedGates = findings.filter(
    (finding) => finding.passed && finding.severity === 'gate',
  );
  if (passedGates.length > 0) {
    lines.push('', '<details><summary>Passed gate findings</summary>', '');
    for (const finding of passedGates) {
      lines.push(
        `- PASS [${finding.kind}] day ${finding.day}: ${finding.message}`,
      );
    }
    lines.push('', '</details>', '');
  }
  lines.push('', '## Cross-seed gates (informational)', '');
  if (infoFindings.length === 0) {
    lines.push('_No informational findings._');
  } else {
    for (const finding of infoFindings) {
      lines.push(
        `- INFO [${finding.kind}] day ${finding.day}: ${finding.message}`,
      );
    }
  }
  return lines.join('\n');
}

export function eraArtifactsToJson(input: {
  readonly state: EraSimulationRunState;
  readonly records: readonly CohortMetricRecord[];
  readonly findings: readonly BalanceGateFinding[];
}): string {
  return JSON.stringify(
    {
      schemaVersion: 2,
      manifest: input.state.scenario.manifest,
      rulesetId:
        input.state.config.rulesetId ?? input.state.scenario.manifest.rulesetId,
      seed: input.state.config.seed ?? input.state.scenario.manifest.seed,
      day: input.state.base.day,
      checkpoints: input.state.scenario.checkpoints.length,
      populationSize: input.state.base.players.size,
      cumulative: input.state.scenario.cumulative,
      records: [...input.records],
      findings: [...input.findings],
    },
    null,
    2,
  );
}
