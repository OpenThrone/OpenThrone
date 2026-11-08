import { describe, expect, it } from 'bun:test';

import { browseNotice } from '@/pages/alliances/browse';

describe('alliance browse notice', () => {
  it('shows an empty state once loaded with no alliances', () => {
    expect(browseNotice('ready', 0)).toBe('empty');
  });

  it('shows the grid only when alliances exist', () => {
    expect(browseNotice('ready', 2)).toBeNull();
  });

  it('shows loading and error states instead of a blank page', () => {
    expect(browseNotice('loading', 0)).toBe('loading');
    expect(browseNotice('error', 0)).toBe('error');
  });
});
