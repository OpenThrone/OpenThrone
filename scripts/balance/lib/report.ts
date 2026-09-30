/**
 * Reporting helpers for balance/diagnostic scripts.
 *
 * Goals:
 *  - Default runs print a compact human summary; library logDebug floods are
 *    captured and collapsed into counted templates instead of raw lines.
 *  - `--verbose` opts back into the old live-console behavior.
 *  - `--json` prints only a machine-readable report (for agents/parsers).
 *  - Every run writes a JSON artifact to scripts/balance/output/ so results
 *    can be diffed across code changes without re-running.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { LogEntry } from '@/utils/logger';

export interface ReportFlags {
  /** Live console logging (no capture); forces DEBUG level. */
  verbose: boolean;
  /** Print only the JSON report to stdout. */
  json: boolean;
  /** Write the JSON artifact to scripts/balance/output/. */
  artifact: boolean;
}

/** Parses supported CLI flags; unknown flags are ignored. */
export function parseFlags(argv: string[]): ReportFlags {
  return {
    verbose: argv.includes('--verbose') || argv.includes('-v'),
    json: argv.includes('--json'),
    artifact: !argv.includes('--no-artifact'),
  };
}

/** Public gameplay-relevant env knobs worth recording alongside any result. */
const REPORT_ENV_KEYS = [
  'NODE_ENV',
  'LOG_LEVEL',
  'NEXT_PUBLIC_LOG_LEVEL',
  'NEXT_PUBLIC_ATTACK_LEVEL_RANGE',
  'NEXT_PUBLIC_ENABLE_ATTACKING',
  'ENABLE_BATTLE_UPGRADES',
  'OT_ENABLE_BALANCE_V2',
  'OT_BALANCE_V2_ROLLOUT_PERCENT',
] as const;

export function envSnapshot(): Record<string, string | undefined> {
  return Object.fromEntries(
    REPORT_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
}

/** A repeated-message template with its count and one raw example. */
export interface LogAggregateGroup {
  level: string;
  template: string;
  count: number;
  sample: string;
}

const MAX_SAMPLE_LENGTH = 240;

function entryToSample(entry: LogEntry): string {
  const params = entry.params.length
    ? ` ${entry.params
        .map((param) => {
          if (typeof param === 'object' && param !== null) {
            try {
              return JSON.stringify(param);
            } catch {
              return '[Unserializable Object]';
            }
          }
          return String(param);
        })
        .join(' ')}`
    : '';
  const sample = `${entry.message}${params}`;
  return sample.length > MAX_SAMPLE_LENGTH
    ? `${sample.slice(0, MAX_SAMPLE_LENGTH)}…`
    : sample;
}

/** Collapses numbers in a message so repeated logs group into one template. */
function toTemplate(message: string): string {
  return message.replace(/\d+(\.\d+)?/g, '#');
}

/**
 * Groups captured log entries by level + number-normalized message template,
 * most frequent first. 200 identical debug lines become one counted row.
 */
export function aggregateLogEntries(entries: LogEntry[]): LogAggregateGroup[] {
  const groups = new Map<string, LogAggregateGroup>();
  for (const entry of entries) {
    const template = toTemplate(entry.message);
    const key = `${entry.level}::${template}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        level: entry.level,
        template,
        count: 1,
        sample: entryToSample(entry),
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Renders the aggregated log summary as printable lines (topN templates). */
export function formatLogSummary(
  entries: LogEntry[],
  topN = 10,
): string[] {
  const groups = aggregateLogEntries(entries);
  if (!groups.length) return [];
  const lines = [`log summary: ${entries.length} entries -> ${groups.length} distinct templates`];
  for (const group of groups.slice(0, topN)) {
    lines.push(`  ${group.count}x [${group.level}] ${group.template}`);
  }
  if (groups.length > topN) {
    lines.push(`  … +${groups.length - topN} more templates`);
  }
  return lines;
}

/** Serializes a report payload, bigint-safe. */
export function serializeReport(report: unknown): string {
  return JSON.stringify(
    report,
    (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    2,
  );
}

/** Writes a report artifact under scripts/balance/output/; returns its path. */
export async function writeArtifact(
  report: unknown,
  filename: string,
  outputDir: string = path.resolve(process.cwd(), 'scripts/balance/output'),
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, filename);
  await writeFile(outputPath, serializeReport(report), 'utf-8');
  return outputPath;
}
