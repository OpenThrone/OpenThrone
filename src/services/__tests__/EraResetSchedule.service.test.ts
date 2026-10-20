import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const audit = require('@/utils/auditLogger');
const reset = require('@/services/CurrentEraReset.service');
const service = require('@/services/EraResetSchedule.service');

const ID = '00000000-0000-4000-8000-000000000007';
const startDate = new Date('2026-01-01T00:00:00.000Z');
let stored: Record<string, unknown> | null;
let tx: any;
let resetSpy: ReturnType<typeof vi.spyOn>;
let auditSpy: ReturnType<typeof vi.spyOn>;
/** DISABLE_LOGIN writes (the schedule itself is also stored as a setting). */
const loginWrites = () =>
  tx.serverSetting.upsert.mock.calls.filter(
    ([args]: any[]) => args.where.key === 'DISABLE_LOGIN',
  ).length;

const pendingSchedule = () => ({
  id: ID,
  eraId: 7,
  expectedEraStartDate: startDate.toISOString(),
  resetAt: '2026-01-02T00:00:00.000Z',
  enableLogins: true,
  adminUserId: 1,
  state: 'pending',
  closedAt: null,
});
const input = () => ({
  eraId: 7,
  expectedEraStartDate: startDate.toISOString(),
  resetAt: new Date(Date.now() + 120_000).toISOString(),
  enableLogins: true,
  confirmation: 'RESET ERA 7',
  expectedScheduleId: null,
  adminUserId: 1,
  ip: '192.0.2.1',
});

beforeEach(() => {
  stored = null;
  resetSpy = vi
    .spyOn(reset, 'resetCurrentEraInTransaction')
    .mockResolvedValue({ eraId: 7 });
  auditSpy = vi.spyOn(audit, 'logActionStrict').mockResolvedValue(undefined);
  tx = {
    $queryRaw: vi.fn(),
    era: { findFirst: vi.fn().mockResolvedValue({ id: 7, startDate }) },
    serverSetting: {
      findUnique: vi.fn(async () => (stored ? { value: stored } : null)),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        if (where.key === 'ERA_RESET_SCHEDULE')
          stored = stored ? update.value : create.value;
      }),
    },
  };
  mockPrisma.serverSetting = tx.serverSetting;
  mockPrisma.era = tx.era;
  // Model persistence rollback at the transaction boundary using synthetic data.
  mockPrisma.$transaction = vi.fn(async (callback: any) => {
    const previous = stored ? { ...stored } : null;
    try {
      return await callback(tx);
    } catch (error) {
      stored = previous;
      throw error;
    }
  });
});

afterEach(() => {
  resetSpy.mockRestore();
  auditSpy.mockRestore();
});

