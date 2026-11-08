import { describe, expect, it } from 'bun:test';

import { getEraNumberLabel } from '@/utils/eraLabel';

describe('getEraNumberLabel', () => {
  it('shows the era number from its name, not the row id (#274)', () => {
    expect(getEraNumberLabel({ id: 9, name: 'Era 1' })).toBe('1');
    expect(getEraNumberLabel({ id: 2, name: 'Era 12' })).toBe('12');
  });

  it('keeps only the number when the era name has a subtitle', () => {
    expect(getEraNumberLabel({ id: 3, name: 'Era 2: A New Age' })).toBe('2');
    expect(getEraNumberLabel({ id: 3, name: 'era 4 - Ashes' })).toBe('4');
    expect(getEraNumberLabel({ id: 3, name: 'The Long Night 5' })).toBe('5');
  });

  it('falls back to a custom name, then the id', () => {
    expect(getEraNumberLabel({ id: 4, name: 'Dawn' })).toBe('Dawn');
    expect(getEraNumberLabel({ id: 4, name: '' })).toBe('4');
    expect(getEraNumberLabel(null)).toBeNull();
  });
});
