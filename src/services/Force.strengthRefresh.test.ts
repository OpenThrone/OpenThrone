import { describe, expect, it, mock } from 'bun:test';

import { returnForceInTx } from '@/services/ForceLifecycle.service';
import { MercenaryService } from '@/services/Mercenary.service';

const now = new Date('2026-10-28T12:00:00Z');

const player = {
  id: 7,
  experience: 0,
  fort_level: 1,
  fort_hitpoints: 50,
  race: 'HUMAN',
  class: 'FIGHTER',
  currentEraId: 2,
  wounded_units: [],
  UserUnit: [{ type: 'OFFENSE', level: 1, quantity: 10 }],
  UserItem: [],
  UserStructureUpgrade: [],
  UserBattleUpgrade: [],
  UserBonusPoints: [],
  // The ended contract is no longer active, so the roster is owned troops only.
  forceContracts: [],
};

const contract = {
  id: 11,
  userId: 7,
  kind: 'MERCENARY',
  status: 'ACTIVE',
  type: 'OFFENSE',
  level: 1,
  eraId: 2,
  survivingQuantity: 100,
  expiresAt: new Date(now.getTime() - 1000),
};

const stubTx = () => {
  const update = mock(async () => null);
  const tx = {
    users: {
      findUnique: mock(async () => player),
      findUniqueOrThrow: mock(async () => player),
      update,
    },
    forceContract: {
      findMany: mock(async () => [contract]),
      update: mock(async () => null),
    },
    forceEvent: { create: mock(async () => null) },
  } as any;
  return { tx, update };
};

const strengthWrites = (update: ReturnType<typeof mock>) =>
  update.mock.calls.filter(
    (call: any[]) => call[0]?.data?.offense !== undefined,
  );

describe('stored strength follows temporary forces', () => {
  it('recomputes strength when a mercenary contract expires', async () => {
    const { tx, update } = stubTx();
    await MercenaryService.expireInTx(tx, 7, now);
    const writes = strengthWrites(update);
    expect(writes).toHaveLength(1);
    expect(writes[0][0].data.offense).toBeGreaterThan(0);
  });

  it('recomputes strength when a contract is dismissed or returned', async () => {
    const { tx, update } = stubTx();
    await returnForceInTx(tx, contract as any, 'DISMISSED', now);
    expect(strengthWrites(update)).toHaveLength(1);
  });

  it('skips the recompute when nothing expired', async () => {
    const { tx, update } = stubTx();
    tx.forceContract.findMany = mock(async () => []);
    await MercenaryService.expireInTx(tx, 7, now);
    expect(strengthWrites(update)).toHaveLength(0);
  });
});
