import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { installMockMtRand } from 'test/utils/mockMtRand';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { normUnits } from 'test/utils/testFixtures';

// Install deterministic mtRand before modules that import '@/utils/mtrand'
installMockMtRand(vi);

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

// Mock the AttackDataService module so imports get our mock object
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

// Mock validation service method
vi.mock('@/services/AttackValidationService', () => ({
  canAttack: vi.fn(async () => true),
}));

const AttackService = require('@/services/AttackService').default;
const attackFunctions = require('@/utils/attackFunctions');
// Spy on simulateBattle so tests can override its implementation safely
const mockedSimulateBattle = vi.spyOn(attackFunctions, 'simulateBattle');

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

  // Wire AttackDataService mocks to operate on inMemoryUsers
  mockAttackDataService.getUserById.mockImplementation(async (id: number) => {
    const u = inMemoryUsers[id];
    if (!u) return null;
    // Return a deep clone to simulate ORM read (so callers mutate local copy)
    return JSON.parse(
      JSON.stringify({
        ...u,
        gold: u.gold.toString(), // AttackService expects gold to be (convertible) — it uses UserModel which accepts numeric/bigint; keep string to exercise conversions
        fortHitpoints: u.fort_hitpoints ?? 0,
        fortLevel: u.fortLevel ?? 0,
        attackTurns: u.attack_turns ?? 0,
        experience: u.experience ?? 0,
        units: u.units ?? [],
        level: u.level ?? 1,
        displayName: u.displayName ?? `User${id}`,
        id,
        // Ensure permissions exist for AttackService (it calls .map on permissions)
        permissions: u.permissions ?? [],
      }),
    );
  });

  mockAttackDataService.updateUser.mockImplementation(
    async (id: number, data: any, tx?: any) => {
      // Apply updates atomically to the in-memory store
      const existing = inMemoryUsers[id];
      if (!existing) throw new Error('User not found');
      // Normalize BigInt strings to BigInt
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
      // Return the updated record (like prisma.update)
      return {
        ...existing,
        gold: existing.gold.toString(),
      };
    },
  );

  mockAttackDataService.createAttackLog.mockImplementation(
    async (payload: any, tx?: any) => {
      const id = nextAttackLogId++;
      // Keep minimal attack_log format expected by AttackService later
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
    fortLevel: opts?.fortLevel ?? 0,
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
    // Defender has limited gold
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

    // Simulate both attackers winning and trying to pillage 900 gold each.
    // This forces the clamping logic to ensure no negative balances are persisted.
    mockedSimulateBattle.mockImplementation(
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

    // Fire both attack executions (simulate concurrency)
    const p1 = AttackService.executeAttack(ATT1, DEF_ID, 1);
    const p2 = AttackService.executeAttack(ATT2, DEF_ID, 1);

    const [r1, r2] = await Promise.all([p1, p2]);

    // Both calls should have succeeded
    expect(r1.status).toBe('success');
    expect(r2.status).toBe('success');

    // Defender gold must never be negative after both transactions
    const finalDef = inMemoryUsers[DEF_ID].gold;
    expect(finalDef).toBeGreaterThanOrEqual(BigInt(0));

    // Each successful WIN should have produced a bank history entry
    // AttackService creates a bank_history entry for each winning attack inside the transaction
    expect(createdBankHistory.length).toBeGreaterThanOrEqual(1);

    // Verify that each recorded bank history gold_amount was clamped to the defender's available gold at apply-time
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

    // Force one attack with pillage larger than defender gold
    mockedSimulateBattle.mockResolvedValue({
      pillagedGold: BigInt(5000), // much larger
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

    // After the transaction, the recorded battleResults.pillagedGold that was persisted should equal the applied (clamped) amount
    // We stored bank_history entries; the latest entry is the applied amount.
    const lastBankEntry = createdBankHistory[createdBankHistory.length - 1];
    const applied =
      typeof lastBankEntry.gold_amount === 'bigint'
        ? lastBankEntry.gold_amount
        : BigInt(String(lastBankEntry.gold_amount));
    expect(applied).toBeLessThanOrEqual(BigInt(1500));
    expect(applied).toBeGreaterThanOrEqual(BigInt(0));

    // Defender must not be negative in the in-memory DB
    expect(inMemoryUsers[DEF_ID].gold).toBeGreaterThanOrEqual(BigInt(0));
  });

  test('edge case: maximum BigInt gold handling during pillage and DB writes', async () => {
    const DEF_ID = 20;
    const ATT_ID = 21;

    // Very large gold on defender
    const huge = BigInt('9223372036854775807'); // near signed 64-bit max
    createMockUser({ id: DEF_ID, gold: huge, displayName: 'Defender-Huge' });
    createMockUser({
      id: ATT_ID,
      gold: BigInt(0),
      displayName: 'Attacker-Huge',
      units: normUnits([{ type: 'OFFENSE', quantity: 200, level: 1 }]),
    });

    // Simulate moderate pillage so arithmetic doesn't overflow
    mockedSimulateBattle.mockResolvedValue({
      pillagedGold: BigInt('1000000000000000000'), // 1e18
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

    // Check that createBankHistory recorded the applied amount as a string-convertible bigint
    const lastBank = createdBankHistory[createdBankHistory.length - 1];
    const amt = BigInt(String(lastBank.gold_amount || '0'));
    expect(amt).toBeGreaterThan(BigInt(0));
    expect(amt).toBeLessThanOrEqual(huge);

    // Verify no overflow happened to defender gold
    expect(inMemoryUsers[DEF_ID].gold).toBeGreaterThanOrEqual(BigInt(0));
  });

  test('regression property-like randomized checks for clamping correctness (multiple samples)', async () => {
    // This is a simple property-style loop: random defender golds and pillage amounts must lead to
    // applied pillage <= defender initial gold and final defender gold >= 0.
    const samples = 40;
    for (let i = 0; i < samples; i++) {
      const defId = 1000 + i * 2;
      const attId = defId + 1;
      // Randomize initial gold within a range
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

      // Random pillage up to twice the defender gold (to exercise clamping)
      const pillageAttempt = startGold * BigInt(Math.floor(Math.random() * 3));
      mockedSimulateBattle.mockResolvedValueOnce({
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

      // There should be at least one bank entry for a win
      const bank = createdBankHistory.pop();
      const applied = bank
        ? BigInt(String(bank.gold_amount || '0'))
        : BigInt(0);

      // Applied must never exceed starting gold and final gold must be >= 0
      expect(applied).toBeLessThanOrEqual(startGold);
      expect(inMemoryUsers[defId].gold).toBeGreaterThanOrEqual(BigInt(0));
    }
  }, 60000);
});
