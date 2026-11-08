import prisma from '@/lib/prisma';
import {
  addContribution,
  convertPool,
} from '@/services/supporter/AllianceSponsorship.service';
import {
  applyPaymentFailed,
  applySubscriptionDeleted,
  applySubscriptionRenewal,
  applySubscriptionStart,
  applySubscriptionUpdate,
  grantDays,
  removePaymentAccess,
  restorePaymentAccess,
} from '@/services/supporter/Entitlement.service';
import {
  createGift,
  revokeUnredeemedGift,
} from '@/services/supporter/Gift.service';
import { assertMockAllowed } from '@/services/supporter/MockProvider';
import { getSupporterPlans } from '@/services/supporter/planPrices';
import { SUPPORTER_PLANS } from '@/services/supporter/plans';
import { enqueueSupporterEmail } from '@/services/supporter/SupporterEmail.service';
import type {
  CheckoutRequest,
  PaymentProviderName,
  SupporterPlanId,
} from '@/types/supporter';

import type { Prisma } from '../../../prisma/generated/prisma/client';

export type EventSummary = Record<string, string | number | boolean | null>;
export type EventInput = {
  provider: string;
  providerEventId: string;
  type: string;
  summary: EventSummary;
};

/** Persist only explicitly allowed scalar fields; never retain provider payloads. */
function sanitize(summary: EventSummary): EventSummary {
  const allowed = [
    'userId',
    'session',
    'planId',
    'amountCents',
    'allianceId',
    'recipientUserId',
    'paymentId',
    'status',
    'periodEnd',
    'cancelAtPeriodEnd',
    'refundId',
    'reason',
    'createdById',
    'providerPaymentId',
    'providerInvoiceId',
    'customerId',
    'subscriptionId',
    'disputeId',
    'outcome',
    'billingCountry',
    'billingState',
  ];
  return Object.fromEntries(
    Object.entries(summary).filter(
      ([key, value]) =>
        allowed.includes(key) &&
        (value === null ||
          ['string', 'number', 'boolean'].includes(typeof value)),
    ),
  );
}

