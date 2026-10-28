import { beforeEach, describe, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'crypto';

import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { cancelAllianceForceRequest } from '@/services/AllianceForceExtension.service';
import { BattleService } from '@/services/Battle.service';
import { divertForcePillageInTx } from '@/services/ForcePillage.service';
import { MercenaryService } from '@/services/Mercenary.service';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import { SpyService } from '@/services/SpyService';
import { TemporaryForceLedgerService as Ledger } from '@/services/TemporaryForceLedger.service';
import { createUser } from '@/services/User.service';
import { parseCombatReplay } from '@/utils/combatReplay';
import { parseForceLoadout } from '@/utils/temporaryForces';

import { resetDatabase } from './db';

let borrowerId: number;
let eraId: number;
const kit = parseForceLoadout(
  'OFFENSE',
  [
    ...new Set(
      ItemTypes.filter((item) => item.usage === 'OFFENSE').map(
        (item) => item.type,
      ),
    ),
  ].map((type) => ({ type, level: 1 })),
);
async function source(
  index: number,
  mode: 'MANUAL' | 'ROLE_ALLOWANCE' = 'ROLE_ALLOWANCE',
) {
  const leader = await createUser(
    `leader-${index}@example.test`,
    'synthetic',
    `Leader ${index}`,
    'HUMAN',
    'FIGHTER',
  );
  const alliance = await prisma.alliances.create({
    data: {
      name: `Source ${index}`,
      leader_id: leader.id,
      alliance_roles: { create: { name: 'Member' } },
    },
    include: { alliance_roles: true },
  });
  const roleId = alliance.alliance_roles[0]!.id;
  await prisma.alliance_memberships.createMany({
    data: [leader.id, borrowerId].map((user_id) => ({
      alliance_id: alliance.id,
      user_id,
      role_id: roleId,
    })),
  });
  const reserve = await prisma.forceReserve.create({
    data: {
      allianceId: alliance.id,
      eraId,
      type: 'OFFENSE',
      level: 1,
      equipment: kit,
      loadoutKey: createHash('sha256')
        .update(JSON.stringify(kit))
        .digest('hex'),
      available: 100,
    },
  });
  await Ledger.savePolicy(alliance.id, leader.id, {
    lendingMode: mode,
    roleAllowances: [
      {
        roleId,
        maxBorrowed: 10,
        maxTermDays: 7,
        pillageRateBps: 2000,
        loanRateBps: 1000,
      },
    ],
  });
  return {
    allianceId: alliance.id,
    leaderId: leader.id,
    reserveId: reserve.id,
    roleId,
  };
}
const borrow = (
  source: { allianceId: number; reserveId: number },
  quantity = 10,
) =>
  Ledger.requestLoan({
    allianceId: source.allianceId,
    reserveId: source.reserveId,
    userId: borrowerId,
    quantity,
    termDays: 1,
    operationId: randomUUID(),
  });
beforeEach(async () => {
  await resetDatabase();
  const borrower = await createUser(
    'safety-member@example.test',
    'synthetic',
    'Safety member',
    'HUMAN',
    'FIGHTER',
  );
  borrowerId = borrower.id;
  eraId = borrower.currentEraId!;
  await prisma.users.update({
    where: { id: borrowerId },
    data: { fort_level: 12, gold: 1000000000n, economy_level: 6 },
  });
  // Trained army backing the mercenary share cap; OFFENSE never joins
  // the spy mission hired below. createUser seeded a zero-quantity row.
  await prisma.userUnit.updateMany({
    where: {
      userId: borrowerId,
      type: 'OFFENSE',
      level: 1,
      isMercenary: false,
    },
    data: { quantity: 200 },
  });
});
describe('temporary force adversarial boundaries', () => {
  test('three alliance role caps are independent while total pillage contributions stop at 25%', async () => {
    const sources = [];
    for (let i = 1; i <= 3; i++) sources.push(await source(i));
    for (const source of sources)
      expect((await borrow(source)).status).toBe('ACTIVE');
    const amount = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${borrowerId} FOR UPDATE`;
      return divertForcePillageInTx(tx, borrowerId, 10001n, 200);
    });
    expect(amount).toBe(2500n);
    const credits = await prisma.forceEvent.findMany({
      where: { action: 'PILLAGE_PENDING' },
      orderBy: { operationKey: 'asc' },
    });
    expect(credits.reduce((sum, event) => sum + event.gold, 0n)).toBe(2500n);
    const first = credits.find(
      (credit) =>
        (credit.details as { allianceId: number }).allianceId ===
        sources[0]!.allianceId,
    );
    expect(first!.gold).toBe(834n);
  });
  test('pending manual approvals obey reduced current role caps', async () => {
    const pool = await source(1, 'MANUAL');
    const request = await borrow(pool);
    await Ledger.savePolicy(pool.allianceId, pool.leaderId, {
      roleAllowances: [
        {
          roleId: pool.roleId,
          maxBorrowed: 5,
          maxTermDays: 7,
          pillageRateBps: 0,
          loanRateBps: 0,
        },
      ],
    });
    await expect(
      Ledger.approveLoan({
        contractId: request.id,
        actorId: pool.leaderId,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('limit');
    expect(
      (
        await prisma.forceReserve.findUniqueOrThrow({
          where: { id: pool.reserveId },
        })
      ).available,
    ).toBe(100);
  });
  test('cancellation racing approval either activates once or leaves all stock untouched', async () => {
    const pool = await source(1, 'MANUAL');
    const request = await borrow(pool);
    const results = await Promise.allSettled([
      cancelAllianceForceRequest(request.id, borrowerId, randomUUID()),
      Ledger.approveLoan({
        contractId: request.id,
        actorId: pool.leaderId,
        operationId: randomUUID(),
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const contract = await prisma.forceContract.findUniqueOrThrow({
      where: { id: request.id },
    });
    const reserve = await prisma.forceReserve.findUniqueOrThrow({
      where: { id: pool.reserveId },
    });
    expect(reserve.available).toBe(contract.status === 'ACTIVE' ? 90 : 100);
  });
  test('an old-era pool cannot finance a new-era borrower', async () => {
    const pool = await source(1);
    const next = await prisma.era.create({
      data: { name: 'Next test era', startDate: new Date() },
    });
    await prisma.users.update({
      where: { id: borrowerId },
      data: { currentEraId: next.id },
    });
    await expect(borrow(pool)).rejects.toThrow('reserve');
    expect(
      (
        await prisma.forceReserve.findUniqueOrThrow({
          where: { id: pool.reserveId },
        })
      ).available,
    ).toBe(100);
  });
  test('contract spies execute a live mission and keep their bundled kit in an immutable replay', async () => {
    await prisma.serverSetting.create({
      data: {
        key: 'ENABLE_INTEL',
        label: 'Intel test',
        type: 'BOOLEAN',
        value: true,
      },
    });
    invalidateRuntimeConfigCache();
    const defender = await createUser(
      'spy-target@example.test',
      'synthetic',
      'Spy target',
      'HUMAN',
      'FIGHTER',
    );
    await prisma.userUnit.updateMany({
      where: { userId: defender.id, type: 'SENTRY' },
      data: { quantity: 100 },
    });
    const contract = await MercenaryService.hire({
      userId: borrowerId,
      type: 'SPY',
      level: 1,
      quantity: 50,
      termDays: 1,
      operationId: randomUUID(),
    });
    const result = await SpyService.executeSpyMission(
      borrowerId,
      defender.id,
      10,
      'INTEL',
      undefined,
      1,
    );
    expect(result).toMatchObject({ status: 'success' });
    const log = await prisma.attack_log.findFirstOrThrow();
    const replay = parseCombatReplay((log.stats as { replay: unknown }).replay);
    expect(replay.attacker.mercenaries[0]!.forceContractId).toBe(contract.id);
    expect(replay.attacker.mercenaries[0]!.forceEquipment).toHaveLength(5);
    expect((await BattleService.retestBattle(log.id)).exactReplay).toBe(true);
    expect(
      await prisma.userUnit.count({
        where: { userId: borrowerId, isMercenary: true },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: contract.id },
        })
      ).survivingQuantity,
    ).toBeLessThanOrEqual(50);
  });
});
