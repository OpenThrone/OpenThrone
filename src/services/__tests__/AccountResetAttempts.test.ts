import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createHash } from 'crypto';
import { installRateLimitStore } from 'test/utils/rateLimitStore';

import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from '../../../test/utils/mockPrisma';

installMockPrisma(vi);

const { rateLimiter } = require('@/lib/rate-limiter');

let store: ReturnType<typeof installRateLimitStore>;
let hashSpy: ReturnType<typeof vi.spyOn>;

const { AccountService } = require('../Account.service');

const ACCOUNT_EMAIL = 'synthetic-player@example.invalid';
const ACCOUNT_ID = 501;

describe('password reset code attempts', () => {
  beforeEach(() => {
    resetMockPrisma();
    store = installRateLimitStore(mockPrisma, vi);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      email: ACCOUNT_EMAIL,
    });
    const argon2 = require('argon2');
    hashSpy = vi.spyOn(argon2, 'hash').mockResolvedValue('synthetic-hash');
  });

  afterEach(() => hashSpy.mockRestore());

  it('locks the account after repeated wrong codes and stops checking the token', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb({ passwordReset: { updateMany }, users: { update: vi.fn() } }),
    );

    const messages: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      try {
        await AccountService.resetPasswordWithCode({
          email: ACCOUNT_EMAIL,
          verificationCode: 'wrong-code-value',
          newPassword: 'synthetic-password-1',
        });
      } catch (error: any) {
        messages.push(error.message);
      }
    }

    expect(messages.slice(0, 5)).toEqual(
      Array(5).fill('Invalid verification code'),
    );
    expect(messages[5]).toBe(
      'Too many verification attempts. Request a new code.',
    );
    expect(store.windowCount(`password-reset-code:${ACCOUNT_ID}`)).toBe(5);
    // The locked attempt never reaches the token lookup.
    expect(updateMany).toHaveBeenCalledTimes(5);
  });

  it('does not change the password when the attempt is locked', async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimiter(`password-reset-code:${ACCOUNT_ID}`, {
        windowMs: 3 * 60 * 60_000,
        max: 5,
      });
    }
    const update = vi.fn();
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb({ passwordReset: { updateMany: vi.fn() }, users: { update } }),
    );

    await expect(
      AccountService.resetPasswordWithCode({
        email: ACCOUNT_EMAIL,
        verificationCode: 'any-code',
        newPassword: 'synthetic-password-1',
      }),
    ).rejects.toThrow('Too many verification attempts');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not return the account id from an email change request (F-16)', async () => {
    const emailService = require('@/services/Email.service');
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'synthetic' });
    const transportSpy = vi
      .spyOn(emailService, 'sendImmediate')
      .mockImplementation(sendMail);
    mockPrisma.passwordReset = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 9 }),
    };

    const result = await AccountService.requestEmailChange({
      email: ACCOUNT_EMAIL,
    });

    expect(result.status).toBe(true);
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('info');
    const token = /token is: ([a-f0-9]{64})/.exec(
      sendMail.mock.calls[0][0].text,
    )?.[1];
    expect(token).toBeDefined();
    expect(
      mockPrisma.passwordReset.create.mock.calls[0][0].data.verificationCode,
    ).toBe(createHash('sha256').update(token!).digest('hex'));
    transportSpy.mockRestore();
  });
});
