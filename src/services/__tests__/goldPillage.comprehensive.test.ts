import { beforeEach, describe, expect, mock, test, vi } from 'bun:test';
import { installMockMtRand } from 'test/utils/mockMtRand';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { normUnits } from 'test/utils/testFixtures';

// Install deterministic mtRand before modules that import '@/utils/mtrand'
installMockMtRand(vi);

// Capture the mock function at module level so tests can set implementations
const mockExecuteAttackFn = vi.fn();

// Pre-load attackFunctions to capture all original exports before mocking
const attackFunctionsOriginal = require('@/utils/attackFunctions');

mock.module('@/utils/attackFunctions', () => ({
  ...attackFunctionsOriginal,
  executeAttack: (...args: any[]) => mockExecuteAttackFn(...args),
}));

// Create a mock AttackDataService object we can configure below
const mockAttackDataService = {
  getUserById: vi.fn(),
  updateUser: vi.fn(),
  updateUserUnits: vi.fn(),
  createAttackLog: vi.fn(),
  createBankHistory: vi.fn(),
  incrementUserStats: vi.fn(),
};

// Install shared prisma mock before requiring modules
installMockPrisma(vi);

vi.mock('@/services/AttackDataService', () => mockAttackDataService);

// Wire prisma.$transaction to forward to our AttackDataService implementations inside tests
mockPrisma.$transaction.mockImplementation(async (cb: any) => {
  const tx = {
    users: {
      update: (...args: any[]) => mockAttackDataService.updateUser(...args),
    },
    bank_history: {
      create: (...args: any[]) =>
        mockAttackDataService.createBankHistory(...args),
    },
    attack_log: {
      create: (...args: any[]) =>
        mockAttackDataService.createAttackLog(...args),
    },
  };
  return cb(tx);
});

vi.mock('@/services/AttackValidationService', () => ({
  canAttack: vi.fn(async () => true),
}));

const AttackService = require('@/services/AttackService').default;

// Helper: in-memory "DB"
type UserRow = {
  id: number;
  gold: bigint;
  attack_turns?: number;
  fort_hitpoints?: number;
  fortLevel?: number;
  units?: any[];
  displayName?: string;
  level?: number;
  experience?: number;
};

let inMemoryUsers: Record<number, UserRow>;
let nextAttackLogId = 1000;
let createdBankHistory: any[] = [];

function resetInMemoryDB() {
  inMemoryUsers = {};
  nextAttackLogId = 1000;
  createdBankHistory = [];

  // Re-wire $transaction after vi.clearAllMocks() wipes it
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const tx = {
      users: {
        update: (...args: any[]) => mockAttackDataService.updateUser(...args),
      },
      bank_history: {
        create: (...args: any[]) =>
          mockAttackDataService.createBankHistory(...args),
      },
      attack_log: {
        create: (...args: any[]) =>
          mockAttackDataService.createAttackLog(...args),
      },
    };
    return cb(tx);
  });

  mockAttackDataService.getUserById.mockImplementation(async (id: number) => {
    const u = inMemoryUsers[id];
    if (!u) return null;
    return JSON.parse(
      JSON.stringify({
        ...u,
        gold: u.gold.toString(),
        fort_hitpoints: u.fort_hitpoints ?? 0,
        fort_level: u.fortLevel ?? 0,
        fortHitpoints: u.fort_hitpoints ?? 0,
        fortLevel: u.fortLevel ?? 0,
        attack_turns: u.attack_turns ?? 0,
        attackTurns: u.attack_turns ?? 0,
        stamina: 100,
        experience: u.experience ?? 0,
        race: 'HUMAN',
        class: 'FIGHTER',
        display_name: u.displayName ?? `User${id}`,
        displayName: u.displayName ?? `User${id}`,
        id,
        level: u.level ?? 1,
        UserUnit: u.units ?? [],
        UserItem: [],
        UserStructureUpgrade: [],
        UserBattleUpgrade: [],
        UserBonusPoints: [],
        permissions: u.permissions ?? [],
      }),
    );
  });

  mockAttackDataService.updateUser.mockImplementation(
    async (id: number, data: any, tx?: any) => {
      const existing = inMemoryUsers[id];
      if (!existing) throw new Error('User not found');
      if (data.gold !== undefined) {
        const g =
          typeof data.gold === 'bigint' ? data.gold : BigInt(String(data.gold));
        existing.gold = g;
      }
      if (data.attack_turns !== undefined)
        existing.attack_turns = data.attack_turns;
      if (data.fort_hitpoints !== undefined)
        existing.fort_hitpoints = data.fort_hitpoints;
      if (data.experience !== undefined) existing.experience = data.experience;
      if (data.units !== undefined) existing.units = data.units;
      return {
        ...existing,
        gold: existing.gold.toString(),
      };
    },
  );

  mockAttackDataService.createAttackLog.mockImplementation(
    async (payload: any, tx?: any) => {
      const id = nextAttackLogId++;
      return { ...payload, id };
    },
  );

  mockAttackDataService.createBankHistory.mockImplementation(
    async (payload: any, tx?: any) => {
      createdBankHistory.push(payload);
      return { id: createdBankHistory.length, ...payload };
    },
  );

  mockAttackDataService.incrementUserStats.mockImplementation(
    async (...args: any[]) => {
      return true;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetInMemoryDB();
});