async function process(id: number) {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PaymentEvent" WHERE id = ${id} FOR UPDATE`;
      const event = await tx.paymentEvent.findUniqueOrThrow({ where: { id } });
      if (event.status !== 'RECEIVED' && event.status !== 'FAILED')
        return { event };
      const data = event.summary as EventSummary;
      let giftCode: string | undefined;
      let ignored = false;
      const str = (value: unknown) =>
        typeof value === 'string' && value ? value : null;
      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'invoice.payment_failed'
      ) {
        const userId = Number(data.userId);
        const planId = String(data.planId);
        const plan =
          planId === 'alliance_sponsorship'
            ? null
            : SUPPORTER_PLANS[planId as SupporterPlanId];
        if (!plan && planId !== 'alliance_sponsorship')
          throw new Error('Invalid plan');
        const charged = Number(data.amountCents);
        const amountCents = Number.isSafeInteger(charged)
          ? charged
          : plan
            ? (await getSupporterPlans(tx))[plan.id].priceCents
            : charged;
        const kind = plan?.kind ?? 'ALLIANCE_SPONSORSHIP';
        const success = event.type === 'checkout.session.completed';
        const providerPaymentId =
          str(data.providerPaymentId) ?? `mock:${data.session}`;
        // Business-level idempotency: the return page and the webhook may
        // both deliver the same checkout under different event ids.
        const existing = await tx.payment.findUnique({
          where: { providerPaymentId },
        });
        if (existing) ignored = true;
        else {
          const payment = await tx.payment.create({
            data: {
              userId,
              allianceId:
                data.allianceId == null ? undefined : Number(data.allianceId),
              kind,
              status: success ? 'SUCCEEDED' : 'FAILED',
              amountCents,
              currency: 'usd',
              provider: event.provider,
              providerPaymentId,
              providerInvoiceId: str(data.providerInvoiceId),
              description: planId,
              billingCountry: str(data.billingCountry),
              billingState: str(data.billingState),
            },
          });
          const billing =
            event.provider === 'mock'
              ? undefined
              : {
                  provider: event.provider as PaymentProviderName,
                  customerId: str(data.customerId),
                };
          if (success) {
            if (kind === 'SUBSCRIPTION') {
              const periodEnd = data.periodEnd
                ? new Date(String(data.periodEnd))
                : new Date(Date.now() + 30 * 86_400_000);
              if (!Number.isFinite(periodEnd.getTime()))
                throw new Error('Invalid period end');
              await applySubscriptionStart(
                userId,
                periodEnd,
                event.provider as PaymentProviderName,
                str(data.customerId) ?? `customer:${userId}`,
                str(data.subscriptionId) ?? `subscription:${data.session}`,
                tx,
              );
              await tx.payment.update({
                where: { id: payment.id },
                data: { accessFrom: new Date(), accessUntil: periodEnd },
              });
            }
            if (kind === 'ONE_TIME') {
              const status = await grantDays(
                userId,
                plan!.grantDays!,
                'ONE_TIME',
                tx,
                billing,
              );
              // Pass time is appended after any existing access.
              const until = new Date(status.activeUntil!);
              await tx.payment.update({
                where: { id: payment.id },
                data: {
                  accessFrom: new Date(
                    until.getTime() - plan!.grantDays! * 86_400_000,
                  ),
                  accessUntil: until,
                },
              });
            }
            if (kind === 'GIFT')
              giftCode = await createGift(
                userId,
                payment.id,
                plan!.grantMonths!,
                data.recipientUserId == null
                  ? undefined
                  : Number(data.recipientUserId),
                tx,
                {
                  country: str(data.billingCountry),
                  state: str(data.billingState),
                },
              );
            if (kind === 'ALLIANCE_SPONSORSHIP') {
              // Same lock order as convertPool (alliance, then sponsorship).
              await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${Number(data.allianceId)} FOR UPDATE`;
              await addContribution(Number(data.allianceId), amountCents, tx);
              // Premium starts now rather than at the next daily run.
              await convertPool(Number(data.allianceId), tx);
            }
            // Receipt with the consent the buyer gave before paying.
            const consent = data.session
              ? await tx.purchaseConsent.findUnique({
                  where: { checkoutSessionId: String(data.session) },
                  select: { text: true },
                })
              : null;
            await enqueueSupporterEmail(
              tx,
              'SUPPORTER_RECEIPT',
              `supporter-receipt:${payment.id}`,
              userId,
              { planId, amountCents, consentText: consent?.text ?? '' },
            );
          } else if (kind === 'SUBSCRIPTION') {
            const membership = await tx.supporterMembership.findUnique({
              where: { userId },
            });
            if (
              membership?.source === 'SUBSCRIPTION' &&
              (!str(data.subscriptionId) ||
                membership.providerSubscriptionId === data.subscriptionId)
            )
              await applyPaymentFailed(userId, tx);
          }
        }
      } else if (event.type === 'invoice.paid') {
        const userId = Number(data.userId);
        const end = new Date(String(data.periodEnd));
        const amount = Number(data.amountCents);
        if (
          !Number.isSafeInteger(userId) ||
          userId < 1 ||
          !Number.isSafeInteger(amount) ||
          amount < 1 ||
          !Number.isFinite(end.getTime()) ||
          typeof data.providerPaymentId !== 'string'
        )
          throw new Error('Invalid renewal');
        const membership = await tx.supporterMembership.findUniqueOrThrow({
          where: { userId },
        });
        if (
          membership.source !== 'SUBSCRIPTION' ||
          membership.provider !== event.provider
        )
          throw new Error('Invalid subscription');
        if (
          str(data.subscriptionId) &&
          membership.providerSubscriptionId !== data.subscriptionId
        )
          // An invoice for a subscription this membership no longer tracks.
          ignored = true;
        else {
          const existing = await tx.payment.findUnique({
            where: { providerPaymentId: data.providerPaymentId },
          });
          if (!existing)
            await tx.payment.create({
              data: {
                userId,
                kind: 'SUBSCRIPTION',
                status: 'SUCCEEDED',
                amountCents: amount,
                currency: 'usd',
                provider: event.provider,
                providerPaymentId: data.providerPaymentId,
                providerInvoiceId: str(data.providerInvoiceId),
                description: 'supporter_monthly',
                billingCountry: str(data.billingCountry),
                billingState: str(data.billingState),
                // This renewal buys the period after the one already paid.
                accessFrom:
                  membership.subscriptionPeriodEnd &&
                  membership.subscriptionPeriodEnd < end
                    ? membership.subscriptionPeriodEnd
                    : new Date(),
                accessUntil: end,
              },
            });
          await applySubscriptionRenewal(userId, end, tx);
        }
      } else if (
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        const userId = Number(data.userId);
        const membership = await tx.supporterMembership.findUniqueOrThrow({
          where: { userId },
        });
        if (
          membership.source !== 'SUBSCRIPTION' ||
          membership.provider !== event.provider
        )
          throw new Error('Invalid subscription');
        // One notice per subscription, when it first stops renewing.
        const canceledNotice = async () => {
          const after = await tx.supporterMembership.findUnique({
            where: { userId },
            select: { currentPeriodEnd: true },
          });
          await enqueueSupporterEmail(
            tx,
            'SUPPORTER_CANCELED',
            `supporter-canceled:${membership.providerSubscriptionId ?? userId}`,
            userId,
            { accessUntil: after?.currentPeriodEnd ?? undefined },
          );
        };
        if (
          str(data.subscriptionId) &&
          membership.providerSubscriptionId !== data.subscriptionId
        )
          ignored = true;
        else if (event.type === 'customer.subscription.deleted') {
          await applySubscriptionDeleted(userId, tx);
          if (!membership.cancelAtPeriodEnd) await canceledNotice();
        } else {
          const end = new Date(String(data.periodEnd));
          if (
            !Number.isFinite(end.getTime()) ||
            typeof data.cancelAtPeriodEnd !== 'boolean'
          )
            throw new Error('Invalid subscription update');
          await applySubscriptionUpdate(
            userId,
            end,
            data.cancelAtPeriodEnd,
            tx,
          );
          if (data.cancelAtPeriodEnd && !membership.cancelAtPeriodEnd)
            await canceledNotice();
        }
      } else if (event.type === 'charge.dispute.created') {
        const paymentId = Number(data.paymentId);
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        if (payment.provider !== event.provider)
          throw new Error('Invalid payment provider');
        if (payment.status === 'DISPUTED') ignored = true;
        else {
          // Suspend only the unused access this payment bought.
          const removed = ['SUBSCRIPTION', 'ONE_TIME'].includes(payment.kind)
            ? await removePaymentAccess(payment.userId, payment, tx)
            : 0;
          await tx.payment.update({
            where: { id: paymentId },
            data: { status: 'DISPUTED', disputeRemovedSeconds: removed },
          });
          if (payment.kind === 'GIFT')
            await revokeUnredeemedGift(paymentId, tx);
        }
      } else if (event.type === 'charge.dispute.closed') {
        // Won: the payment stands again; perks return until the end recorded
        // when the dispute revoked them, and a gift code revoked by the
        // dispute becomes redeemable again. Lost: everything stays revoked.
        const paymentId = Number(data.paymentId);
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        if (payment.provider !== event.provider)
          throw new Error('Invalid payment provider');
        if (payment.status !== 'DISPUTED' || data.outcome !== 'won')
          // Lost leaves the revocation in place; anything else is a no-op.
          ignored = payment.status !== 'DISPUTED' || data.outcome !== 'lost';
        else {
          // Read before clearing it below.
          const removed = payment.disputeRemovedSeconds;
          await tx.payment.update({
            where: { id: paymentId },
            data: {
              status:
                payment.refundedCents > 0 ? 'PARTIALLY_REFUNDED' : 'SUCCEEDED',
              disputeRemovedSeconds: null,
            },
          });
          if (removed)
            await restorePaymentAccess(
              payment.userId,
              removed,
              payment.kind,
              tx,
            );
          if (payment.kind === 'GIFT')
            await tx.giftCode.updateMany({
              where: {
                paymentId,
                redeemedAt: null,
                revokedAt: { gte: payment.createdAt },
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              data: { revokedAt: null },
            });
        }
      } else if (
        event.type === 'charge.refunded' &&
        str(data.refundId) &&
        (await tx.paymentRefund.findUnique({
          where: { providerRefundId: String(data.refundId) },
        }))
      ) {
        // Already recorded (admin-initiated refund seen again by webhook).
        ignored = true;
      } else if (event.type === 'charge.refunded') {
        const paymentId = Number(data.paymentId);
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        const amount = Number(data.amountCents);
        if (payment.provider !== event.provider)
          throw new Error('Invalid payment provider');
        if (
          !Number.isSafeInteger(amount) ||
          amount < 1 ||
          amount > payment.amountCents - payment.refundedCents ||
          !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)
        )
          throw new Error('Invalid refund amount');
        const refundedCents = payment.refundedCents + amount;
        const full = refundedCents === payment.amountCents;
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            refundedCents,
            status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        });
        await tx.paymentRefund.create({
          data: {
            paymentId,
            amountCents: amount,
            reason: typeof data.reason === 'string' ? data.reason : null,
            providerRefundId:
              typeof data.refundId === 'string' ? data.refundId : null,
            createdById:
              typeof data.createdById === 'number' ? data.createdById : null,
          },
        });
        // A full refund removes what the payment bought: the unused code,
        // or the unused part of its access. Partial refunds change nothing.
        if (full && payment.kind === 'GIFT')
          await revokeUnredeemedGift(paymentId, tx);
        if (full && ['SUBSCRIPTION', 'ONE_TIME'].includes(payment.kind))
          await removePaymentAccess(payment.userId, payment, tx);
      } else ignored = true;
      const updated = await tx.paymentEvent.update({
        where: { id },
        data: {
          status: ignored ? 'IGNORED' : 'PROCESSED',
          error: null,
          processedAt: new Date(),
        },
      });
      return { event: updated, giftCode };
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : 'Event processing failed';
    await prisma.paymentEvent.updateMany({
      where: { id, status: { in: ['RECEIVED', 'FAILED'] } },
      data: { status: 'FAILED', error: message, processedAt: new Date() },
    });
    throw error;
  }
}

export async function processPaymentEvent(input: EventInput) {
  let event;
  try {
    event = await prisma.paymentEvent.create({
      data: {
        ...input,
        summary: sanitize(input.summary) as Prisma.InputJsonObject,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    return {
      event: await prisma.paymentEvent.findUniqueOrThrow({
        where: { providerEventId: input.providerEventId },
      }),
    };
  }
  return process(event.id);
}

export async function replay(eventId: number) {
  const event = await prisma.paymentEvent.findUniqueOrThrow({
    where: { id: eventId },
  });
  if (event.status !== 'FAILED')
    throw new Error('Only failed events can be replayed');
  return process(eventId);
}

/** Order summary for the mock checkout page; only the session owner sees it. */
export async function getMockCheckoutSummary(userId: number, session: string) {
  assertMockAllowed();
  const pending = await prisma.paymentEvent.findUnique({
    where: { providerEventId: `session:${session}` },
  });
  const data = pending?.summary as unknown as Omit<
    CheckoutRequest,
    'consent'
  > & {
    userId: number;
  };
  if (
    !pending ||
    pending.provider !== 'mock' ||
    pending.type !== 'mock.checkout.pending' ||
    data.userId !== userId
  )
    return null;
  const plan =
    data.planId === 'alliance_sponsorship'
      ? null
      : SUPPORTER_PLANS[data.planId as SupporterPlanId];
  return {
    planId: data.planId,
    amountCents:
      data.amountCents ??
      (plan ? (await getSupporterPlans())[plan.id].priceCents : 0),
    open: pending.status === 'RECEIVED',
  };
}

export async function confirmMockCheckout(
  userId: number,
  session: string,
  outcome: 'success' | 'fail',
) {
  assertMockAllowed();
  const pending = await prisma.paymentEvent.findUnique({
    where: { providerEventId: `session:${session}` },
  });
  const data = pending?.summary as unknown as Omit<
    CheckoutRequest,
    'consent'
  > & {
    userId: number;
  };
  if (
    !pending ||
    pending.provider !== 'mock' ||
    pending.type !== 'mock.checkout.pending' ||
    pending.status === 'IGNORED' ||
    pending.receivedAt.getTime() < Date.now() - 24 * 60 * 60 * 1000 ||
    data.userId !== userId
  )
    throw new Error('Invalid checkout session');
  const result = await processPaymentEvent({
    provider: 'mock',
    providerEventId: `checkout:${session}`,
    type:
      outcome === 'success'
        ? 'checkout.session.completed'
        : 'invoice.payment_failed',
    summary: { ...data, session },
  });
  await prisma.paymentEvent.updateMany({
    where: { id: pending.id, status: 'RECEIVED' },
    data: { status: 'PROCESSED', processedAt: new Date() },
  });
  if (result.event.status === 'FAILED')
    throw new Error('Checkout event failed');
  const success = result.event.type === 'checkout.session.completed';
  return {
    redirect: `/home/supporter?checkout=${success ? 'success' : 'failed'}`,
    ...('giftCode' in result && result.giftCode
      ? { giftCode: result.giftCode }
      : {}),
  };
}
