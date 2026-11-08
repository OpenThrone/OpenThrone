import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import { emptyAlliancePermissions } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import { AllianceService } from '@/services/Alliance.service';
import { AllianceAnnouncementsService } from '@/services/AllianceAnnouncements.service';
import { AllianceBankService } from '@/services/AllianceBank.service';
import { AllianceDiplomacyService } from '@/services/AllianceDiplomacy.service';
import { AllianceGoldRequestService } from '@/services/AllianceGoldRequest.service';
import { AllianceIntelService } from '@/services/AllianceIntel.service';
import { AllianceInternalBattlesService } from '@/services/AllianceInternalBattles.service';
import { AllianceListsService } from '@/services/AllianceLists.service';
import { AllianceLoanService } from '@/services/AllianceLoan.service';
import {
  AllianceReactivationError,
  getReactivationProgress,
  reactivateAlliance,
} from '@/services/AllianceReactivation.service';
import { AllianceReservedError } from '@/services/allianceStatus';
import { AllianceWarService } from '@/services/AllianceWar.service';
import { getCurrentAllianceIds } from '@/services/AttackLogAccess.service';
import { resetCurrentEra } from '@/services/CurrentEraReset.service';
import { ensureActiveEra, startNewEra } from '@/services/Era.service';
import {
  createForceLevy,
  saveForceDuesRule,
} from '@/services/ForceDues.service';
import { processForceDuesDay } from '@/services/ForceDuesWorker.service';
import { divertForcePillageInTx } from '@/services/ForcePillage.service';
import { MessagingService } from '@/services/Messaging.service';
import { TemporaryForceLedgerService as Ledger } from '@/services/TemporaryForceLedger.service';
import { createUser } from '@/services/User.service';

import { resetDatabase, setRuntimeSwitch } from './db';

const LEVEL_10_XP = 76000;
const TREASURY = 5_000_000n;

let leaderId: number;
let memberId: number;
let otherMemberId: number;
let outsiderId: number;
let allianceId: number;
let rivalId: number;
let memberRoleId: number;

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

/** Era 1 with an active alliance: members, roles, treasury, loan, war, requests. */
const seed = async () => {
  await resetDatabase();
  await ensureActiveEra();
  leaderId = await makeUser('Leader');
  memberId = await makeUser('Member');
  otherMemberId = await makeUser('Other');
  outsiderId = await makeUser('Outsider');
  const rivalLeader = await makeUser('Rival');

  const alliance = await prisma.alliances.create({
    data: {
      name: 'Reserve alliance',
      leader_id: leaderId,
      gold_in_bank: TREASURY,
      avatar: 'https://example.test/crest.png',
      alliance_roles: {
        create: {
          name: 'Member',
          permissions: {
            ...emptyAlliancePermissions(),
            send_messages: true,
            view_list: true,
            request_gold: true,
            share_reports: true,
          },
        },
      },
    },
    include: { alliance_roles: true },
  });
  allianceId = alliance.id;
  memberRoleId = alliance.alliance_roles[0]!.id;
  await prisma.alliance_memberships.createMany({
    data: [leaderId, memberId, otherMemberId].map((user_id) => ({
      alliance_id: allianceId,
      user_id,
      role_id: memberRoleId,
    })),
  });
  const rival = await prisma.alliances.create({
    data: {
      name: 'Rival alliance',
      leader_id: rivalLeader,
      alliance_roles: { create: { name: 'Member' } },
    },
  });
  rivalId = rival.id;

  await prisma.users.updateMany({
    where: { id: { in: [leaderId, memberId, otherMemberId, outsiderId] } },
    data: { gold: 50_000_000n, experience: LEVEL_10_XP },
  });
  await prisma.alliance_loans.create({
    data: {
      alliance_id: allianceId,
      borrower_id: memberId,
      principal: 1_000_000n,
      interest_pct: 10,
      amount_owed: 1_100_000n,
      status: 'ACTIVE',
      due_at: new Date(Date.now() + 86_400_000),
    },
  });
  await prisma.alliance_gold_requests.create({
    data: {
      alliance_id: allianceId,
      requester_id: memberId,
      amount: 100_000n,
    },
  });
  await prisma.alliance_join_requests.create({
    data: { alliance_id: allianceId, user_id: outsiderId, kind: 'REQUEST' },
  });
  await prisma.alliance_wars.create({
    data: {
      attacker_alliance_id: allianceId,
      defender_alliance_id: rivalId,
      declared_by_user_id: leaderId,
      status: 'ACTIVE',
      start_at: new Date(),
    },
  });
};

