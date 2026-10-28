import { beforeEach, describe, expect, test } from 'bun:test';

import prisma from '@/lib/prisma';
import { AllianceService } from '@/services/Alliance.service';
import {
  getAttackLogViewerRole,
  grantAttackLogAccessToRoom,
} from '@/services/AttackLogAccess.service';
import {
  getReportSharing,
  updateReportSharing,
} from '@/services/ReportSharing.service';
import { createUser } from '@/services/User.service';

import { resetDatabase } from './db';

let attacker: number;
let defender: number;
let reader: number;
let logId: number;
let allianceId: number;
const read = async (userId: number) =>
  getAttackLogViewerRole(
    userId,
    await prisma.attack_log.findUnique({ where: { id: logId } }),
  );
beforeEach(async () => {
  await resetDatabase();
  const ids: number[] = [];
  for (const name of ['Attacker', 'Defender', 'Reader']) {
    ids.push(
      (
        await createUser(
          `${name.toLowerCase()}@example.test`,
          'synthetic',
          name,
          'HUMAN',
          'FIGHTER',
        )
      ).id,
    );
  }
  [attacker, defender, reader] = ids;
  await prisma.users.update({
    where: { id: attacker },
    data: { experience: 1000000, gold: 100000000n },
  });
  const alliance = await AllianceService.createAlliance(attacker, {
    name: 'Sharing test',
    motto: 'Synthetic data only',
  });
  allianceId = alliance.id;
  const role = await prisma.alliance_roles.findFirstOrThrow({
    where: { alliance_id: allianceId },
    orderBy: { rank_order: 'desc' },
  });
  await prisma.alliance_memberships.create({
    data: { alliance_id: allianceId, user_id: reader, role_id: role.id },
  });
  logId = (
    await prisma.attack_log.create({
      data: {
        attacker_id: attacker,
        defender_id: defender,
        winner: attacker,
        timestamp: new Date(),
        stats: {},
        type: 'attack',
      },
    })
  ).id;
});

describe('report sharing against PostgreSQL', () => {
  test('concurrent grants are idempotent; anonymous access can be revoked', async () => {
    await Promise.all(
      Array.from({ length: 3 }, () =>
        updateReportSharing(logId, attacker, {
          action: 'public',
          enabled: true,
        }),
      ),
    );
    expect(
      await prisma.attack_log_acl.count({
        where: { attack_log_id: logId, is_public: true },
      }),
    ).toBe(1);
    expect(await read(0)).toBe('shared');
    await expect(
      updateReportSharing(logId, reader, {
        action: 'player',
        userId: defender,
      }),
    ).rejects.toThrow('Report not found');
    await updateReportSharing(logId, defender, {
      action: 'public',
      enabled: false,
    });
    expect(await read(0)).toBeNull();
  });
  test('alliance departure ends access; revoking an alliance also removes its intel entry', async () => {
    await updateReportSharing(logId, attacker, {
      action: 'alliance',
      allianceId,
    });
    expect(await read(reader)).toBe('shared');
    await prisma.alliance_memberships.deleteMany({
      where: { alliance_id: allianceId, user_id: reader },
    });
    expect(await read(reader)).toBeNull();
    const { grants } = await getReportSharing(logId, attacker);
    await updateReportSharing(logId, defender, {
      action: 'revoke',
      grantId: grants[0].id,
    });
    expect(
      await prisma.alliance_intel_shares.count({
        where: { attack_log_id: logId },
      }),
    ).toBe(0);
  });
  test('direct player grants stay independent of public access and can be revoked', async () => {
    await Promise.all(
      Array.from({ length: 3 }, () =>
        updateReportSharing(logId, attacker, {
          action: 'player',
          userId: reader,
        }),
      ),
    );
    expect(
      await prisma.attack_log_acl.count({
        where: { attack_log_id: logId, shared_with_user_id: reader },
      }),
    ).toBe(1);
    await updateReportSharing(logId, attacker, {
      action: 'public',
      enabled: true,
    });
    await updateReportSharing(logId, attacker, {
      action: 'public',
      enabled: false,
    });
    expect(await read(reader)).toBe('shared');
    const { grants } = await getReportSharing(logId, attacker);
    await updateReportSharing(logId, defender, {
      action: 'revoke',
      grantId: grants[0].id,
    });
    expect(await read(reader)).toBeNull();
  });
  test('alliance-room sharing creates membership-bound grants and recipients cannot reshare', async () => {
    const room = await prisma.chatRoom.create({
      data: {
        name: 'Synthetic alliance room',
        allianceId,
        createdById: attacker,
        isPrivate: true,
        participants: { create: [{ userId: attacker }, { userId: reader }] },
      },
    });
    await prisma.chatRoomParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId: reader } },
      create: { roomId: room.id, userId: reader },
      update: {},
    });
    await grantAttackLogAccessToRoom(logId, attacker, room.id);
    expect(
      await prisma.attack_log_acl.count({
        where: { attack_log_id: logId, shared_with_user_id: { not: null } },
      }),
    ).toBe(0);
    expect(await read(reader)).toBe('shared');
    await expect(
      grantAttackLogAccessToRoom(logId, reader, room.id),
    ).rejects.toThrow('Only battle participants');
    await prisma.alliance_memberships.deleteMany({
      where: { alliance_id: allianceId, user_id: reader },
    });
    expect(await read(reader)).toBeNull();
  });
});
