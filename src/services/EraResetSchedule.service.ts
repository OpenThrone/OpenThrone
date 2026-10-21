import { randomUUID } from 'crypto';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import {
  CurrentEraResetError,
  type CurrentEraResetInput,
  resetCurrentEraInTransaction,
} from '@/services/CurrentEraReset.service';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import { logActionStrict } from '@/utils/auditLogger';
import {
  ERA_TRANSACTION_OPTIONS,
  lockEraLifecycle,
} from '@/utils/eraLifecycleLock';
import {
  type EraStartSettings,
  eraStartSettingsSchema,
} from '@/utils/eraStartSettings';

const SCHEDULE_KEY = 'ERA_RESET_SCHEDULE';
const scheduleSchema = z.object({
  id: z.string().uuid(),
  eraId: z.number().int().positive(),
  expectedEraStartDate: z.string().datetime(),
  resetAt: z.string().datetime(),
  enableLogins: z.boolean(),
  startSettings: eraStartSettingsSchema.optional(),
  adminUserId: z.number().int().positive(),
  state: z.enum(['pending', 'closing', 'completed', 'cancelled']),
  closedAt: z.string().datetime().nullable(),
});
export type EraResetSchedule = z.infer<typeof scheduleSchema>;
type Tx = Prisma.TransactionClient;

export class EraResetScheduleConflict extends Error {}

async function readSchedule(client: Tx | typeof prisma) {
  const row = await client.serverSetting.findUnique({
    where: { key: SCHEDULE_KEY },
  });
  if (!row) return null;
  // Corrupt persisted data must fail closed, rather than silently replacing a reset.
  return scheduleSchema.parse(row.value);
}

async function writeSchedule(tx: Tx, schedule: EraResetSchedule) {
  await tx.serverSetting.upsert({
    where: { key: SCHEDULE_KEY },
    create: {
      key: SCHEDULE_KEY,
      label: 'Scheduled current-era reset',
      type: 'JSON',
      isPublic: false,
      isRuntimeEditable: false,
      value: schedule,
      updatedByUserId: schedule.adminUserId,
    },
    update: { value: schedule, updatedByUserId: schedule.adminUserId },
  });
}

function matchesEra(
  schedule: EraResetSchedule,
  era: { id: number; startDate: Date } | null,
) {
  return (
    era?.id === schedule.eraId &&
    era.startDate.toISOString() === schedule.expectedEraStartDate
  );
}

const activeEra = (client: Tx | typeof prisma) =>
  client.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
  });

export async function getEraResetSchedule() {
  const [schedule, era] = await Promise.all([
    readSchedule(prisma),
    activeEra(prisma),
  ]);
  if (
    !schedule ||
    !matchesEra(schedule, era) ||
    !['pending', 'closing'].includes(schedule.state)
  )
    return null;
  // Public response deliberately excludes the administrator and internal bookkeeping.
  return {
    id: schedule.id,
    eraId: schedule.eraId,
    resetAt: schedule.resetAt,
    enableLogins: schedule.enableLogins,
    state: schedule.state,
  };
}

export async function setEraResetSchedule(input: {
  eraId: number;
  expectedEraStartDate: string;
  resetAt: string;
  enableLogins: boolean;
  startSettings?: EraStartSettings;
  confirmation: string;
  expectedScheduleId: string | null;
  adminUserId: number;
  ip: string;
}) {
  if (input.confirmation !== `RESET ERA ${input.eraId}`)
    throw new EraResetScheduleConflict('Explicit confirmation is required');
  return prisma.$transaction(async (tx) => {
    await lockEraLifecycle(tx);
    const era = await activeEra(tx);
    if (
      !era ||
      era.id !== input.eraId ||
      era.startDate.toISOString() !== input.expectedEraStartDate
    )
      throw new EraResetScheduleConflict(
        'Active era changed. Reload before scheduling.',
      );
    if (
      !Number.isFinite(Date.parse(input.resetAt)) ||
      Date.parse(input.resetAt) < Date.now() + 60_000
    )
      throw new EraResetScheduleConflict(
        'Choose a reset time at least one minute in the future.',
      );
    const prior = await readSchedule(tx);
    const current =
      prior &&
      matchesEra(prior, era) &&
      ['pending', 'closing'].includes(prior.state)
        ? prior
        : null;
    if (current?.state === 'closing')
      throw new EraResetScheduleConflict(
        'The reset has started and cannot be rescheduled.',
      );
    if ((current?.id ?? null) !== input.expectedScheduleId)
      throw new EraResetScheduleConflict(
        'Schedule changed. Reload before scheduling.',
      );
    const schedule: EraResetSchedule = {
      id: randomUUID(),
      eraId: input.eraId,
      expectedEraStartDate: input.expectedEraStartDate,
      resetAt: new Date(input.resetAt).toISOString(),
      enableLogins: input.enableLogins,
      startSettings: input.startSettings,
      adminUserId: input.adminUserId,
      state: 'pending',
      closedAt: null,
    };
    await writeSchedule(tx, schedule);
    await logActionStrict(
      {
        userId: input.adminUserId,
        ip: input.ip,
        action: 'ADMIN_ERA_RESET_SCHEDULED',
        entityType: 'Era',
        entityId: era.id,
        details: {
          scheduleId: schedule.id,
          resetAt: schedule.resetAt,
          enableLogins: schedule.enableLogins,
          startSettings: schedule.startSettings,
        },
      },
      tx,
    );
    return schedule.id;
  });
}