describe('scheduled current-era reset', () => {
  it('starts an immediate reset without requiring disabled logins', async () => {
    const result = await service.startImmediateEraReset({
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      enableLogins: true,
      adminUserId: 1,
      ip: 'test',
    });
    expect(result).toMatchObject({ eraId: 7, state: 'closing' });
    expect(stored).toMatchObject({ state: 'closing', enableLogins: true });
    expect(tx.serverSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'DISABLE_LOGIN' },
        update: { value: true, updatedByUserId: 1 },
      }),
    );
    expect(resetSpy).not.toHaveBeenCalled();
    stored = {
      ...stored,
      closedAt: new Date(Date.now() - 36_000).toISOString(),
    };
    await service.processScheduledEraReset();
    expect(resetSpy).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ enableLogins: true }),
    );
    expect(stored?.state).toBe('completed');
  });
  it('rejects duplicate immediate resets and stale era requests before closing access', async () => {
    const request = {
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      adminUserId: 1,
      ip: 'test',
    };
    await expect(
      service.startImmediateEraReset({
        ...request,
        expectedEraStartDate: new Date('2026-01-03T00:00:00Z'),
      }),
    ).rejects.toThrow('era changed');
    expect(loginWrites()).toBe(0);
    await service.startImmediateEraReset(request);
    await expect(service.startImmediateEraReset(request)).rejects.toThrow(
      'already in progress',
    );
    expect(loginWrites()).toBe(1);
  });
  it('replaces a pending timed reset with the confirmed immediate reset', async () => {
    stored = pendingSchedule();
    await service.startImmediateEraReset({
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      enableLogins: false,
      adminUserId: 1,
      ip: 'test',
    });
    expect(stored?.id).not.toBe(ID);
    expect(stored).toMatchObject({ state: 'closing', enableLogins: false });
  });
  it('does not persist a started immediate reset if closing access or auditing fails', async () => {
    const upsert = tx.serverSetting.upsert.getMockImplementation();
    let failed = false;
    tx.serverSetting.upsert.mockImplementation(async (args: any) => {
      if (args.where.key === 'DISABLE_LOGIN' && !failed) {
        failed = true;
        throw new Error('closure failed');
      }
      return upsert?.(args);
    });
    const request = {
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      adminUserId: 1,
      ip: 'test',
    };
    await expect(service.startImmediateEraReset(request)).rejects.toThrow(
      'closure failed',
    );
    expect(stored).toBeNull();
    auditSpy.mockRejectedValueOnce(new Error('audit failed'));
    await expect(service.startImmediateEraReset(request)).rejects.toThrow(
      'audit failed',
    );
    expect(stored).toBeNull();
    expect(resetSpy).not.toHaveBeenCalled();
  });
  it('persists a confirmed future schedule and redacts internal fields publicly', async () => {
    await service.setEraResetSchedule(input());
    expect(stored).toMatchObject({
      eraId: 7,
      state: 'pending',
      enableLogins: true,
    });
    const notice = await service.getEraResetSchedule();
    expect(notice).toMatchObject({ eraId: 7, state: 'pending' });
    expect(notice).not.toHaveProperty('adminUserId');
    expect(notice).not.toHaveProperty('expectedEraStartDate');
  });
  it('rejects missing confirmation, past times, and stale eras', async () => {
    await expect(
      service.setEraResetSchedule({ ...input(), confirmation: 'wrong' }),
    ).rejects.toThrow('confirmation');
    await expect(
      service.setEraResetSchedule({
        ...input(),
        resetAt: startDate.toISOString(),
      }),
    ).rejects.toThrow('future');
    tx.era.findFirst.mockResolvedValue({ id: 8, startDate });
    await expect(service.setEraResetSchedule(input())).rejects.toThrow(
      'era changed',
    );
    expect(tx.serverSetting.upsert).not.toHaveBeenCalled();
  });
  it('prevents stale schedule replacement and cancellation', async () => {
    stored = pendingSchedule();
    await expect(service.setEraResetSchedule(input())).rejects.toThrow(
      'Schedule changed',
    );
    await expect(
      service.cancelEraResetSchedule({
        scheduleId: 'wrong',
        adminUserId: 1,
        ip: 'test',
      }),
    ).rejects.toThrow('Schedule changed');
    expect(stored?.state).toBe('pending');
  });
  it('cancels a pending reset so no worker action follows', async () => {
    stored = pendingSchedule();
    await service.cancelEraResetSchedule({
      scheduleId: ID,
      adminUserId: 1,
      ip: 'test',
    });
    await service.processScheduledEraReset();
    expect(stored?.state).toBe('cancelled');
    expect(resetSpy).not.toHaveBeenCalled();
    expect(await service.getEraResetSchedule()).toBeNull();
  });
  it('does not reset before the deadline', async () => {
    stored = {
      ...pendingSchedule(),
      resetAt: new Date(Date.now() + 120_000).toISOString(),
    };
    await service.processScheduledEraReset();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it('closes logins before reset and waits for access caches', async () => {
    stored = pendingSchedule();
    await service.processScheduledEraReset();
    expect(stored?.state).toBe('closing');
    expect(tx.serverSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'DISABLE_LOGIN' },
        update: { value: true, updatedByUserId: 1 },
      }),
    );
    await service.processScheduledEraReset();
    expect(resetSpy).not.toHaveBeenCalled();
  });
  it('resumes a closing reset after restart and completes only once', async () => {
    stored = {
      ...pendingSchedule(),
      state: 'closing',
      closedAt: new Date(Date.now() - 36_000).toISOString(),
    };
    await service.processScheduledEraReset();
    await service.processScheduledEraReset();
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eraId: 7,
        expectedEraStartDate: startDate,
        enableLogins: true,
        confirmation: 'RESET ERA 7',
      }),
    );
    expect(stored?.state).toBe('completed');
  });
  it('rechecks under the lock when another worker completed the reset', async () => {
    stored = pendingSchedule();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      stored = { ...pendingSchedule(), state: 'completed' };
      return callback(tx);
    });
    await service.processScheduledEraReset();
    expect(resetSpy).not.toHaveBeenCalled();
    expect(loginWrites()).toBe(0);
  });
  it('cancels stale-era schedules without changing login settings', async () => {
    stored = pendingSchedule();
    tx.era.findFirst.mockResolvedValue({
      id: 7,
      startDate: new Date('2026-01-03T00:00:00Z'),
    });
    expect(await service.getEraResetSchedule()).toBeNull();
    await service.processScheduledEraReset();
    expect(stored?.state).toBe('cancelled');
    expect(loginWrites()).toBe(0);
    expect(resetSpy).not.toHaveBeenCalled();
  });
  it('keeps a failed reset in the closing state for safe retry', async () => {
    stored = {
      ...pendingSchedule(),
      state: 'closing',
      closedAt: new Date(Date.now() - 36_000).toISOString(),
    };
    resetSpy.mockRejectedValueOnce(new Error('reset failed'));
    await expect(service.processScheduledEraReset()).rejects.toThrow(
      'reset failed',
    );
    expect(stored?.state).toBe('closing');
    await service.processScheduledEraReset();
    expect(stored?.state).toBe('completed');
  });
  it('refuses cancellation once the reset starts', async () => {
    stored = {
      ...pendingSchedule(),
      state: 'closing',
      closedAt: new Date().toISOString(),
    };
    await expect(
      service.cancelEraResetSchedule({
        scheduleId: ID,
        adminUserId: 1,
        ip: 'test',
      }),
    ).rejects.toThrow('already started');
  });
  it('rolls schedule writes back if auditing fails', async () => {
    auditSpy.mockRejectedValueOnce(new Error('audit failed'));
    await expect(service.setEraResetSchedule(input())).rejects.toThrow(
      'audit failed',
    );
    expect(stored).toBeNull();
  });
});