const reserved = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(AllianceReservedError);

describe('ordinary era rollover reserves alliances', () => {
  beforeEach(seed);

  test('keeps identity, roster, roles and artwork; closes old-era state', async () => {
    await prisma.era.findFirstOrThrow({ where: { endDate: null } });
    const before = await prisma.alliances.count();
    const newEra = await startNewEra();

    expect(await prisma.alliances.count()).toBe(before);
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance).toMatchObject({
      name: 'Reserve alliance',
      leader_id: leaderId,
      avatar: 'https://example.test/crest.png',
      status: 'RESERVED',
      status_era_id: newEra.id,
    });
    expect(alliance.status_changed_at).not.toBeNull();
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: allianceId },
      }),
    ).toBe(3);
    expect(
      await prisma.alliance_roles.count({ where: { alliance_id: allianceId } }),
    ).toBe(1);

    // Treasury, loans, gold requests, join requests and wars belong to the old era.
    expect(alliance.gold_in_bank).toBe(0n);
    expect((await prisma.alliance_loans.findFirstOrThrow()).status).toBe(
      'WRITTEN_OFF',
    );
    expect(
      (await prisma.alliance_gold_requests.findFirstOrThrow()).status,
    ).toBe('CANCELLED');
    expect(
      (await prisma.alliance_join_requests.findFirstOrThrow()).status,
    ).toBe('CANCELLED');
    const war = await prisma.alliance_wars.findFirstOrThrow();
    expect(war.status).toBe('ENDED');
  });

  test('a second rollover leaves the alliance reserved and deletes nothing', async () => {
    const first = await startNewEra();
    await startNewEra();
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    // Still reserved, and still dated from the era that reserved it.
    expect(alliance.status).toBe('RESERVED');
    expect(alliance.status_era_id).toBe(first.id);
    expect(await prisma.alliances.count()).toBe(2);
  });

  test('an ordinary current-era reset also reserves and keeps alliances', async () => {
    await setRuntimeSwitch('DISABLE_LOGIN', true);
    const era = await ensureActiveEra();
    await resetCurrentEra({
      eraId: era.id,
      expectedEraStartDate: era.startDate,
      confirmation: `RESET ERA ${era.id}`,
      adminUserId: leaderId,
      ip: '127.0.0.1',
    });
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance).toMatchObject({ status: 'RESERVED', gold_in_bank: 0n });
    expect(await prisma.alliance_memberships.count()).toBe(3);
    // The ordinary phrase never authorises a factory restore.
    await expect(
      resetCurrentEra({
        eraId: era.id,
        expectedEraStartDate: (await ensureActiveEra()).startDate,
        confirmation: `RESET ERA ${era.id}`,
        factoryRestore: true,
        adminUserId: leaderId,
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Explicit confirmation');
    expect(await prisma.alliances.count()).toBe(2);
  });
});

