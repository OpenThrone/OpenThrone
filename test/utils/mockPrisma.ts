// Shared test helper to create/install a default-export prisma mock for tests.
// Usage: import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
// Call installMockPrisma(vi) before requiring modules that import '@/lib/prisma'.

export const mockPrisma: any = {
  // placeholder; will be replaced by installMockPrisma
  $transaction: (..._args: any[]) => {
    throw new Error('installMockPrisma not called');
  },
  social: {},
  users: {},
  bank_history: {},
  attack_log: {},
  attack_log_acl: {},
  permissionGrant: {},
  staffRoleAssignment: {},
  antiAbuseShadow: {},
  era: {},
};

export function installMockPrisma(vi: any) {
  // wire the commonly used methods as vi.fn so tests can set implementations and assertions
  mockPrisma.$transaction = vi.fn();
  mockPrisma.serverSetting = {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
  };
  mockPrisma.featureFlag = { findMany: vi.fn(async () => []) };
  mockPrisma.gameEvent = { findMany: vi.fn(async () => []) };

  mockPrisma.social = {
    findFirst: vi.fn(),
  };

  mockPrisma.users = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(async () => 0),
    update: vi.fn(),
  };

  // Identity/email lifecycle models (AccountAnonymization.service).
  mockPrisma.identityBlock = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.emailPreference = {
    findUnique: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.emailOutbox = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.accountInactivityNotice = {
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.apiClient = {
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.apiToken = {
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.accountStatusHistory = {
    findFirst: vi.fn(),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    create: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.passwordReset = {
    findFirst: vi.fn(),
    findMany: vi.fn(async () => []),
    create: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 0 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };

  mockPrisma.bank_history = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(async () => ({ _sum: { gold_amount: null } })),
  };

  mockPrisma.attack_log = {
    create: vi.fn(),
    deleteMany: vi.fn(),
  };

  mockPrisma.attack_log_acl = {
    deleteMany: vi.fn(),
  };

  mockPrisma.permissionGrant = {
    findFirst: vi.fn(),
  };

  mockPrisma.staffRoleAssignment = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };

  mockPrisma.antiAbuseShadow = {
    create: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.era = {
    findFirst: vi.fn().mockResolvedValue({
      id: 1,
      name: 'Era 1',
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: null,
      startSettings: null,
    }),
    create: vi.fn(),
    update: vi.fn(),
  };
  // Install the module mock so `import prisma from '@/lib/prisma'` returns our mockPrisma
  vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
}

export function resetMockPrisma() {
  // Clear vi mocks if present
  try {
    const clearFn = (fn: any) =>
      typeof fn?.mockClear === 'function' && fn.mockClear();

    clearFn(mockPrisma.$transaction);

    Object.values(mockPrisma.social || {}).forEach(clearFn);
    Object.values(mockPrisma.users || {}).forEach(clearFn);
    Object.values(mockPrisma.identityBlock || {}).forEach(clearFn);
    Object.values(mockPrisma.emailPreference || {}).forEach(clearFn);
    Object.values(mockPrisma.emailOutbox || {}).forEach(clearFn);
    Object.values(mockPrisma.accountInactivityNotice || {}).forEach(clearFn);
    Object.values(mockPrisma.apiClient || {}).forEach(clearFn);
    Object.values(mockPrisma.apiToken || {}).forEach(clearFn);
    Object.values(mockPrisma.accountStatusHistory || {}).forEach(clearFn);
    Object.values(mockPrisma.passwordReset || {}).forEach(clearFn);
    Object.values(mockPrisma.bank_history || {}).forEach(clearFn);
    Object.values(mockPrisma.attack_log || {}).forEach(clearFn);
    Object.values(mockPrisma.attack_log_acl || {}).forEach(clearFn);
    Object.values(mockPrisma.permissionGrant || {}).forEach(clearFn);
    Object.values(mockPrisma.staffRoleAssignment || {}).forEach(clearFn);
    Object.values(mockPrisma.antiAbuseShadow || {}).forEach(clearFn);
    Object.values(mockPrisma.era || {}).forEach(clearFn);
  } catch (e) {
    // no-op
  }
}
