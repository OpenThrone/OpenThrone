import { describe, expect, it } from 'bun:test';

import { RegisterSchema } from '@/lib/validation';
import { isReservedEmail } from '@/utils/reservedEmail';

const valid = {
  email: 'player@example.test',
  password: 'long-enough-password',
  display_name: 'Player',
  race: 'ELF',
  class: 'FIGHTER',
  acceptTerms: true,
};

describe('reserved email domain', () => {
  it.each(['x@deleted.local', 'X@DELETED.LOCAL', ' 5-reset@deleted.local '])(
    'recognises %s',
    (address) => expect(isReservedEmail(address)).toBe(true),
  );

  it('does not flag ordinary or look-alike addresses', () => {
    for (const address of [
      'a@example.test',
      'a@deleted.local.example.test',
      'a@notdeleted.locals',
    ]) {
      expect(isReservedEmail(address)).toBe(false);
    }
  });

  it('registration refuses a reserved address and accepts a normal one', () => {
    expect(RegisterSchema.safeParse(valid).success).toBe(true);
    expect(
      RegisterSchema.safeParse({ ...valid, email: 'x@deleted.local' }).success,
    ).toBe(false);
  });
});
