import { afterEach, describe, expect, it } from 'bun:test';

import { isPrivileged2FAEnforced } from './securityPolicies';

const original = process.env.OT_ENFORCE_PRIVILEGED_2FA;
afterEach(() => {
  if (original === undefined) delete process.env.OT_ENFORCE_PRIVILEGED_2FA;
  else process.env.OT_ENFORCE_PRIVILEGED_2FA = original;
});

describe('privileged 2FA configuration', () => {
  it('requires explicit opt-out, defaulting to enforcement', () => {
    delete process.env.OT_ENFORCE_PRIVILEGED_2FA;
    expect(isPrivileged2FAEnforced()).toBe(true);
    process.env.OT_ENFORCE_PRIVILEGED_2FA = 'true';
    expect(isPrivileged2FAEnforced()).toBe(true);
  });

  it('accepts the documented development override and supported false values', () => {
    for (const value of ['false', ' FALSE ', '0', 'off', 'no']) {
      process.env.OT_ENFORCE_PRIVILEGED_2FA = value;
      expect(isPrivileged2FAEnforced()).toBe(false);
    }
  });
});
