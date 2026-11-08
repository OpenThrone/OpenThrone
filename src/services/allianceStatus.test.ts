import { describe, expect, it } from 'bun:test';

import { eraResetPhrase } from '@/utils/eraResetPhrase';

import {
  AllianceReservedError,
  assertAllianceActive,
  assertAllianceIdActive,
  isAllianceActive,
} from './allianceStatus';

describe('alliance status gate', () => {
  it('treats only RESERVED as inactive; legacy rows without a status run', () => {
    expect(isAllianceActive({ status: 'ACTIVE' })).toBe(true);
    expect(isAllianceActive({})).toBe(true);
    expect(isAllianceActive(null)).toBe(true);
    expect(isAllianceActive({ status: 'RESERVED' })).toBe(false);
  });

  it('refuses a reserved alliance with a player-safe message', () => {
    expect(() => assertAllianceActive({ status: 'ACTIVE' })).not.toThrow();
    expect(() => assertAllianceActive({ status: 'RESERVED' })).toThrow(
      AllianceReservedError,
    );
    expect(() => assertAllianceActive({ status: 'RESERVED' })).toThrow(
      /reserved/,
    );
  });

  it('loads the status by id and refuses missing or reserved alliances', async () => {
    const client = (row: { status: string } | null) =>
      ({ alliances: { findUnique: async () => row } }) as any;
    await expect(
      assertAllianceIdActive(client({ status: 'ACTIVE' }), 1),
    ).resolves.toBeUndefined();
    await expect(
      assertAllianceIdActive(client({ status: 'RESERVED' }), 1),
    ).rejects.toBeInstanceOf(AllianceReservedError);
    await expect(assertAllianceIdActive(client(null), 1)).rejects.toThrow(
      'Alliance not found',
    );
  });
});

describe('era reset phrases', () => {
  it('keeps the ordinary reset and the factory restore apart', () => {
    expect(eraResetPhrase(4)).toBe('RESET ERA 4');
    expect(eraResetPhrase(4, true)).toBe('FACTORY RESTORE ERA 4');
    expect(eraResetPhrase(4)).not.toBe(eraResetPhrase(4, true));
  });
});
