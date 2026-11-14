import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const { invalidateRuntimeConfigCache } = require('./RuntimeConfig.service');
const {
  issueAltchaChallenge,
  resetAltchaKeyWarning,
} = require('./AltchaCaptcha.service');
const {
  getRecruitmentCaptcha,
  verifyRecruitmentCaptcha,
} = require('./RecruitmentCaptcha.service');

const keys = [
  'DISABLE_TURNSTILE',
  'NEXT_PUBLIC_DISABLE_TURNSTILE',
  'NEXT_PUBLIC_USE_CAPTCHA',
  'TURNSTILE_SECRET',
  'NEXT_PUBLIC_TURNSTILE_SECRET',
  'ALTCHA_HMAC_KEY',
] as const;
let original: (string | undefined)[];
let fetchSpy: ReturnType<typeof vi.spyOn>;
const used = new Set<string>();

/** Admin setting rows; the provider defaults to ALTCHA when there is none. */
const setProvider = (provider?: 'altcha' | 'turnstile') => {
  mockPrisma.serverSetting.findMany.mockResolvedValue(
    provider ? [{ key: 'recruit.captchaProvider', value: provider }] : [],
  );
  invalidateRuntimeConfigCache();
};

/** What the widget sends after solving a fresh challenge. */
async function solvedPayload() {
  const challenge = await issueAltchaChallenge(60);
  const solution = await solveChallenge({ challenge, deriveKey });
  return btoa(JSON.stringify({ challenge, solution }));
}

beforeEach(() => {
  original = keys.map((key) => process.env[key]);
  for (const key of keys) delete process.env[key];
  process.env.ALTCHA_HMAC_KEY = 'synthetic-test-hmac-key-0123456789';
  process.env.TURNSTILE_SECRET = 'synthetic-test-secret';
  resetMockPrisma();
  used.clear();
  resetAltchaKeyWarning();
  mockPrisma.altchaUsedChallenge = {
    create: vi.fn(async ({ data }: any) => {
      if (used.has(data.nonce))
        throw Object.assign(new Error('dup'), { code: 'P2002' });
      used.add(data.nonce);
      return data;
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  setProvider();
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  });
});

describe('recruitment captcha provider switch', () => {
  it('uses ALTCHA unless an administrator switches to Turnstile', async () => {
    expect(await getRecruitmentCaptcha()).toEqual({
      required: true,
      provider: 'altcha',
    });
    setProvider('turnstile');
    expect(await getRecruitmentCaptcha()).toEqual({
      required: true,
      provider: 'turnstile',
    });
  });

  it('is off entirely for either provider when NEXT_PUBLIC_USE_CAPTCHA=false', async () => {
    process.env.NEXT_PUBLIC_USE_CAPTCHA = 'false';
    for (const provider of ['altcha', 'turnstile'] as const) {
      setProvider(provider);
      expect(await getRecruitmentCaptcha()).toEqual({
        required: false,
        provider: null,
      });
      expect(await verifyRecruitmentCaptcha(undefined, '192.0.2.1')).toBe(true);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lets the Turnstile switches turn off Turnstile only', async () => {
    for (const name of [
      'DISABLE_TURNSTILE',
      'NEXT_PUBLIC_DISABLE_TURNSTILE',
    ] as const) {
      process.env[name] = 'true';
      setProvider('turnstile');
      expect(await getRecruitmentCaptcha()).toEqual({
        required: false,
        provider: null,
      });
      expect(await verifyRecruitmentCaptcha(undefined, '192.0.2.1')).toBe(true);
      // ALTCHA keeps guarding recruiting while sign-in stays captcha-free.
      setProvider('altcha');
      expect(await getRecruitmentCaptcha()).toEqual({
        required: true,
        provider: 'altcha',
      });
      expect(await verifyRecruitmentCaptcha(undefined, '192.0.2.1')).toBe(
        false,
      );
      delete process.env[name];
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fall back to a switched-off Turnstile when the ALTCHA key is missing', async () => {
    delete process.env.ALTCHA_HMAC_KEY;
    process.env.DISABLE_TURNSTILE = 'true';
    expect(await getRecruitmentCaptcha()).toEqual({
      required: false,
      provider: null,
    });
    process.env.NEXT_PUBLIC_USE_CAPTCHA = 'true';
    expect(await getRecruitmentCaptcha()).toEqual({
      required: true,
      provider: 'altcha',
    });
    expect(await verifyRecruitmentCaptcha('anything', '192.0.2.1')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('needs no captcha when nothing is configured', async () => {
    delete process.env.ALTCHA_HMAC_KEY;
    delete process.env.TURNSTILE_SECRET;
    expect(await getRecruitmentCaptcha()).toEqual({
      required: false,
      provider: null,
    });
    expect(await verifyRecruitmentCaptcha(undefined, '192.0.2.1')).toBe(true);
  });
});

describe('recruitment ALTCHA enforcement', () => {
  it('accepts a solved payload once, locally, with no network call', async () => {
    const payload = await solvedPayload();
    expect(await verifyRecruitmentCaptcha(payload, '192.0.2.1')).toBe(true);
    expect(await verifyRecruitmentCaptcha(payload, '192.0.2.1')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing payload', async () => {
    expect(await verifyRecruitmentCaptcha(undefined, '192.0.2.1')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to Turnstile when the key is missing or too short', async () => {
    for (const key of [undefined, 'short-key']) {
      if (key === undefined) delete process.env.ALTCHA_HMAC_KEY;
      else process.env.ALTCHA_HMAC_KEY = key;
      expect(await getRecruitmentCaptcha()).toEqual({
        required: true,
        provider: 'turnstile',
      });
      // Still a captcha: no token is no recruit.
      expect(await verifyRecruitmentCaptcha(undefined, '192.0.2.1')).toBe(
        false,
      );
    }
  });

  it('fails closed without a key when Turnstile is not configured either', async () => {
    const payload = await solvedPayload();
    delete process.env.ALTCHA_HMAC_KEY;
    delete process.env.TURNSTILE_SECRET;
    process.env.NEXT_PUBLIC_USE_CAPTCHA = 'true';
    expect(await getRecruitmentCaptcha()).toEqual({
      required: true,
      provider: 'altcha',
    });
    expect(await verifyRecruitmentCaptcha(payload, '192.0.2.1')).toBe(false);
    expect(await verifyRecruitmentCaptcha('token', '192.0.2.1')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not take a Turnstile-style token', async () => {
    expect(
      await verifyRecruitmentCaptcha('0.abc-turnstile-token', '192.0.2.1'),
    ).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('recruitment Turnstile enforcement', () => {
  beforeEach(() => setProvider('turnstile'));

  it('rejects missing challenges without contacting the provider', async () => {
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

  it('does not take an ALTCHA payload', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false })),
    );
    expect(
      await verifyRecruitmentCaptcha(await solvedPayload(), '192.0.2.1'),
    ).toBe(false);
  });
});
