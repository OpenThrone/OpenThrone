import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const allow = { value: true };
vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: vi.fn(async () => allow.value),
}));

const {
  invalidateRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');
const { resetAltchaKeyWarning } = require('@/services/AltchaCaptcha.service');
const handler =
  require('../../../../pages/api/recruit/captcha-challenge').default;

const keys = [
  'ALTCHA_HMAC_KEY',
  'DISABLE_TURNSTILE',
  'NEXT_PUBLIC_USE_CAPTCHA',
  'TURNSTILE_SECRET',
] as const;
let original: (string | undefined)[];

const run = async (method = 'GET') => {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, headers: {}, socket: {} }, res);
  return res;
};

beforeEach(() => {
  original = keys.map((key) => process.env[key]);
  for (const key of keys) delete process.env[key];
  process.env.ALTCHA_HMAC_KEY = 'synthetic-test-hmac-key-0123456789';
  resetMockPrisma();
  resetAltchaKeyWarning();
  allow.value = true;
  mockPrisma.serverSetting.findMany.mockResolvedValue([]);
  invalidateRuntimeConfigCache();
});

afterEach(() => {
  keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  });
});

describe('GET /api/recruit/captcha-challenge', () => {
  it('returns an uncached signed challenge', async () => {
    const res = await run();
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(200);
    const challenge = res.json.mock.calls[0][0];
    expect(challenge.signature).toBeTruthy();
    expect(challenge.parameters.algorithm).toBe('PBKDF2/SHA-256');
  });

  it('sets no cookie of its own and takes GET only', async () => {
    const res = await run();
    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Set-Cookie',
      expect.anything(),
    );
    const post = await run('POST');
    expect(post.status).toHaveBeenCalledWith(405);
  });

  it('is rate limited per IP', async () => {
    allow.value = false;
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ parameters: expect.anything() }),
    );
  });

  it('uses the difficulty setting', async () => {
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'recruit.altchaDifficulty', value: 100 },
    ]);
    invalidateRuntimeConfigCache();
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].parameters.cost).toBeGreaterThan(0);
  });

  it('issues nothing while Turnstile is the provider', async () => {
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'recruit.captchaProvider', value: 'turnstile' },
    ]);
    invalidateRuntimeConfigCache();
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ALTCHA_NOT_IN_USE' }),
    );
  });

  it('issues nothing when every captcha is switched off', async () => {
    process.env.NEXT_PUBLIC_USE_CAPTCHA = 'false';
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('still issues challenges when only Turnstile is switched off', async () => {
    process.env.DISABLE_TURNSTILE = 'true';
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('issues nothing when a missing key fell back to Turnstile', async () => {
    delete process.env.ALTCHA_HMAC_KEY;
    process.env.TURNSTILE_SECRET = 'synthetic-test-secret';
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ALTCHA_NOT_IN_USE' }),
    );
  });

  it('answers 503 when the key is missing and there is no Turnstile', async () => {
    delete process.env.ALTCHA_HMAC_KEY;
    delete process.env.TURNSTILE_SECRET;
    process.env.NEXT_PUBLIC_USE_CAPTCHA = 'true';
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CAPTCHA_UNAVAILABLE' }),
    );
  });
});