describe('a reserved alliance refuses every alliance feature', () => {
  beforeEach(async () => {
    await seed();
    await startNewEra();
    await prisma.users.updateMany({
      where: { id: { in: [leaderId, memberId, otherMemberId, outsiderId] } },
      data: { gold: 50_000_000n },
    });
  });

  test('treasury: deposit, transfer, gold requests, loans, settings', async () => {
    await reserved(
      AllianceBankService.deposit({
        allianceId,
        userId: memberId,
        amount: 1000n,
      }),
    );
    await reserved(
      AllianceBankService.transfer({
        allianceId,
        requesterId: leaderId,
        targetUserId: memberId,
        amount: 1000n,
      }),
    );
    await reserved(
      AllianceGoldRequestService.create({
        allianceId,
        userId: memberId,
        amount: 1000n,
      }),
    );
    await reserved(
      AllianceLoanService.request({
        allianceId,
        userId: memberId,
        amount: 1000n,
      }),
    );
    await reserved(
      AllianceLoanService.updateTreasurySettings(allianceId, leaderId, {
        loan_interest_pct: 5,
      }),
    );
    expect(
      (await prisma.alliances.findUniqueOrThrow({ where: { id: allianceId } }))
        .gold_in_bank,
    ).toBe(0n);
  });

  test('recruiting: join, request, invite, accept, respond', async () => {
    await reserved(
      AllianceService.joinAlliance(outsiderId, { allianceId } as any),
    );
    await reserved(AllianceService.createJoinRequest(outsiderId, allianceId));
    await reserved(
      AllianceService.invitePlayer(leaderId, allianceId, 'Outsider'),
    );
    const request = await prisma.alliance_join_requests.create({
      data: { alliance_id: allianceId, user_id: outsiderId, kind: 'REQUEST' },
    });
    await reserved(AllianceService.acceptJoinRequest(request.id, leaderId));
    // One pending row per (alliance, player): clear the request before the invite.
    await prisma.alliance_join_requests.update({
      where: { id: request.id },
      data: { status: 'CANCELLED' },
    });
    const invite = await prisma.alliance_join_requests.create({
      data: {
        alliance_id: allianceId,
        user_id: outsiderId,
        kind: 'INVITE',
        invited_by: leaderId,
      },
    });
    await reserved(
      AllianceService.respondToInvite(invite.id, outsiderId, true),
    );
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: allianceId },
      }),
    ).toBe(3);
  });

  test('profile edits, wars, diplomacy, intel, lists, announcements, internal battles', async () => {
    await reserved(
      AllianceService.updateAlliance(allianceId, leaderId, {
        motto: 'Reserved',
      } as any),
    );
    await reserved(
      AllianceWarService.declareWar({
        allianceId,
        defenderAllianceId: rivalId,
        declarerUserId: leaderId,
      }),
    );
    await reserved(
      AllianceDiplomacyService.sendRequest(leaderId, {
        allianceId,
        targetAllianceId: rivalId,
      }),
    );
    await reserved(
      AllianceIntelService.createCall(leaderId, {
        allianceId,
        callType: 'HIT',
        targetUserId: outsiderId,
      }),
    );
    await reserved(
      AllianceListsService.addEntry(leaderId, {
        allianceId,
        listType: 'FARM',
        targetUserId: outsiderId,
      }),
    );
    await reserved(
      AllianceAnnouncementsService.create(leaderId, {
        allianceId,
        title: 'Hello',
        body: 'Still here',
      }),
    );
    await reserved(
      AllianceInternalBattlesService.list(leaderId, { allianceId }),
    );
  });

  test('force contracts, policy, levies and dues rules', async () => {
    await reserved(
      Ledger.savePolicy(allianceId, leaderId, {
        roleAllowances: [],
      }),
    );
    await reserved(
      Ledger.requestLoan({
        allianceId,
        userId: memberId,
        reserveId: 1,
        quantity: 1,
        termDays: 1,
        operationId: randomUUID(),
      }),
    );
    await reserved(
      Ledger.contribute({
        allianceId,
        userId: memberId,
        unitId: 1,
        quantity: 1,
        equipment: [],
        operationId: randomUUID(),
      }),
    );
    await reserved(
      createForceLevy(allianceId, leaderId, {
        title: 'Levy',
        userIds: [memberId],
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        terms: { amountGold: '1000', quantity: 0, type: null, level: null },
        operationId: randomUUID(),
      }),
    );
    await reserved(
      saveForceDuesRule(allianceId, leaderId, {
        roleId: memberRoleId,
        minLevel: 1,
        terms: { amountGold: '1000', quantity: 0, type: null, level: null },
        intervalDays: 7,
        dueDays: 3,
        enabled: true,
      }),
    );
  });

  test('the daily dues pass issues no levies and kicks nobody', async () => {
    await prisma.forceDuesRule.create({
      data: {
        allianceId,
        roleId: memberRoleId,
        amountGold: 1000n,
        enabled: true,
        nextIssueAt: new Date(Date.now() - 1000),
      },
    });
    await processForceDuesDay(new Date());
    expect(await prisma.forceObligation.count()).toBe(0);
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: allianceId },
      }),
    ).toBe(3);
  });

  test('alliance chat cannot be posted to', async () => {
    const room = await prisma.chatRoom.create({
      data: {
        name: 'Reserve alliance',
        isPrivate: true,
        allianceId,
        createdById: leaderId,
        participants: { create: [{ userId: memberId }, { userId: leaderId }] },
      },
    });
    await expect(
      MessagingService.sendMessage(memberId, room.id, {
        content: 'hello',
      } as any),
    ).rejects.toBeInstanceOf(AllianceReservedError);
    expect(await prisma.chatMessage.count({ where: { roomId: room.id } })).toBe(
      0,
    );
  });

  test('directory and profile hide the premium mark while reserved', async () => {
    await prisma.allianceSponsorship.create({
      data: {
        allianceId,
        poolCents: 0,
        activeUntil: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const detail = await AllianceService.getAllianceById(allianceId);
    expect(detail).toMatchObject({ status: 'RESERVED', isPremium: false });
    const listed = await AllianceService.getAllAlliances({} as any, leaderId);
    const entry = (listed as any[]).find((a) => a.id === allianceId);
    expect(entry).toMatchObject({ status: 'RESERVED', isPremium: false });
  });
});

describe('reserved alliances grant no advantages', () => {
  beforeEach(seed);

  const divert = () =>
    prisma.$transaction((tx) =>
      divertForcePillageInTx(tx, memberId, 1_000_000n, 'battle-1'),
    );

  test('pillage share, battle-page lists and shared reports stop; they return on reactivation', async () => {
    await Ledger.savePolicy(allianceId, leaderId, {
      roleAllowances: [
        {
          roleId: memberRoleId,
          maxBorrowed: 10,
          maxTermDays: 7,
          pillageRateBps: 500,
          loanRateBps: 0,
        },
      ],
    });
    await prisma.alliance_list_entries.create({
      data: {
        alliance_id: allianceId,
        list_type: 'FARM',
        target_user_id: outsiderId,
        added_by: leaderId,
      },
    });
    // Active: the pillage share, the list hit and the shared-report scope exist.
    expect(await divert()).toBeGreaterThan(0n);
    expect(
      Object.keys(
        await AllianceListsService.lookupTargets(memberId, [outsiderId]),
      ),
    ).toHaveLength(1);
    expect(await getCurrentAllianceIds(memberId)).toEqual([allianceId]);

    await startNewEra();
    await prisma.users.updateMany({ data: { gold: 50_000_000n } });
    expect(await divert()).toBe(0n);
    expect(
      await AllianceListsService.lookupTargets(memberId, [outsiderId]),
    ).toEqual({});
    expect(await getCurrentAllianceIds(memberId)).toEqual([]);

    await prisma.users.update({
      where: { id: leaderId },
      data: { experience: LEVEL_10_XP },
    });
    await reactivateAlliance({ allianceId, actorId: leaderId });
    expect(await getCurrentAllianceIds(memberId)).toEqual([allianceId]);
  });
});

describe('members of a reserved alliance can still leave and be managed', () => {
  beforeEach(async () => {
    await seed();
    await startNewEra();
  });

  test('a member leaves without the leader; the leader kicks and transfers', async () => {
    await AllianceService.leaveAlliance(memberId, { allianceId });
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: allianceId, user_id: memberId },
      }),
    ).toBe(0);

    await AllianceService.kickMember(allianceId, leaderId, {
      allianceId,
      memberId: otherMemberId,
    });
    expect(
      await prisma.alliance_memberships.count({
        where: { alliance_id: allianceId, user_id: otherMemberId },
      }),
    ).toBe(0);
    expect(
      (await prisma.alliances.findUniqueOrThrow({ where: { id: allianceId } }))
        .status,
    ).toBe('RESERVED');
  });
});

