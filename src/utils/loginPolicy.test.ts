import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { canAccessGame, getEraParticipantWhere } = require('./loginPolicy');
const {
  invalidateRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');

function setLoginDisabled(disabled: boolean) {
  process.env.NEXT_PUBLIC_DISABLE_LOGIN = String(disabled);
  invalidateRuntimeConfigCache();
}

const originalSetting = process.env.NEXT_PUBLIC_DISABLE_LOGIN;
const era = { id: 3, startDate: new Date('2026-10-01T00:00:00Z') };

describe('disabled-login access and participation', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.serverSetting.findMany.mockResolvedValue([]);
    setLoginDisabled(true);
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue(null);
  });
  afterEach(() => {
    if (originalSetting === undefined)
      delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    else process.env.NEXT_PUBLIC_DISABLE_LOGIN = originalSetting;
    invalidateRuntimeConfigCache();
  });

  it('denies non-staff and revoked assignments', async () => {
    expect(await canAccessGame(125)).toBe(false);
    expect(mockPrisma.staffRoleAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 125,
        role: { in: ['ADMINISTRATOR', 'MODERATOR'] },
        revokedAt: null,
      },
      select: { id: true },
    });
  });
  it('allows an active staff assignment', async () => {
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue({ id: 9 });
    expect(await canAccessGame(125)).toBe(true);
  });
  it('allows regular players when login is open without a staff query', async () => {
    setLoginDisabled(false);
    expect(await canAccessGame(125)).toBe(true);
    expect(mockPrisma.staffRoleAssignment.findFirst).not.toHaveBeenCalled();
  });
  it('keeps player logins blocked during a reset even if the login flag is reopened', async () => {
    setLoginDisabled(false);
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'ERA_RESET_SCHEDULE', value: { state: 'closing' } },
    ]);
    invalidateRuntimeConfigCache();
    expect(await canAccessGame(125)).toBe(false);
  });

  it('rejects malformed and system account IDs', async () => {
    for (const id of [0, -1, NaN, 1.5])
      expect(await canAccessGame(id)).toBe(false);
    expect(mockPrisma.staffRoleAssignment.findFirst).not.toHaveBeenCalled();
  });
  it('requires current-era entry and active staff during maintenance', async () => {
    expect(await getEraParticipantWhere(era)).toEqual({
      id: { gt: 0 },
      currentEraId: 3,
      last_active: { gte: era.startDate },
      staffRoleAssignments: {
        some: { role: { in: ['ADMINISTRATOR', 'MODERATOR'] }, revokedAt: null },
      },
    });
  });
  it('retains entry requirements after reopening login', async () => {
    setLoginDisabled(false);
    expect(await getEraParticipantWhere(era)).toEqual({
      id: { gt: 0 },
      currentEraId: 3,
      last_active: { gte: era.startDate },
    });
  });
  it('fails closed when the staff lookup is unavailable', async () => {
    mockPrisma.staffRoleAssignment.findFirst.mockRejectedValue(
      new Error('unavailable'),
    );
    await expect(canAccessGame(125)).rejects.toThrow('unavailable');
  });
});
