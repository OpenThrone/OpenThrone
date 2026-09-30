import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import prisma from '../src/lib/prisma';

export interface EraCalibrationExportOptions {
  readonly eraId: number;
  readonly output: string;
}

export function parseEraCalibrationExportOptions(
  args: readonly string[],
): EraCalibrationExportOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag?.startsWith('--')) throw new Error(`Unknown argument ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    values.set(flag, value);
    index += 1;
  }
  const eraId = Number(values.get('--era-id'));
  if (!Number.isSafeInteger(eraId) || eraId <= 0) {
    throw new Error('--era-id must be a positive safe integer');
  }
  const output = values.get('--output');
  if (!output) throw new Error('--output requires a value');
  return { eraId, output: resolve(output) };
}

function stringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, candidate: unknown) =>
      typeof candidate === 'bigint' ? candidate.toString() : candidate,
    2,
  );
}

/** Exports auditable raw history for one completed era without claiming it is calibrated. */
export async function exportEraCalibration(
  options: EraCalibrationExportOptions,
): Promise<void> {
  const era = await prisma.era.findUnique({
    where: { id: options.eraId },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!era) throw new Error(`Era ${options.eraId} was not found`);
  if (!era.endDate) {
    throw new Error(
      `Era ${options.eraId} is active; only completed eras can be exported`,
    );
  }

  const snapshots = await prisma.userEra.findMany({
    where: { eraId: era.id, userId: { not: 0 } },
    select: {
      userId: true,
      levelAtStart: true,
      unitsAtStart: true,
      achievements: true,
      rankAtEnd: true,
      goldAtEnd: true,
      goldInBankAtEnd: true,
      offenseAtEnd: true,
      defenseAtEnd: true,
      spyAtEnd: true,
      sentryAtEnd: true,
      fortLevelAtEnd: true,
      houseLevelAtEnd: true,
      economyLevelAtEnd: true,
    },
    orderBy: { userId: 'asc' },
  });
  const userIds = snapshots.map((snapshot) => snapshot.userId);
  const dateRange = { gte: era.startDate, lt: era.endDate };
  const [attacks, bankEvents, recruitmentEvents] = await Promise.all([
    prisma.attack_log.findMany({
      where: {
        timestamp: dateRange,
        OR: [
          { attacker_id: { in: userIds } },
          { defender_id: { in: userIds } },
        ],
      },
      select: {
        id: true,
        attacker_id: true,
        defender_id: true,
        timestamp: true,
        winner: true,
        type: true,
        pillaged_gold: true,
        attacker_losses_total: true,
        defender_losses_total: true,
        stats: true,
      },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.bank_history.findMany({
      where: {
        date_time: dateRange,
        OR: [
          { from_user_id: { in: userIds } },
          { to_user_id: { in: userIds } },
        ],
      },
      select: {
        id: true,
        date_time: true,
        gold_amount: true,
        from_user_id: true,
        from_user_account_type: true,
        to_user_id: true,
        to_user_account_type: true,
        history_type: true,
        stats: true,
      },
      orderBy: { date_time: 'asc' },
    }),
    prisma.recruit_history.findMany({
      where: { timestamp: dateRange, to_user: { in: userIds } },
      select: { id: true, from_user: true, to_user: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    }),
  ]);

  const artifact = {
    schemaVersion: 1,
    calibrationStatus: 'unapproved-live-export' as const,
    exportedAt: new Date().toISOString(),
    era,
    sources: {
      userEraSnapshots: snapshots,
      attacks,
      bankEvents,
      recruitmentEvents,
    },
    limitations: [
      'UserEra provides start and end snapshots only; it has no day-30/90/365 checkpoints.',
      'UserUnit and UserItem are current-state tables and are not included as historical checkpoints.',
      'A reviewer must replay timestamped events, validate reconstructed trajectories, and explicitly approve targets before setting calibrationStatus to calibrated.',
    ],
  };
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, stringify(artifact));
}

if (import.meta.main) {
  exportEraCalibration(parseEraCalibrationExportOptions(process.argv.slice(2)))
    .then(() => process.stdout.write('ERA calibration export written\n'))
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
