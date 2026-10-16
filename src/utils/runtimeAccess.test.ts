import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

const {
  getMaintenanceBlock,
  getRuntimeFeatureBlock,
} = require('./runtimeAccess');
const {
  invalidateRuntimeConfigCache,
  resetRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');

const MAINTENANCE_MESSAGE = 'Synthetic planned maintenance';
const activeRoles = new Map<number, string[]>();

function setRuntimeSettings(
  settings: { maintenance?: boolean; social?: boolean; enemies?: boolean } = {},
) {
  const { maintenance = true, social = true, enemies = true } = settings;
  mockPrisma.serverSetting.findMany = vi.fn().mockResolvedValue([
    {
      key: 'MAINTENANCE_MODE',
      value: { enabled: maintenance, message: MAINTENANCE_MESSAGE },
    },
    { key: 'ENABLE_SOCIAL', value: social },
    { key: 'ENABLE_ENEMIES', value: enemies },
  ]);
  mockPrisma.featureFlag.findMany = vi.fn().mockResolvedValue([]);
  invalidateRuntimeConfigCache();
}

describe('runtime access policy', () => {
  beforeEach(() => {
    resetMockPrisma();
    resetRuntimeConfigCache();
    activeRoles.clear();
    setRuntimeSettings();
    mockPrisma.staffRoleAssignment.findFirst.mockImplementation(
      async ({ where }: any) => {
        const roles = activeRoles.get(where.userId) ?? [];
        const eligibleRoles = where.role?.in as string[] | undefined;
        const hasEligibleRole = roles.some(
          (role) => !eligibleRoles || eligibleRoles.includes(role),
        );
        return where.revokedAt === null && hasEligibleRole ? { id: 9 } : null;
      },
    );
  });

  afterEach(() => {
    resetRuntimeConfigCache();
  });

  it('blocks a nonstaff account during maintenance', async () => {
    expect(await getMaintenanceBlock('/game', 120)).toBe(MAINTENANCE_MESSAGE);
    expect(mockPrisma.staffRoleAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 120,
        role: { in: ['ADMINISTRATOR', 'MODERATOR'] },
        revokedAt: null,
      },
      select: { id: true },
    });
  });

  it.each(['ADMINISTRATOR', 'MODERATOR'])(
    'allows an active %s recovery role during maintenance',
    async (role) => {
      activeRoles.set(120, [role]);

      expect(await getMaintenanceBlock('/game', 120)).toBeNull();
    },
  );

  it('does not let other staff roles bypass maintenance', async () => {
    activeRoles.set(120, ['GAME_MASTER']);

    expect(await getMaintenanceBlock('/game', 120)).toBe(MAINTENANCE_MESSAGE);
  });

  it('does not let a revoked administrator assignment bypass maintenance', async () => {
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue(null);

    expect(await getMaintenanceBlock('/game', 120)).toBe(MAINTENANCE_MESSAGE);
    expect(mockPrisma.staffRoleAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 120,
        role: { in: ['ADMINISTRATOR', 'MODERATOR'] },
        revokedAt: null,
      },
      select: { id: true },
    });
  });

  it('denies maintenance bypass to an impersonated administrator session', async () => {
    activeRoles.set(120, ['ADMINISTRATOR']);

    expect(await getMaintenanceBlock('/game', 120, true)).toBe(
      MAINTENANCE_MESSAGE,
    );
    expect(mockPrisma.staffRoleAssignment.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    '/api/config?source=login',
    '/api/account/password-reset',
    '/api/appeals',
  ])('keeps recovery route %s reachable during maintenance', async (path) => {
    expect(await getMaintenanceBlock(path, 120)).toBeNull();
    expect(mockPrisma.staffRoleAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('blocks existing player sessions while the scheduled reset is closing', async () => {
    setRuntimeSettings({ maintenance: false });
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'MAINTENANCE_MODE', value: { enabled: false, message: '' } },
      { key: 'ERA_RESET_SCHEDULE', value: { state: 'closing' } },
    ]);
    invalidateRuntimeConfigCache();
    expect(await getMaintenanceBlock('/api/training/train', 120)).toBe(
      'The Era is resetting. Please try again shortly.',
    );
    activeRoles.set(120, ['ADMINISTRATOR']);
    expect(
      await getMaintenanceBlock('/api/admin/game/era-reset-schedule', 120),
    ).toBeNull();
    expect(
      await getMaintenanceBlock('/api/era-reset-schedule', 120),
    ).toBeNull();
  });

  it('blocks social mutations when social features are disabled', async () => {
    setRuntimeSettings({ social: false, enemies: true });

    expect(await getRuntimeFeatureBlock('/api/social/add', {})).toBe(
      'Social features are currently disabled.',
    );
  });

  it('blocks enemy relationship creation while allowing friend relationships', async () => {
    setRuntimeSettings({ social: true, enemies: false });

    expect(
      await getRuntimeFeatureBlock('/api/social/add', {
        relationshipType: 'ENEMY',
      }),
    ).toBe('Enemy relationships are currently disabled.');
    expect(
      await getRuntimeFeatureBlock('/api/social/add', {
        relationshipType: 'FRIEND',
      }),
    ).toBeNull();
  });
});
