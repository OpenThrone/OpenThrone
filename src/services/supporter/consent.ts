import { SUPPORTER_PLANS } from '@/services/supporter/plans';
import type {
  CheckoutRequest,
  SupporterPlan,
  SupporterPlanId,
} from '@/types/supporter';

/**
 * Pre-checkout consent. The same function renders the text in the browser
 * (with next-i18next) and on the server (from the locale files), so the
 * stored PurchaseConsent row is exactly what the buyer saw. Bump the version
 * whenever the consent copy changes.
 */
export const CONSENT_VERSION = '2026-10-29';

type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/** Fixed format so browser and server render identical text. */
export const consentPrice = (cents: number) =>
  `$${(cents / 100).toFixed(2)} USD`;

export function consentAmount(
  request: CheckoutRequest,
  plans: Record<SupporterPlanId, SupporterPlan> = SUPPORTER_PLANS,
): number | null {
  if (request.planId === 'alliance_sponsorship')
    return Number.isSafeInteger(request.amountCents)
      ? request.amountCents!
      : null;
  return (
    request.quotedPriceCents ??
    plans[request.planId as SupporterPlanId]?.priceCents ??
    null
  );
}

export function consentText(
  t: Translate,
  request: CheckoutRequest,
  allianceName?: string,
  plans: Record<SupporterPlanId, SupporterPlan> = SUPPORTER_PLANS,
): string {
  const amount = consentAmount(request, plans);
  if (amount === null) return '';
  const price = consentPrice(amount);
  const plan =
    request.planId === 'alliance_sponsorship' ? null : plans[request.planId];
  const purchase =
    request.planId === 'alliance_sponsorship'
      ? t('consent.sponsorship', { price, alliance: allianceName ?? '' })
      : plan?.kind === 'SUBSCRIPTION'
        ? t('consent.monthly', { price })
        : plan?.kind === 'GIFT'
          ? t('consent.gift', { price, days: (plan.grantMonths ?? 0) * 30 })
          : t('consent.pass', { price, days: plan?.grantDays ?? 0 });
  return `${purchase} ${t('consent.eligibility')}`;
}
