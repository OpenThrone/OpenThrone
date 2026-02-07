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
  permissionGrant: {},
};

export function installMockPrisma(vi: any) {
  // wire the commonly used methods as vi.fn so tests can set implementations and assertions
  mockPrisma.$transaction = vi.fn();

  mockPrisma.social = {
    findFirst: vi.fn(),
  };

  mockPrisma.users = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };

  mockPrisma.bank_history = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };

  mockPrisma.attack_log = {
    create: vi.fn(),
  };

  mockPrisma.permissionGrant = {
    findFirst: vi.fn(),
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
    Object.values(mockPrisma.bank_history || {}).forEach(clearFn);
    Object.values(mockPrisma.attack_log || {}).forEach(clearFn);
    Object.values(mockPrisma.permissionGrant || {}).forEach(clearFn);
  } catch (e) {
    // no-op
  }
}
