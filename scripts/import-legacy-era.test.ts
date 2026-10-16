import { describe, expect, it } from 'bun:test';

import { buildLegacySnapshot, validateImportTarget } from './import-legacy-era';

const source = 'postgresql://user:password@db.example/legacy';

describe('legacy era import', () => {
  it('preserves exact gold and gameplay JSON without copying credentials into history', () => {
    const snapshot = buildLegacySnapshot({
      gold: '9007199254740993',
      gold_in_bank: '9223372036854775807',
      experience: 1234,
      units: [{ type: 'CITIZEN', quantity: 73 }],
      items: [{ type: 'WEAPON', quantity: 40 }],
      stats: { attacks: 7 },
      password_hash: 'private',
      email: 'private@example.com',
      twoFactorSecret: 'private',
    });
    expect(snapshot.gold).toBe('9007199254740993');
    expect(snapshot.gold_in_bank).toBe('9223372036854775807');
    expect(snapshot.units).toEqual([{ type: 'CITIZEN', quantity: 73 }]);
    expect(snapshot.stats).toEqual({ attacks: 7 });
    expect(snapshot).not.toHaveProperty('password_hash');
    expect(snapshot).not.toHaveProperty('email');
    expect(snapshot).not.toHaveProperty('twoFactorSecret');
  });

  it('only permits staging or named rehearsal targets', () => {
    expect(() =>
      validateImportTarget(source, 'postgresql://u:p@local/otdev_stage'),
    ).not.toThrow();
    expect(() =>
      validateImportTarget(
        source,
        'postgresql://u:p@local/otdev_era_candidate_20261003',
      ),
    ).not.toThrow();
    for (const target of [
      'postgresql://u:p@local/otdev',
      'postgresql://u:p@local/postgres',
      'postgresql://u:p@aws.pooler.supabase.com/otdev_stage',
    ])
      expect(() => validateImportTarget(source, target)).toThrow();
  });

  it('refuses to import into the source database', () => {
    const same = 'postgresql://u:p@local/otdev_stage';
    expect(() => validateImportTarget(same, same)).toThrow(
      'different databases',
    );
  });
});
