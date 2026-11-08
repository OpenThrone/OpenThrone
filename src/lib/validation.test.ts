import { describe, expect, it } from 'bun:test';

import { RegisterSchema } from '@/lib/validation';

const validRegistration = {
  email: 'commander@example.com',
  password: 'strong-password',
  display_name: 'Commander',
  race: 'HUMAN',
  class: 'FIGHTER',
  acceptTerms: true,
};

describe('RegisterSchema', () => {
  it('rejects registration payloads without a class', () => {
    const result = RegisterSchema.safeParse({
      ...validRegistration,
      class: undefined,
    });

    expect(result.success).toBe(false);
  });

  it('requires confirming the minimum age and the privacy policy', () => {
    for (const acceptTerms of [undefined, false, 'true'])
      expect(
        RegisterSchema.safeParse({ ...validRegistration, acceptTerms }).success,
      ).toBe(false);
  });

  it('accepts valid registration payloads', () => {
    const result = RegisterSchema.safeParse(validRegistration);

    expect(result.success).toBe(true);
  });
});
