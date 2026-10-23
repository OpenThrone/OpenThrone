import { randomUUID } from 'crypto';

import { ItemTypes, UnitTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { evictUserFromAllianceChatRooms } from '@/lib/socket';
import { lockAllianceThenUsers } from '@/services/AllianceBank.service';
import { cancelPendingGoldRequests } from '@/services/AllianceGoldRequest.service';
import { settleLoansOnExit } from '@/services/AllianceLoan.service';
import { lockAllianceChatRooms } from '@/services/chatRoomGuards';
import {
  obligationOutstanding,
  payForceDuesInTx,
} from '@/services/ForceDues.service';
import { returnMemberForcesInTx } from '@/services/ForceLifecycle.service';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import {
  ForcePolicySchema,
  ForceRoleSchema,
  parseForceLoadout,
} from '@/utils/temporaryForces';
import { getOTStartDate } from '@/utils/timefunctions';
import { getLevelFromXP } from '@/utils/utilities';

export async function processForceDuesDay(now = new Date()) {
  const day = getOTStartDate(0, now);
  const dayKey = day.toISOString().slice(0, 10);
  const [rules, debts] = await Promise.all([
    prisma.forceDuesRule.findMany({
      where: { enabled: true },
      select: { allianceId: true },
    }),
    prisma.forceObligation.findMany({
      where: { cancelledAt: null },
      select: { allianceId: true },
    }),
  ]);
  const ids = [
    ...new Set<number>([...rules, ...debts].map((row) => row.allianceId)),
  ].sort((a, b) => a - b);
  const done = await prisma.forceEvent.findMany({
    where: {
      operationKey: { in: ids.map((id) => `dues-day:${id}:${dayKey}`) },
    },
    select: { operationKey: true },
  });
  const completed = new Set(done.map((event) => event.operationKey));
  for (const allianceId of ids
    .filter((id) => !completed.has(`dues-day:${id}:${dayKey}`))
    .slice(0, 100)) {
    const kicked = await prisma.$transaction(
      async (tx) => {
        await lockEraLifecycleShared(tx);
        // Match membership-removal lock order: chat rooms -> alliance -> sorted users.
        await lockAllianceChatRooms(tx, allianceId);
        await lockAllianceThenUsers(tx, allianceId, []);
        const alliance = await tx.alliances.findUnique({
          where: { id: allianceId },
        });
        if (!alliance) return [] as number[];
        const operationKey = `dues-day:${allianceId}:${dayKey}`;
        if (await tx.forceEvent.findUnique({ where: { operationKey } }))
          return [] as number[];
        const members = await tx.alliance_memberships.findMany({
          where: { alliance_id: allianceId },
          include: {
            user: { select: { experience: true, currentEraId: true } },
          },
          orderBy: { user_id: 'asc' },
        });
        for (const member of members)
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${member.user_id} FOR UPDATE`;
        const settingsRow = await tx.allianceForcePolicy.findFirst({
          where: { allianceId },
          orderBy: { version: 'desc' },
        });
        const settings = ForcePolicySchema.parse(settingsRow?.settings ?? {});
        const rules = await tx.forceDuesRule.findMany({
          where: { allianceId, enabled: true },
          orderBy: { minLevel: 'desc' },
        });
        for (const member of members) {
          const eligible = rules.find(
            (rule) =>
              rule.roleId === member.role_id &&
              rule.minLevel <= getLevelFromXP(member.user.experience),
          );
          if (!eligible || eligible.nextIssueAt > now) continue;
          await tx.forceObligation.upsert({
            where: {
              sourceKey: `rule:${eligible.id}:${eligible.nextIssueAt.toISOString()}:${member.user_id}`,
            },
            create: {
              allianceId,
              userId: member.user_id,
              sourceKey: `rule:${eligible.id}:${eligible.nextIssueAt.toISOString()}:${member.user_id}`,
              title: 'Recurring alliance dues',
              eraId: member.user.currentEraId,
              enforcement: settings.enforcement,
              amountGold: eligible.amountGold,
              quantity: eligible.quantity,
              type: eligible.type,
              level: eligible.level,
              dueAt: new Date(day.getTime() + eligible.dueDays * 86400000),
            },
            update: {},
          });
        }
        for (const rule of rules.filter((rule) => rule.nextIssueAt <= now)) {
          // Missed scheduler time creates one current demand, never a retroactive pile of debt.
          await tx.forceDuesRule.update({
            where: { id: rule.id },
            data: {
              nextIssueAt: new Date(
                day.getTime() + rule.intervalDays * 86400000,
              ),
            },
          });
        }
        const obligations = await tx.forceObligation.findMany({
          where: { allianceId, cancelledAt: null },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        });
        const kicks = new Set<number>();
        for (let obligation of obligations) {
          if (!members.some((member) => member.user_id === obligation.userId)) {
            await tx.forceObligation.update({
              where: { id: obligation.id },
              data: { cancelledAt: now },
            });
            continue;
          }
          const currentMember = members.find(
            (member) => member.user_id === obligation.userId,
          );
          if (currentMember?.user.currentEraId !== obligation.eraId) {
            await tx.forceObligation.update({
              where: { id: obligation.id },
              data: { cancelledAt: now },
            });
            continue;
          }
          if (!obligationOutstanding(obligation)) continue;
          const { enforcement } = ForcePolicySchema.parse({
            enforcement: obligation.enforcement,
          });
          if (
            !obligation.reminderAt &&
            obligation.dueAt.getTime() <= now.getTime() + 86400000
          ) {
            await tx.forceObligation.update({
              where: { id: obligation.id },
              data: { reminderAt: now },
            });
            await tx.forceEvent.create({
              data: {
                operationKey: `dues-reminder:${obligation.id}`,
                allianceId,
                actorId: obligation.userId,
                action: 'DUES_REMINDER',
                details: {
                  obligationId: obligation.id,
                  dueAt: obligation.dueAt.toISOString(),
                },
              },
            });
          }
          const overdueDays = Math.floor(
            (day.getTime() - obligation.dueAt.getTime()) / 86400000,
          );
          const collectAfter = enforcement.autoCollectAfterDays;
          if (collectAfter !== null && overdueDays >= collectAfter) {
            if (!obligation.fineAssessedAt) {
              obligation = await tx.forceObligation.update({
                where: { id: obligation.id },
                data: {
                  fineAssessedAt: now,
                  fineGold: BigInt(enforcement.fineGold),
                },
              });
              await tx.forceEvent.create({
                data: {
                  operationKey: `dues-fine:${obligation.id}`,
                  allianceId,
                  actorId: obligation.userId,
                  action: 'DUES_FINE',
                  gold: obligation.fineGold,
                  details: { obligationId: obligation.id },
                },
              });
            }
            const user = await tx.users.findUniqueOrThrow({
              where: { id: obligation.userId },
              select: {
                gold: true,
                fort_level: true,
                race: true,
                UserStructureUpgrade: true,
              },
            });
            const goldDue =
              obligation.amountGold -
              obligation.paidGold +
              obligation.fineGold -
              obligation.paidFineGold;
            const gold = user.gold < goldDue ? user.gold : goldDue;
            let quantity = 0;
            if (
              obligation.collectionUnitId &&
              obligation.collectionEquipment &&
              obligation.type
            ) {
              const unit = await tx.userUnit.findFirst({
                where: {
                  id: obligation.collectionUnitId,
                  userId: obligation.userId,
                  isMercenary: false,
                  type: obligation.type,
                  level: obligation.level!,
                },
              });
              if (unit) {
                quantity = Math.min(
                  unit.quantity,
                  obligation.quantity - obligation.paidQuantity,
                );
                if (
                  user.fort_level <
                  (UnitTypes.find(
                    (known) =>
                      known.type === unit.type && known.level === unit.level,
                  )?.fortLevel ?? Infinity)
                )
                  quantity = 0;
                const kit = parseForceLoadout(
                  ForceRoleSchema.parse(obligation.type),
                  obligation.collectionEquipment,
                );
                for (const slot of kit) {
                  const item = await tx.userItem.findUnique({
                    where: {
                      userId_type_usage_level: {
                        userId: obligation.userId,
                        type: slot.type!,
                        level: slot.level!,
                        usage: obligation.type,
                      },
                    },
                  });
                  quantity = Math.min(quantity, item?.quantity ?? 0);
                  const requiredRole = obligation.type;
                  const known = ItemTypes.find(
                    (entry) =>
                      entry.usage === requiredRole &&
                      entry.type === slot.type &&
                      entry.level === slot.level,
                  );
                  const armory =
                    user.UserStructureUpgrade.find(
                      (upgrade) => upgrade.type === 'ARMORY',
                    )?.level ?? 0;
                  if (
                    !known ||
                    (known.race !== 'ALL' && known.race !== user.race) ||
                    (known.armoryLevel ?? 1) > armory
                  )
                    quantity = 0;
                }
              }
            }
            if (gold > 0n || quantity > 0)
              await payForceDuesInTx(
                tx,
                obligation,
                {
                  amountGold: gold,
                  quantity,
                  unitId: obligation.collectionUnitId ?? undefined,
                  equipment: obligation.collectionEquipment,
                  operationId: randomUUID(),
                },
                true,
              );
            obligation = await tx.forceObligation.findUniqueOrThrow({
              where: { id: obligation.id },
            });
          }
          if (
            enforcement.expelAfterDays !== null &&
            overdueDays >= enforcement.expelAfterDays &&
            obligationOutstanding(obligation) &&
            obligation.userId !== alliance.leader_id
          )
            kicks.add(obligation.userId);
        }
        for (const userId of [...kicks].sort((a, b) => a - b)) {
          await returnMemberForcesInTx(tx, allianceId, userId);
          await cancelPendingGoldRequests(tx, allianceId, userId);
          await settleLoansOnExit(tx, allianceId, userId, 'kick');
          await tx.alliance_memberships.deleteMany({
            where: { alliance_id: allianceId, user_id: userId },
          });
          await tx.forceEvent.create({
            data: {
              operationKey: `dues-expel:${allianceId}:${userId}:${dayKey}`,
              allianceId,
              actorId: userId,
              action: 'DUES_EXPELLED',
              details: { reason: 'Configured overdue threshold reached' },
            },
          });
        }
        await tx.forceEvent.create({
          data: { operationKey, allianceId, action: 'DUES_DAY', details: {} },
        });
        return [...kicks];
      },
      { timeout: 30000, maxWait: 5000 },
    );
    for (const userId of kicked)
      await evictUserFromAllianceChatRooms(userId, allianceId);
  }
}
