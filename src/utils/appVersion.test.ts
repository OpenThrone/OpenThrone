import { describe, expect, it } from 'bun:test';

import { formatAppVersion } from '@/utils/appVersion';

describe('formatAppVersion', () => {
  it('shows the version and build commit', () => {
    expect(formatAppVersion('0.4.0', '4f08401')).toBe('v0.4.0 (4f08401)');
    expect(formatAppVersion('0.5.0-alpha', 'bdef263')).toBe(
      'v0.5.0-alpha (bdef263)',
    );
  });

  it('omits what the build does not know', () => {
    expect(formatAppVersion('0.4.0', '')).toBe('v0.4.0');
    expect(formatAppVersion(undefined, 'abc1234')).toBe('');
  });
});
