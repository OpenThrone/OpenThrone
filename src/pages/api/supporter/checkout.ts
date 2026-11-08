import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import {
  CONSENT_VERSION,
  consentAmount,
  consentText,
} from '@/services/supporter/consent';
import {
  consentLocale,
  supporterTranslator,
} from '@/services/supporter/consentServer';
import { getPaymentProvider } from '@/services/supporter/PaymentProvider';
import { getSupporterPlans } from '@/services/supporter/planPrices';
import { SUPPORTER_PLANS } from '@/services/supporter/plans';
import type { AuthenticatedRequest } from '@/types/api';
import type { CheckoutRequest, SupporterPlanId } from '@/types/supporter';
import { logError } from '@/utils/logger';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'POST');
  if (!userId) return;
  const { planId, amountCents, allianceId, recipientUserId, consent } =
    (req.body ?? {}) as CheckoutRequest;
  if (consent?.accepted !== true || consent.version !== CONSENT_VERSION)
    return res.status(400).json({ error: 'consent_required' });
  if (planId === 'alliance_sponsorship') {
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents! < 500 ||
      amountCents! > 1000000 ||
      !Number.isSafeInteger(allianceId) ||
      !(await prisma.alliances.findUnique({ where: { id: allianceId } }))
    )
      return res.status(400).json({ error: 'Invalid sponsorship' });
  } else if (
    typeof planId !== 'string' ||
    !Object.prototype.hasOwnProperty.call(SUPPORTER_PLANS, planId)
  )
    return res.status(400).json({ error: 'Invalid plan' });
  if (
    recipientUserId !== undefined &&
    (!Number.isSafeInteger(recipientUserId) ||
      !(await prisma.users.findUnique({ where: { id: recipientUserId } })) ||
      (planId !== 'alliance_sponsorship' &&
        SUPPORTER_PLANS[planId as SupporterPlanId].kind !== 'GIFT'))
  )
    return res.status(400).json({ error: 'Invalid recipient' });
  if (planId === 'supporter_monthly') {
    const membership = await prisma.supporterMembership.findUnique({
      where: { userId },
    });
    if (
      membership?.source === 'SUBSCRIPTION' &&
      ['ACTIVE', 'PAST_DUE'].includes(membership.status) &&
      !membership.cancelAtPeriodEnd
    )
      return res.status(409).json({ error: 'Subscription already active' });
  }
  const request: CheckoutRequest = {
    planId,
    ...(planId === 'alliance_sponsorship' ? { amountCents, allianceId } : {}),
    ...(recipientUserId === undefined ? {} : { recipientUserId }),
  };
  const plans = await getSupporterPlans();
  const resolvedPlan =
    planId === 'alliance_sponsorship' ? undefined : plans[planId];
  if (resolvedPlan && req.body.quotedPriceCents !== resolvedPlan.priceCents)
    return res.status(409).json({ error: 'price_changed' });
  // Store exactly what the buyer agreed to, rendered from the same copy.
  const locale = consentLocale(consent.locale);
  const alliance =
    planId === 'alliance_sponsorship'
      ? await prisma.alliances.findUnique({
          where: { id: allianceId },
          select: { name: true },
        })
      : null;
  const text = consentText(
    supporterTranslator(locale),
    request,
    alliance?.name,
    plans,
  );
  try {
    const record = await prisma.purchaseConsent.create({
      data: {
        userId,
        planId,
        allianceId: planId === 'alliance_sponsorship' ? allianceId : null,
        amountCents: consentAmount(request, plans)!,
        locale,
        version: CONSENT_VERSION,
        text,
      },
    });
    const checkout = await getPaymentProvider().createCheckout(userId, {
      ...request,
      noticeText: text,
      resolvedPlan,
    });
    if (checkout.sessionId)
      await prisma.purchaseConsent.update({
        where: { id: record.id },
        data: { checkoutSessionId: checkout.sessionId },
      });
    return res.status(200).json({ url: checkout.url });
  } catch (error) {
    logError('Supporter checkout failed', { userId, planId, error });
    return res.status(500).json({ error: 'Checkout unavailable' });
  }
}
export default withAuth(handler, { rateLimitProfile: 'game_write' });
