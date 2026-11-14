import { createChallenge, solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2';
import { deriveHmacKeySecret } from 'altcha-lib/frameworks/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
const logError = vi.fn();
vi.mock('@/utils/logger', () => ({
  logError: (...args: unknown[]) => logError(...args),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
}));

const {
  ALTCHA_CHALLENGE_TTL_MS,
  ALTCHA_MAX_PAYLOAD_LENGTH,
  issueAltchaChallenge,
  resetAltchaKeyWarning,
  verifyAltchaPayload,
} = require('./AltchaCaptcha.service');

// Synthetic key; not used anywhere else.
const KEY = 'synthetic-test-hmac-key-0123456789';
const DIFFICULTY = 60;
let original: string | undefined;
const used = new Set<string>();

/** What the widget does in the browser: find the counter, then base64 the pair. */
async function solve(challenge: any, tamper?: (payload: any) => void) {
  const solution = await solveChallenge({ challenge, deriveKey });
  const payload: any = { challenge, solution };
  tamper?.(payload);
  return btoa(JSON.stringify(payload));
}

beforeEach(() => {
  original = process.env.ALTCHA_HMAC_KEY;
  process.env.ALTCHA_HMAC_KEY = KEY;
  resetMockPrisma();
  used.clear();
  logError.mockClear();
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
});

afterEach(() => {
  if (original === undefined) delete process.env.ALTCHA_HMAC_KEY;
  else process.env.ALTCHA_HMAC_KEY = original;
});

describe('ALTCHA challenge issue', () => {
  it('signs a recruit-scoped PBKDF2 challenge that expires in five minutes', async () => {
    const now = Date.now();
    const challenge = await issueAltchaChallenge(DIFFICULTY, now);
    expect(challenge?.signature).toBeTruthy();
    expect(challenge?.parameters.algorithm).toBe('PBKDF2/SHA-256');
    expect(challenge?.parameters.data).toEqual({ scope: 'recruit' });
    expect(challenge?.parameters.expiresAt).toBe(
      Math.floor((now + ALTCHA_CHALLENGE_TTL_MS) / 1000),
    );
    // The answer's counter is hidden server-side; the key signature proves it.
    expect(challenge?.parameters.keySignature).toBeTruthy();
  });

  it('fails closed, and logs once, when the key is missing', async () => {
    delete process.env.ALTCHA_HMAC_KEY;
    expect(await issueAltchaChallenge(DIFFICULTY)).toBeNull();
    expect(await issueAltchaChallenge(DIFFICULTY)).toBeNull();
    expect(await verifyAltchaPayload('anything')).toBe(false);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('refuses a key that is too short to protect anything', async () => {
    process.env.ALTCHA_HMAC_KEY = 'short';
    expect(await issueAltchaChallenge(DIFFICULTY)).toBeNull();
  });
});

describe('ALTCHA payload verification', () => {
  it('accepts a solved challenge once and refuses the replay', async () => {
    const challenge = await issueAltchaChallenge(DIFFICULTY);
    const payload = await solve(challenge);
    expect(await verifyAltchaPayload(payload)).toBe(true);
    expect(await verifyAltchaPayload(payload)).toBe(false);
    expect(mockPrisma.altchaUsedChallenge.create).toHaveBeenCalledTimes(2);
    expect(used.size).toBe(1);
  });

  it('refuses a missing, malformed or oversized payload without touching the table', async () => {
    for (const token of [
      undefined,
      null,
      '',
      42,
      'not base64 !!',
      btoa('{}'),
      btoa('[]'),
    ]) {
      expect(await verifyAltchaPayload(token)).toBe(false);
    }
    expect(
      await verifyAltchaPayload('a'.repeat(ALTCHA_MAX_PAYLOAD_LENGTH + 1)),
    ).toBe(false);
    expect(mockPrisma.altchaUsedChallenge.create).not.toHaveBeenCalled();
  });

  it('refuses a challenge whose parameters were changed after signing', async () => {
    const challenge = await issueAltchaChallenge(DIFFICULTY);
    const payload = await solve(challenge, (value) => {
      // Cheaper work for the same signature.
      value.challenge.parameters.cost = 1;
    });
    expect(await verifyAltchaPayload(payload)).toBe(false);
    expect(mockPrisma.altchaUsedChallenge.create).not.toHaveBeenCalled();
  });

  it('refuses a wrong solution', async () => {
    const challenge = await issueAltchaChallenge(DIFFICULTY);
    const payload = await solve(challenge, (value) => {
      // The derived key is the proof of work; a guessed one fails its signature.
      value.solution.derivedKey = '00'.repeat(32);
    });
    expect(await verifyAltchaPayload(payload)).toBe(false);
  });

  it('refuses a challenge signed with another key', async () => {
    const foreign = 'a-different-synthetic-key-9876543210';
    const challenge = await createChallenge({
      algorithm: 'PBKDF2/SHA-256',
      cost: 1000,
      counter: 30,
      data: { scope: 'recruit' },
      deriveKey,
      expiresAt: new Date(Date.now() + 60_000),
      hmacKeySignatureSecret: await deriveHmacKeySecret(foreign),
      hmacSignatureSecret: foreign,
    });
    expect(await verifyAltchaPayload(await solve(challenge))).toBe(false);
  });

  it('refuses an expired challenge', async () => {
    const issuedLongAgo = Date.now() - 2 * ALTCHA_CHALLENGE_TTL_MS;
    const challenge = await issueAltchaChallenge(DIFFICULTY, issuedLongAgo);
    expect(await verifyAltchaPayload(await solve(challenge))).toBe(false);
    expect(mockPrisma.altchaUsedChallenge.create).not.toHaveBeenCalled();
  });

  it('refuses a challenge signed for another scope', async () => {
    const challenge = await createChallenge({
      algorithm: 'PBKDF2/SHA-256',
      cost: 1000,
      counter: 30,
      data: { scope: 'login' },
      deriveKey,
      expiresAt: new Date(Date.now() + 60_000),
      hmacKeySignatureSecret: await deriveHmacKeySecret(KEY),
      hmacSignatureSecret: KEY,
    });
    expect(await verifyAltchaPayload(await solve(challenge))).toBe(false);
  });

  it('refuses when the replay table cannot be written', async () => {
    mockPrisma.altchaUsedChallenge.create.mockRejectedValueOnce(
      new Error('db down'),
    );
    const challenge = await issueAltchaChallenge(DIFFICULTY);
    expect(await verifyAltchaPayload(await solve(challenge))).toBe(false);
    expect(logError).toHaveBeenCalled();
  });
});
