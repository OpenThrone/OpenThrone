import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
vi.mock('@/services/Era.service', () => ({
  ensureActiveEra: vi.fn(async () => ({ id: 1, startSettings: null })),
}));
vi.mock('@/services/UserDefaults.service', () => ({
  buildDefaultUserUpdate: () => ({}),
  buildEraStartOverrides: () => ({}),
  resetUserRelations: vi.fn(async () => undefined),
  resolveColorScheme: () => 'ELF',
}));

const { createUser } = require('../User.service');

describe('createUser email case', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.$transaction = vi.fn(async (fn: any) => fn(mockPrisma));
    mockPrisma.users.create = vi.fn(async ({ data }: any) => ({
      id: 7,
      ...data,
    }));
    mockPrisma.users.update = vi.fn(async () => ({}));
  });

  it('stores the address lowercased so login can find it', async () => {
    await createUser(
      ' New.Player@Example.COM ',
      'synthetic-hash',
      'NewPlayer',
      'ELF',
      'FIGHTER',
    );

    expect(mockPrisma.users.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.users.create.mock.calls[0][0].data.email).toBe(
      'new.player@example.com',
    );
  });
});
