import Stripe from 'stripe';

let client: Stripe | undefined;

export function isStripeTestMode() {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return key.startsWith('sk_test_') || key.startsWith('rk_test_');
}

/** Lazily built client; live keys only with an explicit production opt-in. */
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required');
  if (
    (key.startsWith('sk_live_') || key.startsWith('rk_live_')) &&
    (process.env.SUPPORTER_ALLOW_LIVE !== '1' ||
      process.env.NODE_ENV !== 'production')
  )
    throw new Error('Live Stripe keys are disabled');
  if (!client) client = new Stripe(key, { apiVersion: '2026-09-30.endive' });
  return client;
}
