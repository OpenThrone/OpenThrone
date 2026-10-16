// test/setup.prisma-mock.ts
import { afterEach, mock } from 'bun:test';

import type { PrismaClient } from '@/lib/prisma-exports';

/** Narrow, typed helper for only what you use. Extend as needed. */
type ModelMocks = {
  users?: {
    findUnique?: ReturnType<typeof mock>;
    create?: ReturnType<typeof mock>;
    update?: ReturnType<typeof mock>;
  };
  attack_log?: {
    create?: ReturnType<typeof mock>;
  };
};

type PrismaClientMock = Partial<PrismaClient> & {
  /** expose raw mocks for assertions when needed */
  __mocks: {
    models: ModelMocks;
  };
};

/** Build a fresh mock client (models you use in tests) */
function makePrismaMock(): PrismaClientMock {
  const models: ModelMocks = {
    users: {
      findUnique: mock(async () => null),
      create: mock(async (args: any) => ({ id: 1, ...args.data })),
      update: mock(async (args: any) => ({ id: args.where.id, ...args.data })),
    },
    attack_log: {
      create: mock(async (args: any) => ({ id: 123, ...args.data })),
    },
  };

  // Handle both array- and callback-form transactions
  const $transaction = mock(async (...args: any[]) => {
    if (typeof args[0] === 'function') {
      // interactive transaction: prisma.$transaction(async (tx) => { ... })
      const cb = args[0];
      return cb(prismaMock as PrismaClient);
    }
    // array form: prisma.$transaction([op1, op2])
    const ops = args[0] ?? [];
    return Promise.all(
      ops.map((op: any) => (typeof op === 'function' ? op() : op)),
    );
  });

  const prismaMock: PrismaClientMock = {
    __mocks: { models },
    $connect: mock(async () => {}),
    $disconnect: mock(async () => {}),
    $transaction,
    // Attach model delegates (only those you use)
    users: {
      findUnique: models.users!.findUnique as any,
      create: models.users!.create as any,
      update: models.users!.update as any,
    } as any,
    attack_log: {
      create: models.attack_log!.create as any,
    } as any,
  };

  return prismaMock;
}

// Create a single mock instance per test run (reset calls between tests)
const prismaMock = makePrismaMock();

/** Replace your real prisma module everywhere before tests load */
mock.module('@/lib/prisma', () => ({
  default: prismaMock as unknown as PrismaClient,
  prisma: prismaMock as unknown as PrismaClient,
}));

// Optional: also block direct imports of @prisma/client (discourage in app code)
mock.module('@prisma/client', () => {
  class PrismaClientShim {
    // returning an existing object from a class constructor is allowed in JS
    constructor() {
      return prismaMock as unknown as PrismaClient;
    }
  }
  return { PrismaClient: PrismaClientShim };
});

/** Reset mock call history after each test file or case */
afterEach(() => {
  // Bun 1.2.20 adds clearAllMocks()
  // This clears .mock.calls/.results on all mocks you created with mock()
  mock.clearAllMocks();
});