export async function cancelEraResetSchedule(input: {
  scheduleId: string;
  adminUserId: number;
  ip: string;
}) {
  await prisma.$transaction(async (tx) => {
    await lockEraLifecycle(tx);
    const schedule = await readSchedule(tx);
    if (
      !schedule ||
      schedule.id !== input.scheduleId ||
      schedule.state !== 'pending'
    )
      throw new EraResetScheduleConflict(
        'Schedule changed or the reset has already started. Reload before cancelling.',
      );
    await writeSchedule(tx, { ...schedule, state: 'cancelled' });
    await logActionStrict(
      {
        userId: input.adminUserId,
        ip: input.ip,
        action: 'ADMIN_ERA_RESET_CANCELLED',
        entityType: 'Era',
        entityId: schedule.eraId,
        details: { scheduleId: schedule.id },
      },
      tx,
    );
  });
}

/** Commit player access closure before resetting; shared by immediate and timed resets. */
async function closeEraReset(
  tx: Tx,
  schedule: EraResetSchedule,
  ip = 'scheduler',
) {
  await tx.serverSetting.upsert({
    where: { key: 'DISABLE_LOGIN' },
    create: {
      key: 'DISABLE_LOGIN',
      label: 'Disable login',
      type: 'BOOLEAN',
      value: true,
      isPublic: true,
      updatedByUserId: schedule.adminUserId,
    },
    update: { value: true, updatedByUserId: schedule.adminUserId },
  });
  await writeSchedule(tx, {
    ...schedule,
    state: 'closing',
    closedAt: new Date().toISOString(),
  });
  await logActionStrict(
    {
      userId: schedule.adminUserId,
      ip,
      action: 'ADMIN_ERA_RESET_STARTED',
      entityType: 'Era',
      entityId: schedule.eraId,
      details: { scheduleId: schedule.id },
    },
    tx,
  );
}

/** Start the same durable reset pipeline now, with no manual login-setting prerequisite. */
export async function startImmediateEraReset(input: CurrentEraResetInput) {
  if (input.confirmation !== `RESET ERA ${input.eraId}`)
    throw new EraResetScheduleConflict('Explicit confirmation is required');
  const result = await prisma.$transaction(async (tx) => {
    await lockEraLifecycle(tx);
    const era = await activeEra(tx);
    if (!era) throw new CurrentEraResetError('No active era', 'ERA_NOT_FOUND');
    if (
      era.id !== input.eraId ||
      era.startDate.getTime() !== input.expectedEraStartDate.getTime()
    )
      throw new CurrentEraResetError('Active era changed', 'STALE_ERA');
    const prior = await readSchedule(tx);
    if (prior?.state === 'closing')
      throw new EraResetScheduleConflict(
        'An Era reset is already in progress.',
      );
    const schedule: EraResetSchedule = {
      id: randomUUID(),
      eraId: era.id,
      expectedEraStartDate: era.startDate.toISOString(),
      resetAt: new Date().toISOString(),
      enableLogins: input.enableLogins ?? false,
      startSettings: input.startSettings,
      adminUserId: input.adminUserId,
      state: 'pending',
      closedAt: null,
    };
    await closeEraReset(tx, schedule, input.ip);
    return { eraId: era.id, resetId: schedule.id, state: 'closing' as const };
  });
  invalidateRuntimeConfigCache();
  return result;
}

/** Durable two-phase execution; multiple workers serialize on the lifecycle lock. */
export async function processScheduledEraReset() {
  const candidate = await readSchedule(prisma);
  if (
    !candidate ||
    !['pending', 'closing'].includes(candidate.state) ||
    Date.parse(candidate.resetAt) > Date.now()
  )
    return;
  await prisma.$transaction(async (tx) => {
    await lockEraLifecycle(tx);
    const schedule = await readSchedule(tx);
    if (
      !schedule ||
      schedule.id !== candidate.id ||
      !['pending', 'closing'].includes(schedule.state) ||
      Date.parse(schedule.resetAt) > Date.now()
    )
      return;
    if (!matchesEra(schedule, await activeEra(tx))) {
      await writeSchedule(tx, { ...schedule, state: 'cancelled' });
      await logActionStrict(
        {
          userId: schedule.adminUserId,
          ip: 'scheduler',
          action: 'ADMIN_ERA_RESET_STALE',
          entityType: 'Era',
          entityId: schedule.eraId,
          details: { scheduleId: schedule.id },
        },
        tx,
      );
      return;
    }
    if (schedule.state === 'pending') {
      await closeEraReset(tx, schedule);
      return;
    }
    // Runtime configuration may use a last-good value for up to 30 seconds on other processes.
    if (
      !schedule.closedAt ||
      Date.now() - Date.parse(schedule.closedAt) < 35_000
    )
      return;
    await resetCurrentEraInTransaction(tx, {
      eraId: schedule.eraId,
      expectedEraStartDate: new Date(schedule.expectedEraStartDate),
      confirmation: `RESET ERA ${schedule.eraId}`,
      enableLogins: schedule.enableLogins,
      startSettings: schedule.startSettings,
      adminUserId: schedule.adminUserId,
      ip: 'scheduler',
    });
    await writeSchedule(tx, { ...schedule, state: 'completed' });
  }, ERA_TRANSACTION_OPTIONS);
  invalidateRuntimeConfigCache();
}
