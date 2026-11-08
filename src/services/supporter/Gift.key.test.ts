import { afterEach, describe, expect, it } from 'bun:test';
import { createHmac } from 'crypto';

import { giftCodeFor } from '@/services/supporter/Gift.service';

const KEYS = ['GIFT_CODE_SECRET', 'NEXTAUTH_SECRET', 'JWT_SECRET'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const rawCode = (key: string | Buffer, paymentId: number) =>
  createHmac('sha256', key)
    .update(`ot-gift:${paymentId}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();

describe('gift code key', () => {
  afterEach(() => {
    for (const k of KEYS)
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
  });

  it('keeps the original derivation for GIFT_CODE_SECRET and NEXTAUTH_SECRET', () => {
    for (const k of KEYS) delete process.env[k];
    process.env.GIFT_CODE_SECRET = 'gift-test-secret';
    expect(giftCodeFor(7).raw).toBe(rawCode('gift-test-secret', 7));
    delete process.env.GIFT_CODE_SECRET;
    process.env.NEXTAUTH_SECRET = 'auth-test-secret';
    expect(giftCodeFor(7).raw).toBe(rawCode('auth-test-secret', 7));
  });

  it('never uses JWT_SECRET raw: the fallback derives a labelled key', () => {
    for (const k of KEYS) delete process.env[k];
    process.env.JWT_SECRET = 'jwt-test-secret';
    const derived = createHmac('sha256', 'jwt-test-secret')
      .update('ot-gift-key-v1')
      .digest();
    expect(giftCodeFor(7).raw).toBe(rawCode(derived, 7));
    expect(giftCodeFor(7).raw).not.toBe(rawCode('jwt-test-secret', 7));
  });
});
