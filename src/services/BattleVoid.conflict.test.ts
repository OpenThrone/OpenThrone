import { describe, expect, it } from 'bun:test';

import { isVoidConflict } from '@/services/BattleVoid.service';

import de from '../../public/locales/de/battle.json';
import en from '../../public/locales/en/battle.json';
import es from '../../public/locales/es/battle.json';

describe('isVoidConflict', () => {
  it.each([
    ['a serialization failure', { code: 'P2034', message: 'x' }],
    [
      'a raw-query serialization failure',
      { code: 'P2010', message: 'Code: `40001`' },
    ],
    ['a unique violation', { code: 'P2002', message: 'x' }],
    ['a deadlock by SQLSTATE', { code: 'P2010', message: 'Code: `40P01`' }],
    ['a deadlock by message', new Error('deadlock detected')],
  ])('maps %s to a 409', (_name, error) => {
    expect(isVoidConflict(error)).toBe(true);
  });

  it('leaves unrelated errors alone', () => {
    expect(isVoidConflict(new Error('connection refused'))).toBe(false);
    expect(isVoidConflict(null)).toBe(false);
  });
});

describe('void dialog copy', () => {
  it.each([
    ['en', en, 'battle report'],
    ['de', de, 'Kampfbericht'],
    ['es', es, 'informe de batalla'],
  ])(
    '%s says the reason is shown on the battle report',
    (_lang, copy, phrase) => {
      expect(copy.void.reasonLabel).toContain(phrase);
      expect(copy.void.reasonLabel).not.toMatch(
        /both players|beiden Spielern|ambos jugadores/,
      );
    },
  );
});
