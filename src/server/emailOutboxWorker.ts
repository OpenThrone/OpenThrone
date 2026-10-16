import prisma from '@/lib/prisma';
import {
  completeFinishedCampaigns,
  processOutboxBatch,
} from '@/services/Email.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { missingEmailSecrets } from '@/utils/emailSecrets';
import { logError } from '@/utils/logger';

/** Cross-process reservations enforce the configured rate across custom/standalone workers. */
async function reserveDelivery(ratePerMinute: number): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(741032, 2)`;
    const row = await tx.serverSetting.findUnique({
      where: { key: 'email.outbox.nextSlotAt' },
    });
    const now = Date.now();
    if (typeof row?.value === 'number' && row.value > now) return false;
    const value = now + Math.ceil(60_000 / ratePerMinute);
    await tx.serverSetting.upsert({
      where: { key: 'email.outbox.nextSlotAt' },
      create: {
        key: 'email.outbox.nextSlotAt',
        label: 'Internal email throttle',
        type: 'NUMBER',
        value,
        isPublic: false,
        isRuntimeEditable: false,
      },
      update: { value },
    });
    return true;
  });
}

export function startEmailOutboxWorker() {
  const missing = missingEmailSecrets();
  if (missing.length) {
    logError(`Email outbox configuration missing: ${missing.join(', ')}`);
    return () => {};
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const poll = async () => {
    let delay = 1000;
    try {
      const config = await getRuntimeConfig();
      if (config.emailOutboxEnabled) {
        const rate = config.emailOutboxRatePerMinute ?? 60;
        const pending = await prisma.emailOutbox.findFirst({
          where: {
            OR: [
              { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
              {
                status: 'SENDING',
                lockedAt: { lt: new Date(Date.now() - 15 * 60_000) },
              },
            ],
            AND: [
              {
                OR: [
                  { campaignId: null },
                  { campaign: { status: { in: ['QUEUED', 'SENDING'] } } },
                ],
              },
            ],
          },
          select: { id: true },
        });
        if (!pending) await completeFinishedCampaigns();
        else if (await reserveDelivery(rate)) await processOutboxBatch(1);
        delay = Math.max(100, Math.ceil(60_000 / rate));
      }
    } catch {
      // SMTP errors can contain sensitive connection details; log a sanitized error.
      logError('Email outbox poll failed');
      delay = 15_000;
    }
    if (!stopped) timer = setTimeout(poll, delay);
  };
  poll().catch(() => logError('Email outbox worker stopped unexpectedly'));
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
