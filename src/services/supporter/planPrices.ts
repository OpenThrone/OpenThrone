import type Stripe from 'stripe';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma, SupporterPlanPrice } from '@/lib/prisma-exports';
import { SUPPORTER_PLANS } from '@/services/supporter/plans';
import { getStripeClient } from '@/services/supporter/StripeClient';
import type { SupporterPlan, SupporterPlanId } from '@/types/supporter';
import { logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

export const planPriceSchema = z.object({
  planId: z.enum([
    'supporter_monthly',
    'supporter_era_pass',
    'gift_1m',
    'gift_3m',
    'gift_12m',
  ]),
  priceCents: z.number().int().min(100).max(100000),
  currency: z.literal('usd'),
  /** The price the admin saw; a different stored price means a stale edit. */
  expectedCents: z.number().int().min(0),
});
export type PricedSupporterPlan = SupporterPlan & {
  providerPriceId: string | null;
};

/** No process cache: every checkout sees the committed catalog revision. */
export async function getSupporterPlans(
  client: Pick<Prisma.TransactionClient, 'supporterPlanPrice'> = prisma,
): Promise<Record<SupporterPlanId, PricedSupporterPlan>> {
  return mergeSupporterPlans(await client.supporterPlanPrice.findMany());
}

function mergeSupporterPlans(
  rows: SupporterPlanPrice[],
): Record<SupporterPlanId, PricedSupporterPlan> {
  return Object.fromEntries(
    Object.values(SUPPORTER_PLANS).map((plan) => {
      const row = rows.find((entry) => entry.planId === plan.id);
      return [
        plan.id,
        {
          ...plan,
          priceCents: row?.priceCents ?? plan.priceCents,
          providerPriceId: row?.providerPriceId ?? null,
        },
      ];
    }),
  ) as Record<SupporterPlanId, PricedSupporterPlan>;
}

export async function getAdminSupporterPlans() {
  const rows = await prisma.supporterPlanPrice.findMany();
  const plans = mergeSupporterPlans(rows);
  const users = await prisma.users.findMany({
    where: {
      id: {
        in: rows.flatMap((row) =>
          row.updatedById === null ? [] : [row.updatedById],
        ),
      },
    },
    select: { id: true, display_name: true },
  });
  return Object.values(plans).map((plan) => {
    const row = rows.find((entry) => entry.planId === plan.id);
    return {
      ...plan,
      updatedById: row?.updatedById ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedByName:
        users.find((user) => user.id === row?.updatedById)?.display_name ??
        null,
    };
  });
}

/** Serialize rotations per plan, including the initial absent/default row. */
export async function saveSupporterPlanPrice(
  input: unknown,
  actor: { userId: number; ip: string },
  stripe?: Stripe,
) {
  const { expectedCents, ...value } = planPriceSchema.parse(input);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`supporter-price:${value.planId}`}))::text`;
      const old = (await getSupporterPlans(tx))[value.planId];
      if (old.priceCents !== expectedCents) throw new Error('price_conflict');
      if (old.priceCents === value.priceCents) return;
      let providerPriceId: string | null = null;
      let rollback: (() => Promise<unknown>) | null = null;
      const provider = process.env.PAYMENT_PROVIDER ?? 'mock';
      if (provider === 'stripe') {
        try {
          const api = stripe ?? getStripeClient();
          const lookup = `ot_${value.planId}`;
          const existing = await api.prices.list({
            lookup_keys: [lookup],
            active: true,
            limit: 1,
          });
          const product = existing.data[0]?.product;
          const productId = typeof product === 'string' ? product : product?.id;
          if (!productId) throw new Error('stripe_price_failed');
          const price = await api.prices.create({
            product: productId,
            currency: 'usd',
            unit_amount: value.priceCents,
            lookup_key: lookup,
            transfer_lookup_key: true,
            ...(old.kind === 'SUBSCRIPTION'
              ? { recurring: { interval: 'month' as const } }
              : {}),
          });
          providerPriceId = price.id;
          const previousId = existing.data[0]?.id;
          // If the database write below fails, hand the lookup key back so
          // checkout keeps charging the price the database still shows.
          rollback = async () => {
            if (previousId)
              await api.prices.update(previousId, {
                lookup_key: lookup,
                transfer_lookup_key: true,
              });
            await api.prices.update(price.id, { active: false });
          };
        } catch {
          throw new Error('stripe_price_failed');
        }
      } else if (provider !== 'mock')
        throw new Error('Unknown payment provider');
      try {
        await tx.supporterPlanPrice.upsert({
          where: { planId: value.planId },
          create: { ...value, providerPriceId, updatedById: actor.userId },
          update: { ...value, providerPriceId, updatedById: actor.userId },
        });
        await logActionStrict(
          {
            ...actor,
            action: 'ADMIN_SUPPORTER_PRICE_UPDATE',
            details: {
              planId: value.planId,
              oldCents: old.priceCents,
              newCents: value.priceCents,
              currency: 'usd',
              providerPriceId,
            },
          },
          tx,
        );
      } catch (error) {
        await rollback?.().catch((rollbackError) =>
          logError('Supporter price rollback failed', {
            planId: value.planId,
            message:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          }),
        );
        throw error;
      }
    },
    { timeout: 30000 },
  );
}
