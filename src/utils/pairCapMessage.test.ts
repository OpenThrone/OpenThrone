import { describe, expect, test } from 'bun:test';

import { formatPairCapWait, pairCapRefusalText } from '@/utils/pairCapMessage';

const now = new Date('2026-11-02T05:00:00Z');
const t = (key: string, options?: Record<string, unknown>) =>
  `${key}:${JSON.stringify(options)}`;

describe('formatPairCapWait', () => {
  test('rounds up and drops the hours when there are none', () => {
    expect(formatPairCapWait(new Date('2026-11-02T08:29:30Z'), now)).toBe(
      '3h 30m',
    );
    expect(formatPairCapWait(new Date('2026-11-02T05:04:10Z'), now)).toBe('5m');
  });

  test('never shows zero, even if the window has just opened', () => {
    expect(formatPairCapWait(new Date('2026-11-02T04:59:00Z'), now)).toBe('1m');
  });
});

describe('pairCapRefusalText', () => {
  test('passes the limit and the current wait to the translation', () => {
    expect(
      pairCapRefusalText(
        t,
        { limit: 5, nextAttackAt: '2026-11-02T05:05:00Z' },
        now,
      ),
    ).toBe('attack.pairCapReached:{"limit":5,"wait":"5m"}');
  });

  test('leaves the server text in place when the details are missing', () => {
    expect(pairCapRefusalText(t, null, now)).toBeNull();
    expect(pairCapRefusalText(t, { limit: 5 }, now)).toBeNull();
    expect(
      pairCapRefusalText(t, { nextAttackAt: '2026-11-02T05:05:00Z' }, now),
    ).toBeNull();
    expect(
      pairCapRefusalText(t, { limit: 5, nextAttackAt: 'soon' }, now),
    ).toBeNull();
  });
});
