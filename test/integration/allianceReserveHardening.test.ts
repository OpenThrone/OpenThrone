/**
 * Review round 1 for #13: reserved alliances must grant and collect nothing
 * however they got reserved, and rollover must not leave old-era gold behind.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import { ItemTypes } from '@/constants';
import { emptyAlliancePermissions } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import { AllianceService } from '@/services/Alliance.service';
import { ALLIANCE_BANK_TX_OPTIONS } from '@/services/AllianceBank.service';
import {
  AllianceLoanService,
  assertNoDefaultedLoan,
  divertIncomeToLoans,
  settleLoanTreasuryCredits,
} from '@/services/AllianceLoan.service';
import { setAllianceStatusAsAdmin } from '@/services/AllianceReactivation.service';
import { AllianceReservedError } from '@/services/allianceStatus';
import { AllianceWarService } from '@/services/AllianceWar.service';
import { getUserById } from '@/services/AttackDataService';
import { AttackService } from '@/services/AttackService';
import { resetCurrentEra } from '@/services/CurrentEraReset.service';
import { allowedInstantAlerts } from '@/services/discord/DiscordAlerts.service';
import { ensureActiveEra, startNewEra } from '@/services/Era.service';
import { TemporaryForceLedgerService as Ledger } from '@/services/TemporaryForceLedger.service';
import { createUser } from '@/services/User.service';
import {
  lockEraLifecycle,
  lockEraLifecycleShared,
} from '@/utils/eraLifecycleLock';

import { resetDatabase, setRuntimeSwitch } from './db';

const LEVEL_10_XP = 76000;
const DAY_MS = 86_400_000;

let leaderId: number;
let memberId: number;
let otherId: number;
let allianceId: number;
let roleId: number;

const makeUser = async (name: string) =>
  (
    await createUser(
      `${name}@example.test`,
      'synthetic',
      name,
      'HUMAN',
      'FIGHTER',
    )
  ).id;

const seed = async () => {
  await resetDatabase();
  await ensureActiveEra();
  leaderId = await makeUser('Leader');
  memberId = await makeUser('Member');
  otherId = await makeUser('Other');
  const alliance = await prisma.alliances.create({
    data: {
      name: 'Hardening alliance',
      leader_id: leaderId,
      alliance_roles: {
        create: {
          name: 'Member',
          permissions: { ...emptyAlliancePermissions(), request_gold: true },
        },
      },
    },
    include: { alliance_roles: true },
  });
  allianceId = alliance.id;
  roleId = alliance.alliance_roles[0]!.id;
  await prisma.alliance_memberships.createMany({
    data: [leaderId, memberId].map((user_id) => ({
      alliance_id: allianceId,
      user_id,
      role_id: roleId,
    })),
  });
  await prisma.users.updateMany({
    where: { id: { in: [leaderId, memberId, otherId] } },
    data: { gold: 50_000_000n, experience: LEVEL_10_XP },
  });
};

const treasury = async () =>
  (await prisma.alliances.findUniqueOrThrow({ where: { id: allianceId } }))
    .gold_in_bank;

describe('S1: parked loan repayments do not survive the treasury wipe', () => {
  beforeEach(async () => {
    await seed();
    await prisma.alliance_loans.createMany({
      data: [
        {
          alliance_id: allianceId,
          borrower_id: memberId,
          principal: 1_000_000n,
          interest_pct: 10,
          amount_owed: 1_100_000n,
          amount_repaid: 1_100_000n,
          pending_treasury_credit: 700_000n,
          status: 'REPAID',
        },
        {
          alliance_id: allianceId,
          borrower_id: memberId,
          principal: 1_000_000n,
          interest_pct: 10,
          amount_owed: 1_100_000n,
          amount_repaid: 300_000n,
          pending_treasury_credit: 300_000n,
          status: 'ACTIVE',
        },
      ],
    });
  });

  const expectNothingRestored = async () => {
    expect(
      (await prisma.alliance_loans.findMany()).map(
        (l) => l.pending_treasury_credit,
      ),
    ).toEqual([0n, 0n]);
    await settleLoanTreasuryCredits();
    expect(await treasury()).toBe(0n);
    expect(
      await prisma.alliance_bank_history.count({
        where: { transaction_type: 'LOAN_REPAYMENT' },
      }),
    ).toBe(0);
  };

  test('after an era rollover', async () => {
    await startNewEra();
    await expectNothingRestored();
  });

  test('after a current-era reset', async () => {
    await setRuntimeSwitch('DISABLE_LOGIN', true);
    const era = await ensureActiveEra();
    await resetCurrentEra({
      eraId: era.id,
      expectedEraStartDate: era.startDate,
      confirmation: `RESET ERA ${era.id}`,
      adminUserId: leaderId,
      ip: '127.0.0.1',
    });
    await expectNothingRestored();
  });

  test('a reserved treasury takes no settlement even when credits are parked', async () => {
    await prisma.alliances.update({
      where: { id: allianceId },
      data: { status: 'RESERVED', gold_in_bank: 1000n },
    });
    await settleLoanTreasuryCredits();
    expect(await treasury()).toBe(1000n);
    expect(
      (
        await prisma.alliance_loans.aggregate({
          _sum: { pending_treasury_credit: true },
        })
      )._sum.pending_treasury_credit,
    ).toBe(1_000_000n);
  });
});

describe('S2: reserved sponsorship grants no premium war alerts', () => {
  beforeEach(seed);

  test('a member without a personal entitlement loses the perk while reserved', async () => {
    await prisma.allianceSponsorship.create({
      data: {
        allianceId,
        poolCents: 0,
        activeUntil: new Date(Date.now() + 30 * DAY_MS),
      },
    });
    expect(await allowedInstantAlerts(memberId)).toEqual(['wars']);
    await prisma.alliances.update({
      where: { id: allianceId },
      data: { status: 'RESERVED' },
    });
    expect(await allowedInstantAlerts(memberId)).toEqual([]);
  });
});

describe('S3: any RESERVED alliance grants no forces and collects nothing', () => {
  const equipment = [
    ...new Set(
      ItemTypes.filter((item) => item.usage === 'OFFENSE').map(
        (item) => item.type,
      ),
    ),
  ].map((type) => ({ type, level: 1 }));

  beforeEach(async () => {
    await seed();
    for (const userId of [leaderId, memberId]) {
      await prisma.users.update({
        where: { id: userId },
        data: { fort_level: 12 },
      });
      await prisma.userStructureUpgrade.updateMany({
        where: { userId, type: 'ARMORY' },
        data: { level: 12 },
      });
      await prisma.userUnit.updateMany({
        where: { userId, type: 'OFFENSE', level: 1 },
        data: { quantity: 100 },
      });
      for (const item of equipment)
        await prisma.userItem.upsert({
          where: {
            userId_type_usage_level: {
              userId,
              type: item.type,
              level: 1,
              usage: 'OFFENSE',
            },
          },
          create: {
            userId,
            type: item.type,
            level: 1,
            usage: 'OFFENSE',
            quantity: 100,
          },
          update: { quantity: 100 },
        });
    }
    await Ledger.savePolicy(allianceId, leaderId, {
      lendingMode: 'ROLE_ALLOWANCE',
      roleAllowances: [
        {
          roleId,
          maxBorrowed: 100,
          maxTermDays: 7,
          pillageRateBps: 0,
          loanRateBps: 0,
        },
      ],
    });
    const donor = await prisma.userUnit.findFirstOrThrow({
      where: { userId: leaderId, type: 'OFFENSE' },
    });
    await Ledger.contribute({
      allianceId,
      userId: leaderId,
      unitId: donor.id,
      quantity: 10,
      equipment,
      operationId: randomUUID(),
    });
    const reserve = await prisma.forceReserve.findFirstOrThrow({
      where: { allianceId },
    });
    await Ledger.requestLoan({
      allianceId,
      userId: memberId,
      reserveId: reserve.id,
      quantity: 8,
      termDays: 3,
      operationId: randomUUID(),
    });
    await prisma.alliance_loans.create({
      data: {
        alliance_id: allianceId,
        borrower_id: memberId,
        principal: 1_000_000n,
        interest_pct: 10,
        amount_owed: 1_100_000n,
        status: 'ACTIVE',
        due_at: new Date(Date.now() + DAY_MS),
      },
    });
  });

  const lentTroops = async () =>
    ((await getUserById(memberId))?.UserUnit ?? []).filter(
      (unit: any) => unit.forceContractId,
    );
  const asAdmin = (target: 'ACTIVE' | 'RESERVED') =>
    prisma.$transaction((tx) =>
      setAllianceStatusAsAdmin(tx, allianceId, target, leaderId),
    );
  const memberGold = async () =>
    (await prisma.users.findUniqueOrThrow({ where: { id: memberId } })).gold;

  test('admin reserve removes lent troops from battle strength and stored stats', async () => {
    expect(await lentTroops()).not.toHaveLength(0);
    const before = (
      await prisma.users.findUniqueOrThrow({ where: { id: memberId } })
    ).offense;
    await asAdmin('RESERVED');
    expect(await lentTroops()).toHaveLength(0);
    const reservedOffense = (
      await prisma.users.findUniqueOrThrow({ where: { id: memberId } })
    ).offense;
    expect(reservedOffense).toBeLessThan(before as number);
    await asAdmin('ACTIVE');
    expect(await lentTroops()).not.toHaveLength(0);
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: memberId } }))
        .offense,
    ).toBe(before);
  });

  test('loans collect nothing while reserved and resume on reactivation', async () => {
    const gold = await memberGold();
    // Active: income is diverted.
    expect(
      await prisma.$transaction((tx) =>
        divertIncomeToLoans(tx, memberId, 1000n, 'economy'),
      ),
    ).toBeGreaterThan(0n);
    await asAdmin('RESERVED');
    expect(
      await prisma.$transaction((tx) =>
        divertIncomeToLoans(tx, memberId, 1000n, 'economy'),
      ),
    ).toBe(0n);

    // Overdue loans are neither seized nor defaulted while reserved.
    await prisma.alliance_loans.updateMany({
      data: { due_at: new Date(Date.now() - DAY_MS) },
    });
    const outcome = await AllianceLoanService.processOverdueLoans();
    expect(outcome).toMatchObject({ checked: 0 });
    expect(await memberGold()).toBe(gold);
    expect(
      (await prisma.alliance_loans.findMany({ orderBy: { id: 'asc' } })).map(
        (l) => l.status,
      ),
    ).toEqual(['ACTIVE']);

    // A defaulted loan of a reserved lender does not block banking.
    await prisma.alliance_loans.updateMany({ data: { status: 'DEFAULTED' } });
    await prisma.$transaction((tx) =>
      assertNoDefaultedLoan(tx, memberId, 'blocked'),
    );
    await prisma.alliance_loans.updateMany({ data: { status: 'ACTIVE' } });

    // Resume: due dates move out by the reserved time, so nothing is overdue.
    await prisma.alliances.update({
      where: { id: allianceId },
      data: { status_changed_at: new Date(Date.now() - 2 * DAY_MS) },
    });
    await asAdmin('ACTIVE');
    const loan = await prisma.alliance_loans.findFirstOrThrow();
    expect(loan.due_at!.getTime()).toBeGreaterThan(Date.now() + 0.9 * DAY_MS);
    expect(await AllianceLoanService.processOverdueLoans()).toMatchObject({
      checked: 0,
    });
  });

  test('leaving a reserved alliance keeps the paused debt; collection resumes on reactivation, the era boundary forgives', async () => {
    await asAdmin('RESERVED');
    await AllianceService.leaveAlliance(memberId, { allianceId });
    expect(
      await prisma.alliance_memberships.count({ where: { user_id: memberId } }),
    ).toBe(0);
    // The abuse path: borrow, reserve, leave, reactivate. The debt survives.
    expect((await prisma.alliance_loans.findFirstOrThrow()).status).toBe(
      'ACTIVE',
    );
    await prisma.alliances.update({
      where: { id: allianceId },
      data: { status_changed_at: new Date(Date.now() - 2 * DAY_MS) },
    });
    await asAdmin('ACTIVE');
    const loan = await prisma.alliance_loans.findFirstOrThrow();
    expect(loan.due_at!.getTime()).toBeGreaterThan(Date.now() + 0.9 * DAY_MS);

    // Income of the ex-member is diverted to the loan again.
    expect(
      await prisma.$transaction((tx) =>
        divertIncomeToLoans(tx, memberId, 1000n, 'economy'),
      ),
    ).toBeGreaterThan(0n);
    // And the overdue sweep seizes from the ex-member.
    await prisma.alliance_loans.updateMany({
      data: { due_at: new Date(Date.now() - DAY_MS) },
    });
    const goldBefore = await memberGold();
    expect(await AllianceLoanService.processOverdueLoans()).toMatchObject({
      checked: 1,
    });
    expect(await memberGold()).toBeLessThan(goldBefore);

    // Only the era boundary forgives.
    await prisma.alliance_loans.create({
      data: {
        alliance_id: allianceId,
        borrower_id: memberId,
        principal: 500_000n,
        interest_pct: 10,
        amount_owed: 550_000n,
        status: 'ACTIVE',
        due_at: new Date(Date.now() + DAY_MS),
      },
    });
    await startNewEra();
    const after = await prisma.alliance_loans.findMany({
      orderBy: { id: 'asc' },
    });
    expect(after.map((l) => l.status)).toEqual(['REPAID', 'WRITTEN_OFF']);
  });

  test('S3: manual repayment is refused while reserved and charges nothing', async () => {
    await asAdmin('RESERVED');
    const gold = await memberGold();
    await expect(
      AllianceLoanService.repay({
        allianceId,
        userId: memberId,
        amount: 1000n,
      }),
    ).rejects.toMatchObject({ code: 'ALLIANCE_RESERVED' });
    expect(await memberGold()).toBe(gold);
    expect(await treasury()).toBe(0n);
    expect((await prisma.alliance_loans.findFirstOrThrow()).amount_repaid).toBe(
      0n,
    );
    await asAdmin('ACTIVE');
    await AllianceLoanService.repay({
      allianceId,
      userId: memberId,
      amount: 1000n,
    });
    expect(await treasury()).toBe(1000n);
  });

  test('S8: a force-loan approval racing an admin reserve leaves no stale stored strength', async () => {
    await prisma.alliance_memberships.create({
      data: { alliance_id: allianceId, user_id: otherId, role_id: roleId },
    });
    await prisma.users.update({
      where: { id: otherId },
      data: { fort_level: 12 },
    });
    await prisma.userStructureUpgrade.updateMany({
      where: { userId: otherId, type: 'ARMORY' },
      data: { level: 12 },
    });
    // Fresh manual-lending request from the leader (borrower) to approve.
    await Ledger.savePolicy(allianceId, leaderId, {
      lendingMode: 'MANUAL',
      roleAllowances: [
        {
          roleId,
          maxBorrowed: 100,
          maxTermDays: 7,
          pillageRateBps: 0,
          loanRateBps: 0,
        },
      ],
    });
    const reserve = await prisma.forceReserve.findFirstOrThrow({
      where: { allianceId },
    });
    const requested = await Ledger.requestLoan({
      allianceId,
      userId: otherId,
      reserveId: reserve.id,
      quantity: 2,
      termDays: 3,
      operationId: randomUUID(),
    });
    const baseline = (
      await prisma.users.findUniqueOrThrow({ where: { id: otherId } })
    ).offense;

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockedP = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 30_000 },
    );
    await lockedP;
    // Approval queues first, the admin reserve second; both wait on the lock.
    const approval = Ledger.approveLoan({
      contractId: requested.id,
      actorId: leaderId,
      operationId: randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const reserveAlliance = prisma.$transaction(async (tx) => {
      await lockEraLifecycleShared(tx);
      return setAllianceStatusAsAdmin(tx, allianceId, 'RESERVED', leaderId);
    }, ALLIANCE_BANK_TX_OPTIONS);
    await new Promise((resolve) => setTimeout(resolve, 400));
    release();
    await blocker;
    await approval;
    await reserveAlliance;

    // The approved borrower's stored strength was refreshed by the reserve.
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: otherId } }))
        .offense,
    ).toBe(baseline);
  });
});

describe('S4: a war declaration cannot race a rollover', () => {
  beforeEach(seed);

  test('a declaration queued behind a rollover is refused and creates no war', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockedP = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // What the rollover holds: the lifecycle lock and every alliance row.
    const rollover = prisma.$transaction(
      async (tx) => {
        await lockEraLifecycle(tx);
        await tx.$queryRaw`SELECT id FROM alliances ORDER BY id FOR UPDATE`;
        locked();
        await held;
        await tx.alliances.updateMany({ data: { status: 'RESERVED' } });
      },
      { timeout: 30_000 },
    );
    await lockedP;
    const declaration = AllianceWarService.declareWar({
      allianceId,
      defenderUserId: otherId,
      declarerUserId: leaderId,
    });
    const state = await Promise.race([
      declaration.then(
        () => 'finished',
        () => 'finished',
      ),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 500)),
    ]);
    expect(state).toBe('waiting');
    release();
    await rollover;
    await expect(declaration).rejects.toBeInstanceOf(AllianceReservedError);
    expect(await prisma.alliance_wars.count()).toBe(0);
  });
});

describe('S5: a reserved alliance is not an alliance for attack confirmation', () => {
  beforeEach(seed);

  test('attacking a fellow member needs confirmation only while ACTIVE', async () => {
    await prisma.users.updateMany({
      where: { id: { in: [leaderId, memberId] } },
      data: { experience: LEVEL_10_XP + 5000 },
    });
    await prisma.userUnit.updateMany({
      where: { userId: leaderId, type: 'OFFENSE', level: 1 },
      data: { quantity: 500 },
    });
    const attack = () => AttackService.executeAttack(leaderId, memberId, 1);
    expect(await attack()).toMatchObject({
      code: 'ALLIANCE_MEMBER_CONFIRMATION_REQUIRED',
    });
    await prisma.alliances.update({
      where: { id: allianceId },
      data: { status: 'RESERVED' },
    });
    const result = await attack();
    expect((result as any).code).not.toBe(
      'ALLIANCE_MEMBER_CONFIRMATION_REQUIRED',
    );
  });
});
