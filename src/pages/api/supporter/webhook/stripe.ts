import type { NextApiRequest, NextApiResponse } from 'next';
import type Stripe from 'stripe';

import { getStripeClient } from '@/services/supporter/StripeClient';
import { handleStripeWebhook } from '@/services/supporter/StripeEvents.service';
import { logError } from '@/utils/logger';

export const config = { api: { bodyParser: false } };

const MAX_BYTES = 1024 * 1024;

async function rawBody(req: NextApiRequest) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BYTES) throw new Error('Payload too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Stripe webhook. Unauthenticated by design: the signature is the
 * authorization. Verified events are mapped to the sanitized inbox; a
 * processing failure is stored as FAILED (admin replay) and still answers
 * 200 so Stripe does not retry forever. Mapping errors (e.g. Stripe API
 * unreachable) answer 500 so Stripe retries.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (
    process.env.PAYMENT_PROVIDER !== 'stripe' ||
    !process.env.STRIPE_WEBHOOK_SECRET
  )
    return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string')
    return res.status(400).json({ error: 'Missing signature' });
  let event: Stripe.Event;
  try {
    event = await getStripeClient().webhooks.constructEventAsync(
      await rawBody(req),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  try {
    const results = await handleStripeWebhook(event);
    return res.status(200).json({ received: true, results });
  } catch (error) {
    logError('Stripe webhook mapping failed', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
