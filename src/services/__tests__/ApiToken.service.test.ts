import { describe, expect, it } from 'bun:test';

import { ApiTokenService } from '../ApiToken.service';

describe('ApiTokenService', () => {
  it('parses bearer token from Authorization header', () => {
    const token = ApiTokenService.parseBearerToken(
      'Bearer otk_dev_abcd1234_secret',
    );
    expect(token).toBe('otk_dev_abcd1234_secret');
  });

  it('returns null for invalid authorization scheme', () => {
    const token = ApiTokenService.parseBearerToken('Basic abc');
    expect(token).toBeNull();
  });
});
