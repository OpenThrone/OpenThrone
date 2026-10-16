import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const { GeneralService } = require('../General.service');
const { CronJobService } = require('../CronJob.service');
const { UserDataService } = require('../UserDataService');
const { invalidateRuntimeConfigCache } = require('../RuntimeConfig.service');

const originalLogin = process.env.NEXT_PUBLIC_DISABLE_LOGIN;
const ERA_START = new Date('2026-01-01T00:00:00Z');

const staffClause = {
  staffRoleAssignments: {
    some: {
      role: { in: ['ADMINISTRATOR', 'MODERATOR'] },
      revokedAt: null,
    },
  },
};

function setLoginDisabled(disabled: boolean) {
  process.env.NEXT_PUBLIC_DISABLE_LOGIN = String(disabled);
  invalidateRuntimeConfigCache();
}

describe('current-era participation across population, rankings and cron', () => {
  beforeEach(() => {
    resetMockPrisma();
    setLoginDisabled(true);
    mockPrisma.era.findFirst.mockResolvedValue({
      id: 1,
      name: 'Era 1',
      startDate: ERA_START,
      endDate: null,
      startSettings: null,
    });
    mockPrisma.users.count = vi.fn().mockResolvedValue(3);
    mockPrisma.users.findFirst = vi.fn().mockResolvedValue(null);
    mockPrisma.users.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.users.findUnique = vi.fn().mockResolvedValue(null);
    mockPrisma.users.update = vi.fn();
    for (const model of ['attack_log', 'bank_history', 'recruit_history']) {
      mockPrisma[model] = { deleteMany: vi.fn().mockResolvedValue({}) };
    }
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue(null);
  });
  afterEach(() => {
    if (originalLogin === undefined)
      delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    else process.env.NEXT_PUBLIC_DISABLE_LOGIN = originalLogin;
    invalidateRuntimeConfigCache();
  });

  it('counts online population only among current-era participants during maintenance', async () => {
    const stats = await GeneralService.getOnlinePlayersStats();

    expect(stats.allUsersCounted).toBe(3);
    const { where } = mockPrisma.users.count.mock.calls[0][0];
    expect(where).toMatchObject({
      id: { gt: 0 },
      currentEraId: 1,
      last_active: { gte: ERA_START },
      ...staffClause,
    });
  });

  it('counts online population by era participation when login is open', async () => {
    setLoginDisabled(false);

    await GeneralService.getOnlinePlayersStats();

    const { where } = mockPrisma.users.count.mock.calls[0][0];
    expect(where).toMatchObject({ id: { gt: 0 }, currentEraId: 1 });
    expect(where.staffRoleAssignments).toBeUndefined();
  });

  it('turn updates select only active staff participants during maintenance', async () => {
    await CronJobService.processTurnUpdates();

    const { where } = mockPrisma.users.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ currentEraId: 1, ...staffClause });
  });

  it('daily updates select only active staff participants during maintenance', async () => {
    await CronJobService.processDailyUpdates();

    const { where } = mockPrisma.users.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ currentEraId: 1, ...staffClause });
  });

  it('full user data for a blocked non-staff account writes no activity', async () => {
    const result = await UserDataService.getFullUserData(125);

    expect(result).toBeNull();
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });
});
