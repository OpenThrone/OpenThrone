import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

import { createUnsubscribeToken } from '@/utils/unsubscribeToken';

installMockPrisma(vi);
const limiter = require('@/lib/rate-limiter');
const logger = require('@/utils/logger');
const handler = require('@/pages/api/email/unsubscribe').default;

let rateSpy: ReturnType<typeof vi.spyOn>;
let loggerSpy: ReturnType<typeof vi.spyOn>;
const response = () => {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    redirect: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};
const request = (token: unknown, method = 'POST') => ({
  method,
  query: { token },
  headers: {},
  socket: { remoteAddress: '192.0.2.1' },
  body: 'List-Unsubscribe=One-Click',
});
beforeEach(() => {
  rateSpy = vi.spyOn(limiter, 'rateLimiter').mockResolvedValue(true);
  loggerSpy = vi.spyOn(logger, 'logError').mockImplementation(() => {});
  mockPrisma.users.findUnique = vi.fn().mockResolvedValue({ id: 9 });
  mockPrisma.emailPreference = { upsert: vi.fn() };
});
afterEach(() => {
  rateSpy.mockRestore();
  loggerSpy.mockRestore();
});
describe('public token-authenticated unsubscribe', () => {
  it('GET redirects to confirmation without changing preferences', async () => {
    const token = createUnsubscribeToken(9, 'NEWS');
    const res = response();
    await handler(request(token, 'GET'), res);
    expect(res.redirect).toHaveBeenCalledWith(
      303,
      `/email/unsubscribe?token=${encodeURIComponent(token)}`,
    );
    expect(mockPrisma.emailPreference.upsert).not.toHaveBeenCalled();
  });
  it('one-click POST updates the signed category without auth or CSRF', async () => {
    const res = response();
    await handler(request(createUnsubscribeToken(9, 'NEWS')), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.emailPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 9 },
      create: { userId: 9, newsEmails: false },
      update: { newsEmails: false },
    });
  });
  it('does not rate limit valid one-click tokens sharing an exhausted IP', async () => {
    rateSpy.mockResolvedValue(false);
    for (let index = 0; index < 15; index++) {
      const res = response();
      await handler(request(createUnsubscribeToken(9, 'NEWS')), res);
      expect(res.status).toHaveBeenCalledWith(200);
    }
    expect(rateSpy).not.toHaveBeenCalled();
  });
  it('supports announcements and ALL', async () => {
    await handler(
      request(createUnsubscribeToken(9, 'ANNOUNCEMENT')),
      response(),
    );
    expect(mockPrisma.emailPreference.upsert.mock.calls[0][0].update).toEqual({
      announcementEmails: false,
    });
    await handler(request(createUnsubscribeToken(9, 'ALL')), response());
    expect(mockPrisma.emailPreference.upsert.mock.calls[1][0].update).toEqual({
      unsubscribedAllAt: expect.any(Date),
    });
  });
  it('rejects forged, oversized and essential-category tokens', async () => {
    for (const token of [
      'forged',
      'x'.repeat(2049),
      ['duplicate'],
      createUnsubscribeToken(9, 'TRANSACTIONAL'),
      createUnsubscribeToken(9, 'ACCOUNT_LIFECYCLE'),
    ]) {
      const res = response();
      await handler(request(token), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockPrisma.emailPreference.upsert).not.toHaveBeenCalled();
  });
  it('rejects missing accounts and rate limits before persistence', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);
    const res = response();
    await handler(request(createUnsubscribeToken(9, 'ALL')), res);
    expect(res.status).toHaveBeenCalledWith(400);
    rateSpy.mockResolvedValue(false);
    const limited = response();
    await handler(request('forged'), limited);
    expect(limited.status).toHaveBeenCalledWith(429);
    expect(mockPrisma.emailPreference.upsert).not.toHaveBeenCalled();
  });
  it('rejects unsupported methods and sanitizes persistence errors', async () => {
    const res = response();
    await handler(request('token', 'DELETE'), res);
    expect(res.status).toHaveBeenCalledWith(405);
    mockPrisma.emailPreference.upsert.mockRejectedValue(
      new Error('synthetic private detail'),
    );
    const failed = response();
    await handler(request(createUnsubscribeToken(9, 'ALL')), failed);
    expect(failed.status).toHaveBeenCalledWith(500);
    expect(loggerSpy).toHaveBeenCalledWith('Email unsubscribe failed');
  });
});

it('one-click battle alert unsubscribe only disables battle alerts', async () => {
  const res = response();
  await handler(request(createUnsubscribeToken(9, 'ATTACK_NOTIFICATION')), res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(mockPrisma.emailPreference.upsert).toHaveBeenCalledWith({
    where: { userId: 9 },
    create: { userId: 9, attackNotificationEmails: false },
    update: { attackNotificationEmails: false },
  });
});
