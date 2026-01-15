import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

const { UserDataService } = require('../UserDataService');

describe('UserDataService', () => {
  beforeEach(() => {
    resetMockPrisma();
    // Ensure accountStatusHistory and attack_log mocks exist
    mockPrisma.accountStatusHistory = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
    };
    mockPrisma.attack_log.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.attack_log.count = vi.fn().mockResolvedValue(0);
    mockPrisma.bank_history.findMany = vi.fn().mockResolvedValue([]);
  });

  it('returns null when user not found', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);
    const res = await UserDataService.getFullUserData(123);
    expect(res).toBeNull();
  });

  it('returns DTO when user is found', async () => {
    const fakeUser = {
      id: 1,
      display_name: 'bob',
      race: 'ELF',
      class: 'ASSASSIN',
      experience: 0,
      gold: BigInt(1000),
      gold_in_bank: BigInt(0),
      fort_level: 1,
      fort_hitpoints: 10,
      house_level: 0,
      attack_turns: 0,
      stamina: 100,
      maxStamina: 100,
      last_active: new Date(),
      bio: null,
      colorScheme: null,
      economy_level: 0,
      avatar: null,
      locale: 'en-US',
      stats: {},
      permissions: [],
      UserUnit: [],
      UserItem: [],
      UserStructureUpgrade: [],
      UserBattleUpgrade: [],
      UserBonusPoints: [],
    };

    mockPrisma.users.findUnique.mockResolvedValue(fakeUser);

    // Attack stats helpers: ensure counts resolve
    mockPrisma.attack_log.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.attack_log.count = vi.fn().mockResolvedValue(0);
    mockPrisma.attack_log.count.mockResolvedValue(0);

    const dto = await UserDataService.getFullUserData(1);
    expect(dto).toBeTruthy();
    expect(dto?.id).toBe(1);
    expect(dto?.display_name).toBe('bob');
  });
});