function createMockUser(opts?: Partial<UserRow>): UserRow {
  const id = opts?.id ?? Object.keys(inMemoryUsers).length + 1;
  const user: UserRow = {
    id,
    gold: opts?.gold ?? BigInt(50000),
    attack_turns: opts?.attack_turns ?? 10,
    fort_hitpoints: opts?.fort_hitpoints ?? 100,
    fortLevel: opts?.fortLevel ?? 5,
    units: normUnits(opts?.units ?? []),
    displayName: opts?.displayName ?? `User${id}`,
    level: opts?.level ?? 1,
    experience: opts?.experience ?? 0,
  };
  inMemoryUsers[id] = user;
  return user;
}

describe('Gold pillage comprehensive tests', () => {
  test('transaction-level concurrency: two simultaneous attacks cannot produce negative defender gold', async () => {
    const DEF_ID = 1;
    const ATT1 = 2;
    const ATT2 = 3;

    createMockUser({ id: DEF_ID, gold: BigInt(1000), displayName: 'Defender' });
    createMockUser({
      id: ATT1,
      gold: BigInt(100),
      displayName: 'Attacker1',
      units: normUnits([{ type: 'OFFENSE', quantity: 50, level: 1 }]),
    });
    createMockUser({
      id: ATT2,
      gold: BigInt(200),
      displayName: 'Attacker2',
      units: normUnits([{ type: 'OFFENSE', quantity: 50, level: 1 }]),
    });

    mockExecuteAttackFn.mockImplementation(
      async (att: any, def: any, fortHP: number, turns: number) => {
        return {
          pillagedGold: BigInt(900),
          result: 'WIN',
          experienceGained: { attacker: 0, defender: 0 },
          Losses: {
            Attacker: { units: [], total: 0 },
            Defender: { units: [], total: 0 },
          },
          finalFortHP: fortHP,
        };
      },
    );

    const p1 = AttackService.executeAttack(ATT1, DEF_ID, 1);
    const p2 = AttackService.executeAttack(ATT2, DEF_ID, 1);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.status).toBe('success');
    expect(r2.status).toBe('success');

    const finalDef = inMemoryUsers[DEF_ID].gold;
    expect(finalDef).toBeGreaterThanOrEqual(BigInt(0));

    expect(createdBankHistory.length).toBeGreaterThanOrEqual(1);

    for (const entry of createdBankHistory) {
      const amt =
        typeof entry.gold_amount === 'bigint'
          ? entry.gold_amount
          : BigInt(String(entry.gold_amount));
      expect(amt).toBeGreaterThanOrEqual(BigInt(0));
    }
  }, 20000);

  test('boundary clamping: pillage greater than defender gold is clamped to available gold', async () => {
    const DEF_ID = 10;
    const ATT_ID = 11;

    createMockUser({
      id: DEF_ID,
      gold: BigInt(1500),
      displayName: 'Defender-Boundary',
    });
    createMockUser({
      id: ATT_ID,
      gold: BigInt(500),
      displayName: 'Attacker-Boundary',
      units: normUnits([{ type: 'OFFENSE', quantity: 80, level: 1 }]),
    });

    mockExecuteAttackFn.mockResolvedValue({
      pillagedGold: BigInt(5000),
      result: 'WIN',
      experienceGained: { attacker: 0, defender: 0 },
      Losses: {
        Attacker: { units: [], total: 0 },
        Defender: { units: [], total: 0 },
      },
      finalFortHP: 10,
    });

    const res = await AttackService.executeAttack(ATT_ID, DEF_ID, 1);
    expect(res.status).toBe('success');

    const lastBankEntry = createdBankHistory[createdBankHistory.length - 1];
    const applied =
      typeof lastBankEntry.gold_amount === 'bigint'
        ? lastBankEntry.gold_amount
        : BigInt(String(lastBankEntry.gold_amount));
    expect(applied).toBeLessThanOrEqual(BigInt(1500));
    expect(applied).toBeGreaterThanOrEqual(BigInt(0));

    expect(inMemoryUsers[DEF_ID].gold).toBeGreaterThanOrEqual(BigInt(0));
  });

  test('edge case: maximum BigInt gold handling during pillage and DB writes', async () => {
    const DEF_ID = 20;
    const ATT_ID = 21;

    const huge = BigInt('9223372036854775807');
    createMockUser({ id: DEF_ID, gold: huge, displayName: 'Defender-Huge' });
    createMockUser({
      id: ATT_ID,
      gold: BigInt(0),
      displayName: 'Attacker-Huge',
      units: normUnits([{ type: 'OFFENSE', quantity: 200, level: 1 }]),
    });

    mockExecuteAttackFn.mockResolvedValue({
      pillagedGold: BigInt('1000000000000000000'),
      result: 'WIN',
      experienceGained: { attacker: 0, defender: 0 },
      Losses: {
        Attacker: { units: [], total: 0 },
        Defender: { units: [], total: 0 },
      },
      finalFortHP: 10,
    });

    const res = await AttackService.executeAttack(ATT_ID, DEF_ID, 1);
    expect(res.status).toBe('success');

    const lastBank = createdBankHistory[createdBankHistory.length - 1];
    const amt = BigInt(String(lastBank.gold_amount || '0'));
    expect(amt).toBeGreaterThan(BigInt(0));
    expect(amt).toBeLessThanOrEqual(huge);

    expect(inMemoryUsers[DEF_ID].gold).toBeGreaterThanOrEqual(BigInt(0));
  });

  test('regression property-like randomized checks for clamping correctness (multiple samples)', async () => {
    const samples = 40;
    for (let i = 0; i < samples; i++) {
      const defId = 1000 + i * 2;
      const attId = defId + 1;
      const startGold = BigInt(Math.floor(Math.random() * 1000000));
      createMockUser({
        id: defId,
        gold: startGold,
        displayName: `Def-${defId}`,
      });
      createMockUser({
        id: attId,
        gold: BigInt(0),
        displayName: `Att-${attId}`,
        units: normUnits([
          { type: 'OFFENSE', quantity: 20 + (i % 30), level: 1 },
        ]),
      });

      const pillageAttempt = startGold * BigInt(Math.floor(Math.random() * 3));
      mockExecuteAttackFn.mockResolvedValueOnce({
        pillagedGold: pillageAttempt,
        result: 'WIN',
        experienceGained: { attacker: 0, defender: 0 },
        Losses: {
          Attacker: { units: [], total: 0 },
          Defender: { units: [], total: 0 },
        },
        finalFortHP: 5,
      });

      const res = await AttackService.executeAttack(attId, defId, 1);
      expect(res.status).toBe('success');

      const bank = createdBankHistory.pop();
      const applied = bank
        ? BigInt(String(bank.gold_amount || '0'))
        : BigInt(0);

      expect(applied).toBeLessThanOrEqual(startGold);
      expect(inMemoryUsers[defId].gold).toBeGreaterThanOrEqual(BigInt(0));
    }
  }, 60000);
});
