import { MockProvider } from '@/services/supporter/MockProvider';
import type { PricedSupporterPlan } from '@/services/supporter/planPrices';
import { StripeProvider } from '@/services/supporter/StripeProvider';
import type { CheckoutRequest } from '@/types/supporter';

export interface PaymentProvider {
  createCheckout(
    userId: number,
    /** noticeText: the consent the buyer accepted, repeated on the pay page. */
    request: CheckoutRequest & {
      noticeText?: string;
      resolvedPlan?: PricedSupporterPlan;
    },
  ): Promise<{ url: string; sessionId?: string }>;
  createPortalSession(userId: number): Promise<{ url: string }>;
  refund(
    paymentId: string,
    amountCents: number,
    metadata?: { reason: string; createdById: number },
  ): Promise<void | string>;
  parseWebhook(payload: unknown): Promise<unknown>;
  /**
   * Stops future charges: at once, or when the paid period ends. Idempotent;
   * resolves false when the provider had nothing left to change.
   */
  cancelSubscription(
    subscriptionId: string,
    when: 'now' | 'period_end',
  ): Promise<boolean>;
}
export function getPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER ?? 'mock';
  if (provider === 'stripe') return new StripeProvider();
  if (provider !== 'mock') throw new Error('Unknown payment provider');
  return new MockProvider();
}

/** The provider that took a given payment (refunds must go back through it). */
export function getPaymentProviderFor(name: string): PaymentProvider {
  if (name === 'stripe') return new StripeProvider();
  if (name === 'mock') return new MockProvider();
  throw new Error('Unknown payment provider');
}
