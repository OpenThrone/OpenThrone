export type CheckoutReturnState =
  | 'confirming'
  | 'confirmed'
  | 'canceled'
  | 'pending'
  | 'signedOut';

export type CheckoutNoticeState =
  | CheckoutReturnState
  | 'subscribed'
  | 'priceChanged'
  | 'declined'
  | 'error'
  | 'success';

export class SupporterRequestError extends Error {
  constructor(public readonly status: number) {
    super('Supporter request failed');
  }
}

export function isSignedOutError(error: unknown): boolean {
  return error instanceof SupporterRequestError && error.status === 401;
}

/** A single recovery action wins over lower-priority checkout feedback. */
export function selectCheckoutNotice({
  signedOut = false,
  declined = false,
  subscribed = false,
  priceChanged = false,
  error = false,
  checkout = null,
  success = false,
}: {
  signedOut?: boolean;
  declined?: boolean;
  subscribed?: boolean;
  priceChanged?: boolean;
  error?: boolean;
  checkout?: CheckoutReturnState | null;
  success?: boolean;
}): CheckoutNoticeState | null {
  if (signedOut || checkout === 'signedOut') return 'signedOut';
  if (priceChanged) return 'priceChanged';
  if (declined) return 'declined';
  if (subscribed) return 'subscribed';
  if (error) return 'error';
  if (checkout) return checkout;
  return success ? 'success' : null;
}

/** Keep failures resumable; only confirmed checkout returns may lose their URL. */
export async function confirmCheckoutReturn(
  sessionId: string,
  onComplete: (giftCode?: string) => Promise<void>,
  fetcher: typeof fetch = fetch,
): Promise<CheckoutReturnState> {
  try {
    const response = await fetcher('/api/supporter/checkout/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (!response.ok) throw new SupporterRequestError(response.status);
    const result: { giftCode?: string } = await response.json();
    await onComplete(result.giftCode);
    return 'confirmed';
  } catch (error) {
    return isSignedOutError(error) ? 'signedOut' : 'pending';
  }
}

export function shouldClearCheckoutReturn(state: CheckoutReturnState): boolean {
  return state === 'confirmed' || state === 'canceled';
}
