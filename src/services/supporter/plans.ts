import type { SupporterPlan, SupporterPlanId } from '@/types/supporter';

export const SUPPORTER_PLANS: Record<SupporterPlanId, SupporterPlan> = {
  supporter_monthly: {
    id: 'supporter_monthly',
    kind: 'SUBSCRIPTION',
    priceCents: 499,
    currency: 'usd',
    interval: 'month',
    grantMonths: null,
    grantDays: null,
  },
  supporter_era_pass: {
    id: 'supporter_era_pass',
    kind: 'ONE_TIME',
    priceCents: 1299,
    currency: 'usd',
    interval: null,
    grantMonths: null,
    grantDays: 100,
  },
  gift_1m: {
    id: 'gift_1m',
    kind: 'GIFT',
    priceCents: 499,
    currency: 'usd',
    interval: null,
    grantMonths: 1,
    grantDays: null,
  },
  gift_3m: {
    id: 'gift_3m',
    kind: 'GIFT',
    priceCents: 1399,
    currency: 'usd',
    interval: null,
    grantMonths: 3,
    grantDays: null,
  },
  gift_12m: {
    id: 'gift_12m',
    kind: 'GIFT',
    priceCents: 4999,
    currency: 'usd',
    interval: null,
    grantMonths: 12,
    grantDays: null,
  },
};
