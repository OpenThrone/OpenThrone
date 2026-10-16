/* eslint-disable no-bitwise */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { requireRandom } from '@/utils/random';
import {
  createCombatRandom,
  decryptCombatReplayInputs,
  encryptCombatReplayInputs,
  replayCombatRandom,
} from '@/utils/serverRandom';

let originalSecret: string | undefined;
let originalJwtSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.NEXTAUTH_SECRET;
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.NEXTAUTH_SECRET = 'isolated-combat-replay-test-key';
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalSecret;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

describe('private combat random streams', () => {
  it('replays a complete stream from its encrypted record', () => {
    for (const domain of ['attack', 'spy'] as const) {
      const action = createCombatRandom(domain);
      const replayed = replayCombatRandom(action.replay);
      const original = Array.from({ length: 128 }, () => action.random());
      const restored = Array.from({ length: 128 }, () => replayed());
      expect(restored).toEqual(original);
      expect(original.every((draw) => draw >= 0 && draw < 1)).toBe(true);
    }
  });

  it('rejects modified seed ciphertext instead of producing another outcome', () => {
    const { replay } = createCombatRandom('attack');
    const envelope = Buffer.from(replay.encryptedSeed, 'base64url');
    envelope[28] ^= 1;
    expect(() =>
      replayCombatRandom({
        ...replay,
        encryptedSeed: envelope.toString('base64url'),
      }),
    ).toThrow();
  });

  it('authenticates the action domain as well as the seed', () => {
    const { replay } = createCombatRandom('attack');
    expect(() => replayCombatRandom({ ...replay, domain: 'spy' })).toThrow();
  });

  it('cannot decrypt a replay after its secret is changed', () => {
    const { replay } = createCombatRandom('spy');
    process.env.NEXTAUTH_SECRET = 'different-combat-replay-test-key';
    expect(() => replayCombatRandom(replay)).toThrow();
  });

  it('rejects unsupported formulas rather than rerolling an old battle', () => {
    const { replay } = createCombatRandom('attack');
    expect(() =>
      replayCombatRandom({ ...replay, formulaVersion: 'unsupported-formula' }),
    ).toThrow('Unsupported combat replay');
  });

  it('keeps hidden defender inputs encrypted and restores their exact quantities', () => {
    const { replay } = createCombatRandom('spy');
    const inputs = {
      defender: {
        gold: '9223372036854775807',
        units: [{ type: 'SPY', quantity: 317 }],
      },
    };
    const encrypted = encryptCombatReplayInputs(replay, inputs);
    expect(encrypted).not.toContain('defender');
    expect(decryptCombatReplayInputs(replay, encrypted)).toEqual(inputs);
  });

  it('rejects snapshot substitution between two actions using the same formula and domain', () => {
    const first = createCombatRandom('spy');
    const second = createCombatRandom('spy');
    const encrypted = encryptCombatReplayInputs(first.replay, {
      defender: { gold: '99' },
    });
    expect(() => decryptCombatReplayInputs(second.replay, encrypted)).toThrow();
    const envelope = Buffer.from(encrypted, 'base64url');
    envelope[28] ^= 1;
    expect(() =>
      decryptCombatReplayInputs(first.replay, envelope.toString('base64url')),
    ).toThrow();
  });

  it('refuses an insecure plaintext fallback when the secret is missing', () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => createCombatRandom('attack')).toThrow('NEXTAUTH_SECRET');
  });

  it('uses the existing JWT_SECRET configuration when NextAuth has no separate key', () => {
    delete process.env.NEXTAUTH_SECRET;
    process.env.JWT_SECRET = 'isolated-existing-auth-key';
    const action = createCombatRandom('spy');
    const replayed = replayCombatRandom(action.replay);
    expect(replayed()).toBe(action.random());
  });

  it('requires the caller to own the combat random stream', () => {
    expect(() => requireRandom(undefined)).toThrow('explicit random source');
  });
});
