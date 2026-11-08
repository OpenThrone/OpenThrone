/** What the staff list shows in the Detail column of an erasure request. */
export type ErasureRowDetail =
  | { key: 'failed'; attempts: number; error: string }
  | { key: 'expedited' }
  | { key: 'cancelledBy'; by: string }
  | { key: 'none' };

/**
 * A failure is only news while the request is still waiting to be erased; a
 * finished or cancelled request shows how it ended, not an earlier error.
 */
export function erasureRowDetail(row: {
  status: string;
  lastError: string | null;
  attempts: number;
  expeditedByUserId: number | null;
  cancelledBy: string | null;
}): ErasureRowDetail {
  if (row.status === 'PENDING' && row.lastError) {
    return { key: 'failed', attempts: row.attempts, error: row.lastError };
  }
  if (row.expeditedByUserId) return { key: 'expedited' };
  if (row.cancelledBy) return { key: 'cancelledBy', by: row.cancelledBy };
  return { key: 'none' };
}
