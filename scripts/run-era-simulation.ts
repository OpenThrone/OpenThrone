import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import type { AllianceMode, RulesetId } from '../src/sim';
import {
  collectCohortMetrics,
  createLateJoiner,
  eraArtifactsToJson,
  eraMetricsToCsv,
  eraReportToMarkdown,
  evaluateBalanceGates,
  hasBalanceFailures,
  PRIMARY_COHORT_MANIFEST,
  runEraSimulation,
  scaleCohortManifest,
} from '../src/sim';
import type { EraPlayerState } from '../src/sim/scenarioTypes';

export interface EraManifestCell {
  readonly id: string;
  readonly seed: number;
  readonly days: number;
  readonly rulesetId: RulesetId;
  readonly recruitmentBand: 5 | 15 | 25 | 40;
  readonly allianceMode: AllianceMode;
  readonly population: { readonly active: number; readonly passive: number };
  /**
   * Days on which fresh ERA late joiners should be injected. Optional for
   * backward-compat with existing manifest JSON files; defaults to
   * `[30, 90, 180, 365]` (the plan-pinned wave schedule).
   */
  readonly lateJoinerDays?: readonly number[];
}

export interface EraManifest {
  readonly version: 1;
  readonly name: string;
  readonly cells: readonly EraManifestCell[];
}

export interface CliOptions {
  readonly manifest: string;
  readonly output: string;
  readonly resume: boolean;
  readonly overwrite: boolean;
  readonly maxWorkers: number;
  readonly perRunTimeoutMs: number;
  readonly matrixTimeoutMs: number;
  readonly maxOutputBytes: number;
  readonly enforceBalanceGates: boolean;
}

interface CellResult {
  readonly id: string;
  readonly status: 'complete' | 'failed';
  readonly checksum?: string;
  readonly error?: string;
}

/** Default late-joiner arrival days when a manifest cell omits the field. */
export const DEFAULT_LATE_JOINER_DAYS: readonly number[] = [30, 90, 180, 365];

export const SMOKE_MANIFEST: EraManifest = {
  version: 1,
  name: 'smoke',
  cells: [
    {
      id: 'smoke-production-recruit25-none-seed42',
      seed: 42,
      days: 730,
      rulesetId: 'production',
      recruitmentBand: 25,
      allianceMode: 'none',
      population: { active: 15, passive: 25 },
      lateJoinerDays: DEFAULT_LATE_JOINER_DAYS,
    },
  ],
};

export function createExhaustiveManifest(): EraManifest {
  const cells: EraManifestCell[] = [];
  const rulesets: RulesetId[] = [
    'production',
    'weakLowLevelProtection',
    'candidateSafety',
  ];
  const modes: AllianceMode[] = [
    'none',
    'twoBalanced',
    'dominant60_40',
    'focusFive',
  ];
  const bands: Array<5 | 15 | 25 | 40> = [5, 15, 25, 40];
  for (const rulesetId of rulesets) {
    for (const recruitmentBand of bands) {
      for (const allianceMode of modes) {
        for (let seed = 1; seed <= 30; seed += 1) {
          cells.push({
            id: `${rulesetId}-recruit${recruitmentBand}-${allianceMode}-seed${seed}`,
            seed,
            days: 730,
            rulesetId,
            recruitmentBand,
            allianceMode,
            population: { active: 15, passive: 25 },
            lateJoinerDays: DEFAULT_LATE_JOINER_DAYS,
          });
        }
      }
    }
  }
  for (const population of [
    { active: 10, passive: 20 },
    { active: 20, passive: 30 },
  ]) {
    for (let seed = 1; seed <= 30; seed += 1) {
      cells.push({
        id: `production-bound-${population.active}-${population.passive}-seed${seed}`,
        seed,
        days: 730,
        rulesetId: 'production',
        recruitmentBand: 25,
        allianceMode: 'none',
        population,
        lateJoinerDays: DEFAULT_LATE_JOINER_DAYS,
      });
    }
  }
  return { version: 1, name: 'exhaustive', cells };
}