describe('reactivating a reserved alliance', () => {
  beforeEach(async () => {
    await seed();
    await startNewEra();
    // Rollover reset everyone to level 1 / starting gold.
  });

  const setLeader = (data: { experience?: number; gold?: bigint }) =>
    prisma.users.update({ where: { id: leaderId }, data });
  const status = async () =>
    (await prisma.alliances.findUniqueOrThrow({ where: { id: allianceId } }))
      .status;

  test('refuses below the level gate and charges nothing', async () => {
    await setLeader({ experience: 0, gold: 50_000_000n });
    await expect(
      reactivateAlliance({ allianceId, actorId: leaderId }),
    ).rejects.toMatchObject({ code: 'LEVEL_TOO_LOW' });
    expect(await status()).toBe('RESERVED');
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: leaderId } })).gold,
    ).toBe(50_000_000n);
  });

  test('refuses short of gold and charges nothing', async () => {
    await setLeader({ experience: LEVEL_10_XP, gold: 9_999_999n });
    await expect(
      reactivateAlliance({ allianceId, actorId: leaderId }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_GOLD' });
    expect(await status()).toBe('RESERVED');
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: leaderId } })).gold,
    ).toBe(9_999_999n);
  });

  test('only the leader can reactivate', async () => {
    await prisma.users.update({
      where: { id: memberId },
      data: { experience: LEVEL_10_XP, gold: 50_000_000n },
    });
    await expect(
      reactivateAlliance({ allianceId, actorId: memberId }),
    ).rejects.toMatchObject({ code: 'NOT_LEADER' });
    expect(await status()).toBe('RESERVED');
  });

  test('progress reports requirements to members and standing to the leader', async () => {
    await setLeader({ experience: LEVEL_10_XP, gold: 3_000_000n });
    const asMember = await getReactivationProgress(allianceId, memberId);
    expect(asMember).toMatchObject({
      status: 'RESERVED',
      requirements: { minLevel: 10, costGold: 10_000_000 },
      leader: null,
      canReactivate: false,
    });
    const asLeader = await getReactivationProgress(allianceId, leaderId);
    expect(asLeader.leader).toMatchObject({
      level: 10,
      gold: '3000000',
      inCurrentEra: true,
      meetsLevel: true,
      meetsGold: false,
    });
    expect(asLeader.canReactivate).toBe(false);
    await setLeader({ gold: 10_000_000n });
    expect(
      (await getReactivationProgress(allianceId, leaderId)).canReactivate,
    ).toBe(true);
  });

  test('pays once, activates, audits, and reopens the features', async () => {
    await setLeader({ experience: LEVEL_10_XP, gold: 12_000_000n });
    const result = await reactivateAlliance({
      allianceId,
      actorId: leaderId,
      ip: '127.0.0.1',
    });
    expect(result).toMatchObject({ reactivated: true, paidGold: '10000000' });
    const alliance = await prisma.alliances.findUniqueOrThrow({
      where: { id: allianceId },
    });
    expect(alliance).toMatchObject({
      status: 'ACTIVE',
      status_changed_by: leaderId,
    });
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: leaderId } })).gold,
    ).toBe(2_000_000n);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ALLIANCE_REACTIVATED', entityId: allianceId },
    });
    expect(audit.userId).toBe(leaderId);

    // A feature that was refused now works.
    await prisma.users.update({
      where: { id: memberId },
      data: { gold: 1_000_000n },
    });
    await AllianceBankService.deposit({
      allianceId,
      userId: memberId,
      amount: 1000n,
    });
    expect(
      (await prisma.alliances.findUniqueOrThrow({ where: { id: allianceId } }))
        .gold_in_bank,
    ).toBe(1000n);
  });

  test('is idempotent: a repeat does not charge again', async () => {
    await setLeader({ experience: LEVEL_10_XP, gold: 25_000_000n });
    await reactivateAlliance({ allianceId, actorId: leaderId });
    const again = await reactivateAlliance({ allianceId, actorId: leaderId });
    expect(again).toMatchObject({ reactivated: false, paidGold: '0' });
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: leaderId } })).gold,
    ).toBe(15_000_000n);
    expect(
      await prisma.auditLog.count({
        where: { action: 'ALLIANCE_REACTIVATED' },
      }),
    ).toBe(1);
  });

  test('concurrent double submit pays exactly once', async () => {
    await setLeader({ experience: LEVEL_10_XP, gold: 25_000_000n });
    const results = await Promise.all([
      reactivateAlliance({ allianceId, actorId: leaderId }),
      reactivateAlliance({ allianceId, actorId: leaderId }),
      reactivateAlliance({ allianceId, actorId: leaderId }),
    ]);
    expect(results.filter((r) => r.reactivated)).toHaveLength(1);
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: leaderId } })).gold,
    ).toBe(15_000_000n);
    expect(
      await prisma.auditLog.count({
        where: { action: 'ALLIANCE_REACTIVATED' },
      }),
    ).toBe(1);
  });

  test('the gate and cost follow the runtime settings', async () => {
    await prisma.serverSetting.createMany({
      data: [
        {
          key: 'alliance.reactivationMinLevel',
          label: 'min level',
          type: 'NUMBER',
          value: 3,
          isPublic: true,
        },
        {
          key: 'alliance.reactivationCostGold',
          label: 'cost',
          type: 'NUMBER',
          value: 1000,
          isPublic: true,
        },
      ],
    });
    const { invalidateRuntimeConfigCache } =
      await import('@/services/RuntimeConfig.service');
    invalidateRuntimeConfigCache();
    await setLeader({ experience: 13000, gold: 5000n });
    await reactivateAlliance({ allianceId, actorId: leaderId });
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: leaderId } })).gold,
    ).toBe(4000n);
    expect(await status()).toBe('ACTIVE');
    invalidateRuntimeConfigCache();
  });

  test('error type is a business refusal', async () => {
    await setLeader({ experience: 0 });
    await expect(
      reactivateAlliance({ allianceId, actorId: leaderId }),
    ).rejects.toBeInstanceOf(AllianceReactivationError);
  });
});

