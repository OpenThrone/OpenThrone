import { describe, expect, it } from 'bun:test';

import { erasureRowDetail } from '@/utils/erasureRowDetail';

const row = (overrides: Record<string, unknown> = {}) => ({
  status: 'PENDING',
  lastError: null as string | null,
  attempts: 0,
  expeditedByUserId: null as number | null,
  cancelledBy: null as string | null,
  ...overrides,
});

describe('erasureRowDetail', () => {
  it('shows a failure only while the request still waits to be erased', () => {
    expect(erasureRowDetail(row({ lastError: 'boom', attempts: 3 }))).toEqual({
      key: 'failed',
      attempts: 3,
      error: 'boom',
    });
  });

  it('shows how a cancelled request ended, not an earlier failure', () => {
    expect(
      erasureRowDetail(
        row({ status: 'CANCELLED', lastError: 'boom', cancelledBy: 'USER' }),
      ),
    ).toEqual({ key: 'cancelledBy', by: 'USER' });
  });

  it('shows an early erasure, and nothing for a plain finished request', () => {
    expect(
      erasureRowDetail(row({ status: 'COMPLETED', expeditedByUserId: 1 })),
    ).toEqual({ key: 'expedited' });
    expect(erasureRowDetail(row({ status: 'COMPLETED' }))).toEqual({
      key: 'none',
    });
  });
});
