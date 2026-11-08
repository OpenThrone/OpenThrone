import { describe, expect, it } from 'bun:test';

import {
  confirmCheckoutReturn,
  isSignedOutError,
  selectCheckoutNotice,
  shouldClearCheckoutReturn,
  SupporterRequestError,
} from './checkoutReturn';

describe('checkout notice priority', () => {
  it('shows only signed-out recovery when API errors overlap pending payment feedback', () => {
    expect(
      selectCheckoutNotice({
        signedOut: true,
        error: true,
        checkout: 'pending',
        success: true,
      }),
    ).toBe('signedOut');
    expect(
      selectCheckoutNotice({
        error: true,
        checkout: 'signedOut',
        subscribed: true,
        declined: true,
      }),
    ).toBe('signedOut');
  });

  it('prioritizes decline and duplicate subscription over generic errors, and errors over success', () => {
    expect(
      selectCheckoutNotice({
        declined: true,
        subscribed: true,
        error: true,
        success: true,
      }),
    ).toBe('declined');
    expect(
      selectCheckoutNotice({
        subscribed: true,
        error: true,
        checkout: 'pending',
      }),
    ).toBe('subscribed');
    expect(
      selectCheckoutNotice({
        error: true,
        checkout: 'confirmed',
        success: true,
      }),
    ).toBe('error');
  });

  it.each(['pending', 'confirming', 'confirmed', 'canceled'] as const)(
    'keeps the %s checkout state',
    (checkout) => {
      expect(selectCheckoutNotice({ checkout, success: true })).toBe(checkout);
    },
  );

  it('shows legacy success only without a more specific notice', () => {
    expect(selectCheckoutNotice({ success: true })).toBe('success');
    expect(selectCheckoutNotice({})).toBeNull();
  });
});

describe('checkout confirmation', () => {
  it('keeps a 401 return resumable without calling completion callbacks', async () => {
    let completed = false;
    const fetcher = (async () =>
      new Response(null, { status: 401 })) as typeof fetch;
    const state = await confirmCheckoutReturn(
      'cs_example',
      async () => {
        completed = true;
      },
      fetcher,
    );
    expect(state).toBe('signedOut');
    expect(completed).toBe(false);
    expect(shouldClearCheckoutReturn(state)).toBe(false);
  });

  it('keeps the URL when status or payment refresh is signed out after completion', async () => {
    const fetcher = (async () => Response.json({})) as typeof fetch;
    const state = await confirmCheckoutReturn(
      'cs_example',
      async () => {
        throw new SupporterRequestError(401);
      },
      fetcher,
    );
    expect(state).toBe('signedOut');
    expect(shouldClearCheckoutReturn(state)).toBe(false);
  });

  it('posts the session and reveals the gift only after a successful confirmation', async () => {
    let gift: string | undefined;
    const fetcher = (async (url, options) => {
      expect(url).toBe('/api/supporter/checkout/complete');
      expect(options?.method).toBe('POST');
      expect(JSON.parse(String(options?.body))).toEqual({
        sessionId: 'cs_example',
      });
      return Response.json({ giftCode: 'MOCK-GIFT' });
    }) as typeof fetch;
    const state = await confirmCheckoutReturn(
      'cs_example',
      async (code) => {
        gift = code;
      },
      fetcher,
    );
    expect(state).toBe('confirmed');
    expect(gift).toBe('MOCK-GIFT');
    expect(shouldClearCheckoutReturn(state)).toBe(true);
  });

  it('keeps failed confirmations pending and retryable', async () => {
    const fetcher = (async () =>
      new Response(null, { status: 500 })) as typeof fetch;
    const state = await confirmCheckoutReturn(
      'cs_example',
      async () => {},
      fetcher,
    );
    expect(state).toBe('pending');
    expect(shouldClearCheckoutReturn(state)).toBe(false);
    expect(shouldClearCheckoutReturn('canceled')).toBe(true);
  });

  it('does not mistake other failures for signed-out errors', () => {
    expect(isSignedOutError(new SupporterRequestError(401))).toBe(true);
    expect(isSignedOutError(new SupporterRequestError(500))).toBe(false);
    expect(isSignedOutError(new Error('401'))).toBe(false);
    expect(isSignedOutError(undefined)).toBe(false);
  });
});
