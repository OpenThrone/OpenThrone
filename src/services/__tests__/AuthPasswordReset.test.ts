import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createHash } from 'crypto';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { AuthService } = require('../Auth.service');
const emailService = require('@/services/Email.service');

const USER = { id: 731, email: 'reset@example.invalid' };
let events: string[];
let sendMail: ReturnType<typeof vi.fn>;
let transportSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  events = [];
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.users.findUnique = vi.fn(async () => USER);
  mockPrisma.passwordReset = {
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async ({ data }: any) => ({ id: 92, ...data })),
  };
  mockPrisma.$transaction = vi.fn(async (callback: any) => {
    const result = await callback(mockPrisma);
    events.push('commit');
    return result;
  });
  sendMail = vi.fn(async () => {
    events.push('email');
    return { messageId: 'synthetic' };
  });
  transportSpy = vi
    .spyOn(emailService, 'sendImmediate')
    .mockImplementation(sendMail);
});

afterEach(() => transportSpy.mockRestore());

describe('password reset delivery', () => {
  it('stores a hash of the emailed token and audits before delivery', async () => {
    const audit = vi.fn(async () => {
      events.push('audit');
    });
    const result = await AuthService.requestPasswordReset(USER.id, {
      beforeCommit: audit,
    });
    const email = sendMail.mock.calls[0][0];
    const token = /token is: ([a-f0-9]{64})/.exec(email.text)?.[1];
    expect(token).toBeDefined();
    expect(email.to).toBe(USER.email);
    const stored = mockPrisma.passwordReset.create.mock.calls[0][0].data;
    expect(stored.verificationCode).toBe(
      createHash('sha256').update(token!).digest('hex'),
    );
    expect(stored.verificationCode).not.toBe(token);
    expect(audit).toHaveBeenCalledWith(mockPrisma, { id: 92, userId: USER.id });
    expect(events).toEqual(['audit', 'commit', 'email']);
    expect(JSON.stringify(result)).not.toContain(token!);
  });

  it('keeps the public email-based reset flow working', async () => {
    await AuthService.requestPasswordReset(USER.email);
    expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
      where: { email: USER.email },
      select: { id: true, email: true },
    });
    expect(mockPrisma.passwordReset.updateMany).toHaveBeenCalledWith({
      where: { userId: USER.id, status: 0, type: 'PASSWORD' },
      data: { status: 1 },
    });
    expect(events).toEqual(['commit', 'email']);
  });

  it('does not send an email when the required audit fails', async () => {
    await expect(
      AuthService.requestPasswordReset(USER.id, {
        beforeCommit: async () => {
          throw new Error('audit unavailable');
        },
      }),
    ).rejects.toThrow('audit unavailable');
    expect(events).toEqual([]);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('invalidates only the undelivered reset on SMTP failure', async () => {
    sendMail.mockRejectedValueOnce(new Error('synthetic SMTP failure'));
    await expect(AuthService.requestPasswordReset(USER.id)).rejects.toThrow(
      'Failed to send password reset email',
    );
    expect(mockPrisma.passwordReset.updateMany).toHaveBeenLastCalledWith({
      where: { id: 92, status: 0 },
      data: { status: 1 },
    });
  });

  it('does not create a token or send mail for a missing user', async () => {
    mockPrisma.users.findUnique.mockResolvedValueOnce(null);
    await expect(AuthService.requestPasswordReset(USER.id)).rejects.toThrow(
      'User not found',
    );
    expect(mockPrisma.passwordReset.create).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
