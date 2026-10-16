import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import {
  createDraftCampaign,
  enqueueDraftCampaign,
} from '@/services/AdminEmail.service';
import {
  forEachEligibleRecipientBatch,
  sendImmediate,
  unsubscribeHeaders,
} from '@/services/Email.service';
import { renderEmail } from '@/services/emailTemplates';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { BroadcastSchema, canSendBroadcast } from '@/utils/broadcastPolicy';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.SEND_MASS_MESSAGES],
  rateLimitProfile: 'admin',
  bodySchema: BroadcastSchema,
});
export async function handleMassMessages(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof BroadcastSchema> },
) {
  const actorId = Number(req.session?.user?.id);
  if (!actorId) return res.status(401).json({ error: 'Unauthorized' });
  const { body } = context;
  try {
    if (!(await canSendBroadcast(actorId, body)))
      return res
        .status(403)
        .json({ error: 'Email to a broad audience requires ADMINISTRATOR' });
    const admin = await prisma.users.findUnique({
      where: { id: actorId },
      select: { email: true, locale: true },
    });
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const audit = {
      userId: actorId,
      action: `ADMIN_BROADCAST_${body.action.toUpperCase()}`,
      ip: getRequestIp(req),
      details: {
        channel: body.channel,
        sendToAll: body.sendToAll,
        activeWithinDays: body.activeWithinDays ?? null,
      },
    };
    if (body.action === 'preview' || body.action === 'test') {
      const rendered = renderEmail({
        kind: 'BROADCAST' as const,
        locale: admin.locale,
        vars: { userId: actorId, subject: body.subject, body: body.body },
      });
      await prisma.$transaction(async (tx) => {
        await logActionStrict(audit, tx);
      });
      if (body.action === 'test') {
        await sendImmediate({
          to: admin.email,
          ...rendered,
          headers: unsubscribeHeaders(actorId, 'ANNOUNCEMENT'),
        });
        return res.status(200).json({ testSent: true });
      }
      return res.status(200).json(rendered);
    }
    if (
      !body.sendToAll &&
      body.activeWithinDays === undefined &&
      !body.recipientUserIds?.length
    )
      return res.status(400).json({ error: 'No recipients specified' });
    const recipientFilter = {
      category: 'ANNOUNCEMENT' as const,
      includeAll: body.sendToAll,
      userIds:
        body.sendToAll || body.activeWithinDays !== undefined
          ? undefined
          : body.recipientUserIds,
      activeWithinDays: body.activeWithinDays,
    };
    let emailCount = 0;
    if (body.channel !== 'IN_GAME' && body.action === 'count')
      await forEachEligibleRecipientBatch(
        recipientFilter,
        250,
        async (batch) => {
          emailCount += batch.length;
        },
      );
    let inGameIds: number[] = [];
    if (body.channel !== 'EMAIL') {
      if (body.sendToAll || body.activeWithinDays !== undefined) {
        const now = new Date();
        const accounts = await prisma.users.findMany({
          where:
            body.activeWithinDays === undefined
              ? {}
              : {
                  last_active: {
                    gte: new Date(
                      now.getTime() - body.activeWithinDays * 86_400_000,
                    ),
                  },
                },
          select: {
            id: true,
            statusHistories: {
              where: { start_date: { lte: now } },
              orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { status: true, end_date: true },
            },
          },
        });
        inGameIds = accounts
          .filter(({ statusHistories }) => {
            const current = statusHistories[0];
            return Boolean(
              current &&
              (current.status === 'ACTIVE' ||
                (current.end_date && current.end_date <= now)),
            );
          })
          .map(({ id }) => id);
      } else {
        inGameIds = [...new Set(body.recipientUserIds)];
        const existing = await prisma.users.count({
          where: { id: { in: inGameIds } },
        });
        if (existing !== inGameIds.length)
          return res
            .status(400)
            .json({ error: 'One or more recipients do not exist' });
      }
    }
    if (
      body.action === 'send' &&
      body.channel === 'IN_GAME' &&
      !inGameIds.length
    )
      return res.status(400).json({ error: 'No active recipients found' });
    if (body.action === 'send') {
      if (!body.idempotencyKey)
        return res.status(400).json({ error: 'Missing idempotencyKey' });
      req.headers['idempotency-key'] = body.idempotencyKey;
      if (
        !(await enforceIdempotency(req, res, {
          scope: 'ADMIN_BROADCAST_SEND',
          actorKey: String(actorId),
          ttlSeconds: 600,
        }))
      )
        return;
    }
    const config = await getRuntimeConfig();
    const counts = {
      inGame: inGameIds.length,
      email: emailCount,
      outboxEnabled: !!config.emailOutboxEnabled,
    };
    if (body.action === 'count') {
      await prisma.$transaction(async (tx) => {
        await logActionStrict(
          { ...audit, details: { ...audit.details, ...counts } },
          tx,
        );
      });
      return res.status(200).json(counts);
    }
    const campaignInput = {
      kind: 'BROADCAST' as const,
      subject: body.subject,
      body: body.body,
      audience: {
        sendToAll: body.sendToAll,
        activeWithinDays: body.activeWithinDays ?? null,
        userIds: body.recipientUserIds ?? [],
      },
      createdByUserId: actorId,
      recipientFilter,
    };
    const result = await prisma.$transaction(
      async (tx) => {
        for (let offset = 0; offset < inGameIds.length; offset += 250)
          await tx.messages.createMany({
            data: inGameIds.slice(offset, offset + 250).map((id) => ({
              subject: body.subject,
              body: body.body,
              from_user_id: actorId,
              to_user_id: id,
            })),
          });
        const campaign =
          body.channel === 'IN_GAME'
            ? null
            : await createDraftCampaign(tx, campaignInput);
        const sent = {
          ...counts,
          email: campaign?.recipientCount ?? 0,
          sent: inGameIds.length,
          queued: campaign?.recipientCount ?? 0,
          campaignId: campaign?.id ?? null,
        };
        await logActionStrict(
          body.channel === 'IN_GAME'
            ? {
                ...audit,
                action: 'ADMIN_MASS_MESSAGE',
                details: {
                  subject: body.subject,
                  sendToAll: body.sendToAll,
                  recipientCount: inGameIds.length,
                },
              }
            : { ...audit, details: { ...audit.details, ...sent } },
          tx,
        );
        return sent;
      },
      { timeout: 120_000 },
    );
    if (result.campaignId) {
      const campaign = await enqueueDraftCampaign(
        result.campaignId,
        campaignInput,
      );
      result.email = campaign.recipientCount;
      result.queued = campaign.recipientCount;
    }
    return res.status(200).json(result);
  } catch {
    logError('Admin broadcast failed');
    return res.status(500).json({ error: 'Failed to process broadcast' });
  }
}
export default guardedHandler(handleMassMessages);
