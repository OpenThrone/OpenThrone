import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

import {
  isRecruitmentCaptchaRequired,
  verifyRecruitmentCaptcha,
} from './RecruitmentCaptcha.service';

const keys = [
  'DISABLE_TURNSTILE',
  'NEXT_PUBLIC_DISABLE_TURNSTILE',
  'NEXT_PUBLIC_USE_CAPTCHA',
  'TURNSTILE_SECRET',
  'NEXT_PUBLIC_TURNSTILE_SECRET',
] as const;
let original: (string | undefined)[];
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  original = keys.map((key) => process.env[key]);
  for (const key of keys) delete process.env[key];
  process.env.NEXT_PUBLIC_USE_CAPTCHA = 'true';
  process.env.TURNSTILE_SECRET = 'synthetic-test-secret';
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  });
});

describe('recruitment CAPTCHA enforcement', () => {
  it('rejects missing challenges without contacting the provider', async () => {
    expect(isRecruitmentCaptchaRequired()).toBe(true);
    expect(await verifyRecruitmentCaptcha(undefined, '192.0.2.1')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed when enabled without a server secret', async () => {
    delete process.env.TURNSTILE_SECRET;
    expect(await verifyRecruitmentCaptcha('token', '192.0.2.1')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a successful verification and sends the resolved IP', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    expect(await verifyRecruitmentCaptcha('token', '192.0.2.1')).toBe(true);
    const request = fetchSpy.mock.calls[0][1];
    expect((request?.body as URLSearchParams).get('remoteip')).toBe(
      '192.0.2.1',
    );
  });

  it('rejects replayed or invalid tokens', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false })),
    );
    expect(await verifyRecruitmentCaptcha('used-token', '192.0.2.1')).toBe(
      false,
    );
  });

  it('rejects provider outages and malformed responses', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('unavailable'));
    expect(await verifyRecruitmentCaptcha('token', '192.0.2.1')).toBe(false);
    fetchSpy.mockResolvedValueOnce(new Response('not json'));
    expect(await verifyRecruitmentCaptcha('token', '192.0.2.1')).toBe(false);
  });

  it('honors the explicit site CAPTCHA disable setting', async () => {
    process.env.DISABLE_TURNSTILE = 'true';
    expect(isRecruitmentCaptchaRequired()).toBe(false);
    expect(await verifyRecruitmentCaptcha(undefined, '192.0.2.1')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