/**
 * Builds the late-joiner player roster for a CLI manifest cell. Each entry
 * on `cell.lateJoinerDays` produces one fresh `balanced` late joiner that
 * `createEraSimulation` admits on the corresponding day. The default
 * schedule (`DEFAULT_LATE_JOINER_DAYS`) keeps existing manifest JSON
 * working without modification.
 */
export function createCellLateJoiners(
  cell: EraManifestCell,
): readonly EraPlayerState[] {
  const days = cell.lateJoinerDays ?? DEFAULT_LATE_JOINER_DAYS;
  return days.map((day) => createLateJoiner(day, 'balanced'));
}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${flag} must be a positive safe integer; received ${value}`,
    );
  }
  return parsed;
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  let resume = false;
  let overwrite = false;
  let enforceBalanceGates = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--resume') {
      resume = true;
      continue;
    }
    if (arg === '--enforce-balance-gates') {
      enforceBalanceGates = true;
      continue;
    }
    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unknown argument ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`${arg} requires a value`);
    values.set(arg, value);
    index += 1;
  }
  const maxWorkers = parsePositiveInteger(
    values.get('--max-workers') ?? '2',
    '--max-workers',
  );
  if (maxWorkers > 2) throw new Error('--max-workers maximum is 2');
  return {
    manifest: values.get('--manifest') ?? 'smoke',
    output: values.get('--output') ?? `temp/era-simulation/${Date.now()}`,
    resume,
    overwrite,
    maxWorkers,
    perRunTimeoutMs: parsePositiveInteger(
      values.get('--per-run-timeout') ?? '120000',
      '--per-run-timeout',
    ),
    matrixTimeoutMs: parsePositiveInteger(
      values.get('--matrix-timeout') ?? '86400000',
      '--matrix-timeout',
    ),
    maxOutputBytes: parsePositiveInteger(
      values.get('--max-output-bytes') ?? String(2 * 1024 * 1024 * 1024),
      '--max-output-bytes',
    ),
    enforceBalanceGates,
  };
}

export async function loadManifest(nameOrPath: string): Promise<EraManifest> {
  if (nameOrPath === 'smoke') return SMOKE_MANIFEST;
  if (nameOrPath === 'exhaustive') return createExhaustiveManifest();
  const parsed = JSON.parse(
    await readFile(resolve(nameOrPath), 'utf8'),
  ) as EraManifest;
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.cells) ||
    parsed.cells.length === 0
  ) {
    throw new Error(`Invalid ERA manifest at ${nameOrPath}`);
  }
  // Normalize legacy cells that predate `lateJoinerDays` so the default
  // schedule still applies without forcing manifest JSON rewrites.
  return {
    ...parsed,
    cells: parsed.cells.map((cell) =>
      cell.lateJoinerDays
        ? cell
        : { ...cell, lateJoinerDays: DEFAULT_LATE_JOINER_DAYS },
    ),
  };
}

function scenarioManifestForCell(cell: EraManifestCell) {
  const primaryCohort =
    cell.population.active === 15 && cell.population.passive === 25
      ? PRIMARY_COHORT_MANIFEST
      : scaleCohortManifest(
          PRIMARY_COHORT_MANIFEST,
          cell.population.active,
          cell.population.passive,
        );
  return {
    id: cell.id,
    rulesetId: cell.rulesetId,
    seed: cell.seed,
    totalDays: cell.days,
    primaryCohort,
    recruitment: {
      rewardsPerDay: cell.recruitmentBand,
      band: cell.recruitmentBand,
      recipientMode: 'self' as const,
      selectionShare: 0.75,
    },
    allianceMode: cell.allianceMode,
    lateJoinerDays: cell.lateJoinerDays ?? DEFAULT_LATE_JOINER_DAYS,
    calibrationStatus: 'uncalibrated' as const,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runCellInProcess(
  cell: EraManifestCell,
  root: string,
  manifestHash: string,
  options: CliOptions,
): Promise<CellResult> {
  const finalDir = join(root, cell.id);
  const completeFile = join(finalDir, 'complete.json');
  if (options.resume && (await exists(completeFile))) {
    const completed = JSON.parse(await readFile(completeFile, 'utf8')) as {
      checksum?: string;
      manifestHash?: string;
    };
    if (completed.manifestHash !== manifestHash) {
      throw new Error(`Manifest hash mismatch for completed cell ${cell.id}`);
    }
    return { id: cell.id, status: 'complete', checksum: completed.checksum };
  }
  if ((await exists(finalDir)) && !options.overwrite) {
    throw new Error(
      `Output already exists for cell ${cell.id}; use --resume or --overwrite`,
    );
  }
  const tempDir = `${finalDir}.partial`;
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () =>
          reject(
            new Error(`Cell timed out after ${options.perRunTimeoutMs}ms`),
          ),
        options.perRunTimeoutMs,
      );
    });
    let state;
    try {
      state = await Promise.race([
        runEraSimulation({
          manifest: scenarioManifestForCell(cell),
          config: { seed: cell.seed, rulesetId: cell.rulesetId },
          lateJoiners: createCellLateJoiners(cell),
        }),
        timeout,
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
    const records =
      state.checkpointMetrics.length > 0
        ? state.checkpointMetrics
        : collectCohortMetrics(state);
    const findings =
      state.scenario.manifest.calibrationStatus === 'calibrated'
        ? evaluateBalanceGates(records)
        : [
            {
              id: 'uncalibrated-era-model',
              day: state.base.day,
              passed: true,
              severity: 'info' as const,
              kind: 'dataNotTracked' as const,
              message:
                'Balance gates are suppressed: this simulation uses an uncalibrated behavior model. Compare progression against approved production targets before enforcing balance findings.',
            },
          ];
    const json = eraArtifactsToJson({ state, records, findings });
    const csv = eraMetricsToCsv(records);
    const markdown = eraReportToMarkdown({ state, records, findings });
    const artifactBytes =
      Buffer.byteLength(json) +
      Buffer.byteLength(csv) +
      Buffer.byteLength(markdown);
    if (artifactBytes > options.maxOutputBytes)
      throw new Error(`Cell output exceeds ${options.maxOutputBytes} bytes`);
    const artifactChecksum = checksum(`${json}\n${csv}\n${markdown}`);
    await Promise.all([
      writeFile(join(tempDir, 'report.json'), json),
      writeFile(join(tempDir, 'cohorts.csv'), csv),
      writeFile(join(tempDir, 'report.md'), markdown),
      writeFile(
        join(tempDir, 'complete.json'),
        JSON.stringify(
          { manifestHash, checksum: artifactChecksum, cell },
          null,
          2,
        ),
      ),
    ]);
    await rm(finalDir, { recursive: true, force: true });
    await rename(tempDir, finalDir);
    if (options.enforceBalanceGates && hasBalanceFailures(findings)) {
      return {
        id: cell.id,
        status: 'failed',
        checksum: artifactChecksum,
        error: 'balance gates failed',
      };
    }
    return { id: cell.id, status: 'complete', checksum: artifactChecksum };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(
      join(tempDir, 'failed.json'),
      JSON.stringify({ manifestHash, cell, error: message }, null, 2),
    );
    return { id: cell.id, status: 'failed', error: message };
  }
}

interface IsolatedCellRequest {
  readonly cell: EraManifestCell;
  readonly root: string;
  readonly manifestHash: string;
  readonly options: CliOptions;
}

async function runCell(
  cell: EraManifestCell,
  root: string,
  manifestHash: string,
  options: CliOptions,
): Promise<CellResult> {
  const requestFile = join(root, `.${cell.id}.request.json`);
  const request: IsolatedCellRequest = { cell, root, manifestHash, options };
  await writeFile(requestFile, JSON.stringify(request));
  try {
    const child = Bun.spawn({
      cmd: [
        'bun',
        'scripts/run-era-simulation.ts',
        '--internal-cell',
        requestFile,
      ],
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: options.perRunTimeoutMs,
    });
    const exitCode = await child.exited;
    const stdout = child.stdout ? await new Response(child.stdout).text() : '';
    const result = JSON.parse(stdout) as CellResult;
    if (exitCode !== 0 && result.status === 'complete') {
      throw new Error(`Isolated cell ${cell.id} exited with code ${exitCode}`);
    }
    return result;
  } catch (error) {
    return {
      id: cell.id,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(requestFile, { force: true });
  }
}

async function runInternalCell(requestFile: string): Promise<number> {
  const request = JSON.parse(
    await readFile(resolve(requestFile), 'utf8'),
  ) as IsolatedCellRequest;
  let result: CellResult;
  try {
    result = await runCellInProcess(
      request.cell,
      request.root,
      request.manifestHash,
      request.options,
    );
  } catch (error) {
    result = {
      id: request.cell.id,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  process.stdout.write(JSON.stringify(result));
  return result.status === 'complete' ? 0 : 1;
}

export async function runManifest(options: CliOptions): Promise<number> {
  const manifest = await loadManifest(options.manifest);
  const root = resolve(options.output);
  await mkdir(root, { recursive: true });
  const manifestHash = checksum(JSON.stringify(manifest));
  const started = Date.now();
  const results = new Map<string, CellResult>();
  let nextIndex = 0;
  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
    process.stderr.write(
      '\nSIGINT received; preserving completed cells and stopping new work.\n',
    );
  };
  process.once('SIGINT', onSigint);
  const worker = async (): Promise<void> => {
    while (!interrupted) {
      const index = nextIndex;
      nextIndex += 1;
      const cell = manifest.cells[index];
      if (!cell) return;
      if (Date.now() - started > options.matrixTimeoutMs) {
        results.set(cell.id, {
          id: cell.id,
          status: 'failed',
          error: 'matrix timeout',
        });
        continue;
      }
      const began = Date.now();
      const result = await runCell(cell, root, manifestHash, options);
      results.set(cell.id, result);
      const completed = results.size;
      const elapsed = Date.now() - started;
      const averageMs = elapsed / completed;
      const remaining = Math.max(0, manifest.cells.length - completed);
      const etaSeconds = Math.ceil((averageMs * remaining) / 1_000);
      process.stdout.write(
        `[${completed}/${manifest.cells.length}] ${cell.id}: ${result.status} (${((Date.now() - began) / 1_000).toFixed(1)}s, ETA ${etaSeconds}s)\n`,
      );
    }
  };
  try {
    await Promise.all(
      Array.from({ length: options.maxWorkers }, () => worker()),
    );
  } finally {
    process.off('SIGINT', onSigint);
  }
  for (let index = nextIndex; index < manifest.cells.length; index += 1) {
    const cell = manifest.cells[index];
    if (cell) {
      results.set(cell.id, {
        id: cell.id,
        status: 'failed',
        error: interrupted ? 'interrupted before start' : 'matrix timeout',
      });
    }
  }
  const orderedResults = manifest.cells.map(
    (cell) =>
      results.get(cell.id) ?? {
        id: cell.id,
        status: 'failed' as const,
        error: interrupted ? 'interrupted before start' : 'matrix timeout',
      },
  );
  await writeFile(
    join(root, 'index.json'),
    JSON.stringify(
      {
        manifest: basename(options.manifest),
        manifestHash,
        results: orderedResults,
      },
      null,
      2,
    ),
  );
  if (interrupted) return 130;
  return orderedResults.some((result) => result.status === 'failed') ? 1 : 0;
}

if (import.meta.main) {
  const internalCellIndex = process.argv.indexOf('--internal-cell');
  if (internalCellIndex >= 0) {
    const requestFile = process.argv[internalCellIndex + 1];
    if (!requestFile) {
      process.stderr.write('--internal-cell requires a request file path\n');
      process.exit(1);
    }
    runInternalCell(requestFile)
      .then((exitCode) => process.exit(exitCode))
      .catch((error) => {
        process.stderr.write(
          `${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exit(1);
      });
  } else if (process.argv.includes('--help')) {
    process.stdout.write(
      'Usage: bun scripts/run-era-simulation.ts --manifest smoke|exhaustive|path --output DIR [--resume] [--overwrite] [--max-workers 1|2] [--per-run-timeout MS] [--matrix-timeout MS] [--max-output-bytes BYTES] [--enforce-balance-gates]\n',
    );
    process.exit(0);
  } else {
    runManifest(parseCliOptions(process.argv.slice(2)))
      .then((exitCode) => process.exit(exitCode))
      .catch((error) => {
        process.stderr.write(
          `${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exit(1);
      });
  }
}
