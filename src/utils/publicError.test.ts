import { describe, expect, it } from 'bun:test';

import { GENERIC_ERROR_MESSAGE, publicErrorMessage } from './publicError';

describe('publicErrorMessage', () => {
  it('passes business refusals through', () => {
    expect(publicErrorMessage(new Error('Not enough gold'))).toBe(
      'Not enough gold',
    );
  });

  it('hides database errors', () => {
    const prismaError = Object.assign(
      new Error(
        'Invalid `prisma.users.findMany()` invocation: Unknown field `level` for select statement on model `users`. password_hash',
      ),
      { name: 'PrismaClientValidationError' },
    );
    expect(publicErrorMessage(prismaError)).toBe(GENERIC_ERROR_MESSAGE);
    expect(
      publicErrorMessage(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
    ).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('uses the fallback for empty or odd values', () => {
    expect(publicErrorMessage(null, 'x')).toBe('x');
    expect(publicErrorMessage(new Error(''), 'x')).toBe('x');
    expect(publicErrorMessage('plain refusal')).toBe('plain refusal');
  });
});