describe('complete factory restore', () => {
  beforeEach(seed);

  test('deletes alliances, rosters and chat rooms, with an audit trail', async () => {
    await prisma.chatRoom.create({
      data: {
        name: 'Reserve alliance',
        isPrivate: true,
        allianceId,
        createdById: leaderId,
        participants: { create: [{ userId: memberId }] },
      },
    });
    await setRuntimeSwitch('DISABLE_LOGIN', true);
    const era = await ensureActiveEra();
    const result = await resetCurrentEra({
      eraId: era.id,
      expectedEraStartDate: era.startDate,
      confirmation: `FACTORY RESTORE ERA ${era.id}`,
      factoryRestore: true,
      adminUserId: leaderId,
      ip: '127.0.0.1',
    });
    expect(result).toMatchObject({ alliancesDissolved: 2 });
    expect(await prisma.alliances.count()).toBe(0);
    expect(await prisma.alliance_memberships.count()).toBe(0);
    expect(await prisma.alliance_roles.count()).toBe(0);
    expect(
      await prisma.chatRoom.count({ where: { allianceId: { not: null } } }),
    ).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ADMIN_FACTORY_RESTORE' },
    });
    expect(audit.details).toMatchObject({ alliancesDissolved: 2 });
    // Players were reset too.
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: memberId } }))
        .experience,
    ).toBe(0);
  });
});
