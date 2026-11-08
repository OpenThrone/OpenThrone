import Stripe from 'stripe';

import prisma from '../src/lib/prisma';
import { getSupporterPlans } from '../src/services/supporter/planPrices';
import type { SupporterPlanId } from '../src/types/supporter';

const names: Record<SupporterPlanId, string> = {
  supporter_monthly: 'OpenThrone Patron — Monthly',
  supporter_era_pass: 'OpenThrone Patron — Era pass (100 days)',
  gift_1m: 'OpenThrone gift — 1 month',
  gift_3m: 'OpenThrone gift — 3 months',
  gift_12m: 'OpenThrone gift — 12 months',
};

export async function syncProducts(
  stripe: Stripe,
  dryRun = false,
  returnUrl?: string,
) {
  const results: string[] = [];
  // List rather than search: search is eventually consistent, so a quick
  // second run could miss a just-created product and duplicate it.
  const owned: Stripe.Product[] = [];
  for await (const product of stripe.products.list({
    active: true,
    limit: 100,
  }))
    if (product.metadata?.ot_plan_id) owned.push(product);
  for (const plan of Object.values(await getSupporterPlans())) {
    let product = owned.find((p) => p.metadata.ot_plan_id === plan.id);
    let created = false;
    if (!product && !dryRun) {
      product = await stripe.products.create({
        name: names[plan.id],
        metadata: { ot_plan_id: plan.id },
      });
      created = true;
    }
    const existing = (
      await stripe.prices.list({
        lookup_keys: [`ot_${plan.id}`],
        active: true,
        limit: 100,
      })
    ).data[0];
    const matches =
      existing &&
      existing.unit_amount === plan.priceCents &&
      existing.currency === plan.currency &&
      (existing.recurring?.interval ?? null) === plan.interval &&
      existing.product === product?.id;
    let price = existing;
    if (!matches && !dryRun && product) {
      price = await stripe.prices.create({
        product: product.id,
        currency: plan.currency,
        unit_amount: plan.priceCents,
        lookup_key: `ot_${plan.id}`,
        ...(existing ? { transfer_lookup_key: true } : {}),
        ...(plan.interval ? { recurring: { interval: plan.interval } } : {}),
      });
      if (existing) await stripe.prices.update(existing.id, { active: false });
    }
    if (!dryRun && price && plan.providerPriceId !== price.id)
      await prisma.supporterPlanPrice.updateMany({
        where: { planId: plan.id },
        data: { providerPriceId: price.id },
      });
    results.push(
      `${plan.id} → ${product?.id ?? '(new)'} ${price?.id ?? '(new)'} ${plan.priceCents} ${created || !existing ? 'created' : matches ? 'unchanged' : 'updated'}${dryRun && !matches ? ' (dry run)' : ''}`,
    );
  }
  const configs = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  let portal =
    configs.data.find((config) => config.is_default) ??
    configs.data.find((config) => config.metadata?.ot_supporter === 'true');
  if (!portal && !dryRun) {
    portal = await stripe.billingPortal.configurations.create({
      business_profile: { headline: 'OpenThrone patronage' },
      metadata: { ot_supporter: 'true' },
      features: {
        subscription_cancel: { enabled: true, mode: 'at_period_end' },
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: { enabled: false },
        subscription_update: { enabled: false },
      },
      ...(returnUrl
        ? {
            default_return_url: `${returnUrl.replace(/\/$/, '')}/home/supporter`,
          }
        : {}),
    });
  }
  results.push(
    `portal → ${portal?.id ?? '(new)'}${dryRun && !portal ? ' (dry run)' : ''}`,
  );
  return results;
}

if (import.meta.main) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required');
  if (/^(sk|rk)_live_/.test(key) && process.env.SUPPORTER_ALLOW_LIVE !== '1')
    throw new Error('Live Stripe keys require SUPPORTER_ALLOW_LIVE=1');
  const stripe = new Stripe(key, { apiVersion: '2026-09-30.endive' });
  syncProducts(
    stripe,
    process.argv.includes('--dry-run'),
    process.env.NEXTAUTH_URL,
  )
    .then((results) => results.forEach((result) => console.log(result)))
    .catch(() => {
      console.error('Stripe product synchronization failed.');
      process.exitCode = 1;
    });
}
