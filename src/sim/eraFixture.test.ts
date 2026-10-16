import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { type CohortMetricRecord, ERA_CHECKPOINTS } from './cohortMetrics';

interface SampleFixture {
  schemaVersion: number;
  manifest: {
    id: string;
    rulesetId: string;
    seed: number;
    totalDays: number;
  };
  rulesetId: string;
  seed: number;
  day: number;
  checkpoints: number;
  populationSize: number;
  cumulative: {
    totalRewardEvents: number;
    totalRewardGold: number;
    totalRewardCitizens: number;
    totalAllianceAid: number;
    totalLootAwarded: number;
    totalWipes: number;
    totalReactivations: number;
  };
  records: CohortMetricRecord[];
  findings: Array<{
    id: string;
    day: number;
    passed: boolean;
    severity: 'gate' | 'info';
    kind: string;
    message: string;
  }>;
}

async function loadFixture(): Promise<SampleFixture> {
  return JSON.parse(
    await readFile(
      join(import.meta.dir, 'fixtures', 'era-report-sample.json'),
      'utf8',
    ),
  ) as SampleFixture;
}

describe('ERA report sample fixture', () => {
  it('is parseable and carries the report schema fields', async () => {
    const fixture = await loadFixture();
    expect(fixture.schemaVersion).toBe(2);
    expect(fixture.manifest.rulesetId).toBe('production');
    expect(Array.isArray(fixture.records)).toBe(true);
    expect(Array.isArray(fixture.findings)).toBe(true);
    expect(fixture.populationSize).toBeGreaterThan(0);
    expect(fixture.checkpoints).toBeGreaterThan(0);
  });

  it('records expose the upgraded balance-relevant fields', async () => {
    const fixture = await loadFixture();
    expect(fixture.records.length).toBeGreaterThan(0);
    for (const record of fixture.records) {
      expect(record.fortLevel).toBeDefined();
      expect(record.fortHp).toBeDefined();
      expect(record.xp).toBeDefined();
      expect(record.attackTurns).toBeDefined();
      expect(record.stamina).toBeDefined();
      expect(record.military).toBeDefined();
      expect(record.spies).toBeDefined();
      expect(record.sentries).toBeDefined();
      expect(record.defensePressure).toBeDefined();
      expect(record.spyPressure).toBeDefined();
      expect(typeof record.populationViabilityMedian).toBe('number');
      expect(record.cumulativeEvents).toBeDefined();
      expect(record.cumulativeEvents.wipes).toBeGreaterThanOrEqual(0);
    }
  });

  it('records only land on declared checkpoint days', async () => {
    const fixture = await loadFixture();
    const checkpointDays = new Set<number>(ERA_CHECKPOINTS);
    for (const record of fixture.records) {
      expect(
        checkpointDays.has(record.day),
        `record day ${record.day} not a checkpoint`,
      ).toBe(true);
    }
  });

  it('findings distinguish gate and info severities', async () => {
    const fixture = await loadFixture();
    const severities = new Set(fixture.findings.map((f) => f.severity));
    expect(severities.has('info')).toBe(true);
    for (const finding of fixture.findings) {
      expect(['gate', 'info']).toContain(finding.severity);
      expect(typeof finding.kind).toBe('string');
    }
  });
});
