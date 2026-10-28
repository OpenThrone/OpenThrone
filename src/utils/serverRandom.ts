/* eslint-disable no-bitwise */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

import type { RandomFn } from '@/utils/random';

// v7 (issue #200): assault chip taper and battle-wide casualty win quality.
const COMBAT_FORMULA_VERSION = 'combat-v7';
const SERVER_RANDOM_ALGORITHM = 'hmac-sha256-counter-v1';

type CombatDomain = 'attack' | 'spy';

export type CombatRandomReplay = {
  formulaVersion: string;
  algorithm: string;
  domain: CombatDomain;
  encryptedSeed: string;
};

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const SEED_BYTES = 32;
const DRAW_RANGE = 281474976710656; // 2^48: an exact integer in JavaScript.

function replayKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'NEXTAUTH_SECRET or JWT_SECRET is required to store private combat replays.',
    );
  }
  return createHash('sha256')
    .update('openthrone:combat-replay:v1\0')
    .update(secret)
    .digest();
}

function replayContext(domain: CombatDomain): Buffer {
  return Buffer.from(
    `${COMBAT_FORMULA_VERSION}\0${SERVER_RANDOM_ALGORITHM}\0${domain}`,
  );
}

function randomStream(seed: Buffer, domain: CombatDomain): RandomFn {
  const context = Buffer.from(`openthrone:combat-roll:v1\0${domain}\0`);
  const counterBytes = Buffer.alloc(8);
  let counter = 0;
  return () => {
    if (!Number.isSafeInteger(counter)) {
      throw new RangeError('Combat random stream exhausted.');
    }
    counterBytes.writeUInt32BE(Math.floor(counter / 4294967296), 0);
    counterBytes.writeUInt32BE(counter >>> 0, 4);
    counter += 1;
    const digest = createHmac('sha256', seed)
      .update(context)
      .update(counterBytes)
      .digest();
    return digest.readUIntBE(0, 6) / DRAW_RANGE;
  };
}

/** Each action owns a fresh unpredictable stream and an authenticated replay seed. */
export function createCombatRandom(domain: CombatDomain): {
  random: RandomFn;
  replay: CombatRandomReplay;
} {
  const key = replayKey();
  const seed = randomBytes(SEED_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(replayContext(domain));
  const ciphertext = Buffer.concat([cipher.update(seed), cipher.final()]);
  const encryptedSeed = Buffer.concat([
    nonce,
    cipher.getAuthTag(),
    ciphertext,
  ]).toString('base64url');
  return {
    random: randomStream(seed, domain),
    replay: {
      formulaVersion: COMBAT_FORMULA_VERSION,
      algorithm: SERVER_RANDOM_ALGORITHM,
      domain,
      encryptedSeed,
    },
  };
}

function validateReplayMetadata(replay: CombatRandomReplay): void {
  if (
    replay.formulaVersion !== COMBAT_FORMULA_VERSION ||
    replay.algorithm !== SERVER_RANDOM_ALGORITHM ||
    (replay.domain !== 'attack' && replay.domain !== 'spy')
  ) {
    throw new Error('Unsupported combat replay version or random algorithm.');
  }
  if (typeof replay.encryptedSeed !== 'string') {
    throw new Error('Combat replay is missing its encrypted seed.');
  }
}

function inputsContext(replay: CombatRandomReplay): Buffer {
  return Buffer.from(
    `${replay.formulaVersion}\0${replay.algorithm}\0${replay.domain}\0inputs\0${replay.encryptedSeed}`,
  );
}

/** Replay inputs contain hidden defender state; public log JSON must contain ciphertext only. */
export function encryptCombatReplayInputs(
  replay: CombatRandomReplay,
  inputs: unknown,
): string {
  validateReplayMetadata(replay);
  const plaintext = JSON.stringify(inputs);
  if (plaintext === undefined) {
    throw new TypeError('Combat replay inputs must be JSON serializable.');
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', replayKey(), nonce);
  cipher.setAAD(inputsContext(replay));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
    'base64url',
  );
}

/** Authenticate the formula, domain and matching seed before exposing any snapshot fields. */
export function decryptCombatReplayInputs(
  replay: CombatRandomReplay,
  encryptedInputs: string,
): unknown {
  validateReplayMetadata(replay);
  if (typeof encryptedInputs !== 'string') {
    throw new Error('Combat replay is missing its encrypted inputs.');
  }
  const envelope = Buffer.from(encryptedInputs, 'base64url');
  if (envelope.length <= NONCE_BYTES + TAG_BYTES) {
    throw new Error('Invalid combat replay inputs envelope.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    replayKey(),
    envelope.subarray(0, NONCE_BYTES),
  );
  decipher.setAAD(inputsContext(replay));
  decipher.setAuthTag(envelope.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
  const plaintext = Buffer.concat([
    decipher.update(envelope.subarray(NONCE_BYTES + TAG_BYTES)),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

/** Decryption and version checks precede every draw; unsupported logs are not rerolled. */
export function replayCombatRandom(replay: CombatRandomReplay): RandomFn {
  validateReplayMetadata(replay);
  const envelope = Buffer.from(replay.encryptedSeed, 'base64url');
  if (envelope.length !== NONCE_BYTES + TAG_BYTES + SEED_BYTES) {
    throw new Error('Invalid combat replay seed envelope.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    replayKey(),
    envelope.subarray(0, NONCE_BYTES),
  );
  decipher.setAAD(replayContext(replay.domain));
  decipher.setAuthTag(envelope.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
  const seed = Buffer.concat([
    decipher.update(envelope.subarray(NONCE_BYTES + TAG_BYTES)),
    decipher.final(),
  ]);
  return randomStream(seed, replay.domain);
}
