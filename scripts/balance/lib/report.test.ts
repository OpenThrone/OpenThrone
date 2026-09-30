import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { LogEntry } from '@/utils/logger';

import {
  aggregateLogEntries,
  envSnapshot,
  formatLogSummary,
  parseFlags,
  serializeReport,
  writeArtifact,
} from './report';

function entry(message: string, level: LogEntry['level'] = 'DEBUG'): LogEntry {
  return { level, message, params: [], timestamp: '2026-08-27T00:00:00.000Z' };
}

describe('parseFlags', () => {
  it('defaults to quiet, human-readable output with an artifact', () => {
    expect(parseFlags([])).toEqual({
      verbose: false,
      json: false,
      artifact: true,
    });
  });

  it('recognizes every supported flag', () => {
    expect(parseFlags(['--verbose'])).toMatchObject({ verbose: true });
    expect(parseFlags(['-v'])).toMatchObject({ verbose: true });
    expect(parseFlags(['--json'])).toMatchObject({ json: true });
    expect(parseFlags(['--no-artifact'])).toMatchObject({ artifact: false });
  });
});

describe('aggregateLogEntries', () => {
  it('collapses repeated messages with varying numbers into one template', () => {
    const groups = aggregateLogEntries([
      entry('Assassination: 0 CITIZEN_WORKERS killed | AttackID: 1'),
      entry('Assassination: 3 CITIZEN_WORKERS killed | AttackID: 7'),
      entry('Assassination: 12 CITIZEN_WORKERS killed | AttackID: 9'),
      entry('something unrelated', 'INFO'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      level: 'DEBUG',
      template: 'Assassination: # CITIZEN_WORKERS killed | AttackID: #',
      count: 3,
    });
    expect(groups[1]).toMatchObject({ level: 'INFO', count: 1 });
  });

  it('keeps one raw sample per group, truncated for very long messages', () => {
    const longMessage = 'x'.repeat(500);
    const groups = aggregateLogEntries([
      { ...entry(longMessage), params: [{ deep: true }] },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].sample.length).toBeLessThanOrEqual(241);
    expect(groups[0].sample.endsWith('…')).toBe(true);
  });
});

describe('formatLogSummary', () => {
  it('returns a header plus counted template lines', () => {
    const lines = formatLogSummary([
      entry('hit 1'),
      entry('hit 2'),
      entry('other'),
    ]);

    expect(lines[0]).toBe('log summary: 3 entries -> 2 distinct templates');
    expect(lines[1]).toBe('  2x [DEBUG] hit #');
  });

  it('returns nothing when no entries were captured', () => {
    expect(formatLogSummary([])).toEqual([]);
  });
});

describe('serializeReport', () => {
  it('serializes bigint values as strings', () => {
    expect(serializeReport({ gold: 123n })).toBe('{\n  "gold": "123"\n}');
  });
});

describe('envSnapshot', () => {
  it('includes the gameplay-relevant knobs', () => {
    const snapshot = envSnapshot();
    expect(snapshot).toHaveProperty('NEXT_PUBLIC_ATTACK_LEVEL_RANGE');
    expect(snapshot).toHaveProperty('OT_ENABLE_BALANCE_V2');
  });
});

describe('writeArtifact', () => {
  it('writes JSON to the given directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ot-report-'));
    try {
      const path = await writeArtifact({ ok: true, gold: 5n }, 'probe.json', dir);
      const contents = await readFile(path, 'utf-8');
      expect(JSON.parse(contents)).toEqual({ ok: true, gold: '5' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
