import { describe, expect, it } from 'bun:test';

import { createApiError } from '@/utils/api-error';
import { friendTransferErrorBody } from '@/utils/friendTransferError';

describe('friendTransferErrorBody', () => {
  it('adds the code, role and level to a level refusal', () => {
    const error = createApiError(
      'You must be level 5 to send gold transfers',
      400,
      {
        code: 'FRIEND_TRANSFER_MIN_LEVEL',
        role: 'send',
        minLevel: 5,
      },
    );
    expect(friendTransferErrorBody(error)).toEqual({
      error: 'You must be level 5 to send gold transfers',
      code: 'FRIEND_TRANSFER_MIN_LEVEL',
      role: 'send',
      minLevel: 5,
    });
  });

  it('keeps every other refusal to its plain message', () => {
    expect(
      friendTransferErrorBody(createApiError('Insufficient gold')),
    ).toEqual({
      error: 'Insufficient gold',
    });
    expect(friendTransferErrorBody({ message: 'Sender not found' })).toEqual({
      error: 'Sender not found',
    });
  });
});
