import type { Challenge, Payload } from 'altcha-lib';
import { createChallenge, randomInt, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2';
import { deriveHmacKeySecret } from 'altcha-lib/frameworks/shared';

import { ALTCHA_DIFFICULTY_DEFAULT } from '@/constants/runtimeSettings';
import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

/** A challenge is only good for this long; the replay table keeps it as long. */
export const ALTCHA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** PBKDF2 iterations per attempt. Solving time is tuned with the difficulty setting. */
export const ALTCHA_PBKDF2_COST = 1000;
/** Shortest key we accept, so a placeholder value cannot silently protect recruiting. */
export const ALTCHA_MIN_KEY_LENGTH = 16;
/** Base64 payload size cap; a real one is about 1 KB. */
export const ALTCHA_MAX_PAYLOAD_LENGTH = 4096;
/** The scope signed into each challenge, so another feature's challenge cannot be reused. */
const CHALLENGE_SCOPE = 'recruit';

let missingKeyLogged = false;

/** The HMAC key, or null (with one error log) when it is missing or too short. */
function hmacKey(): string | null {
  const key = process.env.ALTCHA_HMAC_KEY?.trim();
  if (key && key.length >= ALTCHA_MIN_KEY_LENGTH) return key;
  if (!missingKeyLogged) {
    missingKeyLogged = true;
    logError(
      `ALTCHA_HMAC_KEY is missing or shorter than ${ALTCHA_MIN_KEY_LENGTH} characters; ALTCHA recruitment challenges fail closed.`,
    );
  }
  return null;
}

/** Whether ALTCHA has the key it needs to issue and check challenges. */
export function isAltchaConfigured(): boolean {
  return (
    (process.env.ALTCHA_HMAC_KEY?.trim().length ?? 0) >= ALTCHA_MIN_KEY_LENGTH
  );
}

/** Test hook: lets the once-only misconfiguration log fire again. */
export function resetAltchaKeyWarning() {
  missingKeyLogged = false;
}

/**
 * Issues a signed, short-lived challenge. The server picks the answer's
 * counter (deterministic mode), so verification is one HMAC check instead of
 * re-running the key derivation. Returns null when the key is not configured.
 */
export async function issueAltchaChallenge(
  difficulty: number = ALTCHA_DIFFICULTY_DEFAULT,
  now: number = Date.now(),
): Promise<Challenge | null> {
  const key = hmacKey();
  if (!key) return null;
  const max = Math.max(2, Math.floor(difficulty));
  return createChallenge({
    algorithm: 'PBKDF2/SHA-256',
    cost: ALTCHA_PBKDF2_COST,
    // Between half and all of the difficulty: a stable amount of work.
    counter: randomInt(max, Math.ceil(max / 2)),
    data: { scope: CHALLENGE_SCOPE },
    deriveKey,
    expiresAt: new Date(now + ALTCHA_CHALLENGE_TTL_MS),
    hmacKeySignatureSecret: await deriveHmacKeySecret(key),
    hmacSignatureSecret: key,
  });
}

const NONCE_PATTERN = /^[0-9a-f]{32}$/;

/** Decodes the widget's base64 JSON payload, or null when it is not one. */
function parsePayload(token: unknown): Payload | null {
  if (
    typeof token !== 'string' ||
    !token ||
    token.length > ALTCHA_MAX_PAYLOAD_LENGTH
  )
    return null;
  try {
    const parsed: unknown = JSON.parse(atob(token));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { challenge, solution } = parsed as Partial<Payload>;
    if (
      typeof challenge?.parameters !== 'object' ||
      challenge.parameters === null ||
      typeof solution?.counter !== 'number' ||
      typeof solution.derivedKey !== 'string'
    )
      return null;
    return { challenge, solution };
  } catch {
    return null;
  }
}

const purgeExpired = () => {
  if (Math.random() >= 0.05) return;
  prisma.altchaUsedChallenge
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch((error: unknown) => {
      logError('Failed to purge expired ALTCHA challenges', error);
    });
};

/**
 * Checks the widget's payload locally (no network call): signature, expiry,
 * scope and solution, then records the nonce so the same solution is accepted
 * once. Anything wrong, including a missing key, is a refusal.
 */
export async function verifyAltchaPayload(
  token: unknown,
  now: number = Date.now(),
): Promise<boolean> {
  const key = hmacKey();
  if (!key) return false;
  const payload = parsePayload(token);
  if (!payload) return false;
  const { parameters } = payload.challenge;
  if (
    typeof parameters.nonce !== 'string' ||
    !NONCE_PATTERN.test(parameters.nonce) ||
    parameters.data?.scope !== CHALLENGE_SCOPE ||
    typeof parameters.expiresAt !== 'number'
  )
    return false;
  const expiresAtMs = parameters.expiresAt * 1000;
  try {
    const result = await verifySolution({
      challenge: payload.challenge,
      solution: payload.solution,
      deriveKey,
      hmacKeySignatureSecret: await deriveHmacKeySecret(key),
      hmacSignatureSecret: key,
    });
    // Compare against the injected clock too; the library uses the real one.
    if (!result.verified || expiresAtMs <= now) return false;
  } catch {
    // Malformed payloads are a refusal, not a server fault.
    return false;
  }
  try {
    // Only a verified payload may write, so junk cannot fill the table. The
    // nonce is the primary key: a replay is a unique violation.
    await prisma.altchaUsedChallenge.create({
      data: {
        nonce: parameters.nonce,
        expiresAt: new Date(expiresAtMs),
      },
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'P2002') return false;
    logError('Failed to record a used ALTCHA challenge', error);
    return false;
  }
  purgeExpired();
  return true;
}
