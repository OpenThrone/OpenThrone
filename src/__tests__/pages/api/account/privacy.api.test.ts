import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma } from 'test/utils/mockPrisma';

import * as guard from '@/middleware/apiGuard';
import * as exporter from '@/services/AccountDataExport.service';
import * as erasure from '@/services/AccountErasure.service';
import * as auditLogger from '@/utils/auditLogger';
import * as reauth from '@/utils/reauth';

installMockPrisma(vi);

const guardSpy = vi
  .spyOn(guard, 'withApiGuard')
  .mockImplementation(
    (options: any) => (handler: any) => async (req: any, res: any) => {
      let { body } = req;
      if (options.bodySchema && ['POST', 'PUT'].includes(req.method)) {
        const parsed = options.bodySchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(422).json({ message: 'Invalid request body' });
        body = parsed.data;
      }
      return handler(req, res, { body, query: req.query ?? {} });
    },
  );
const exportRoute = require('@/pages/api/account/export');
const erasureRoute = require('@/pages/api/account/erasure/index');
const confirmRoute = require('@/pages/api/account/erasure/confirm');
const adminErasureRoute = require('@/pages/api/admin/privacy/erasure');
const adminListRoute = require('@/pages/api/admin/privacy/index');

const [
  exportGuard,
  erasureGuard,
  confirmGuard,
  adminErasureGuard,
  adminListGuard,
] = guardSpy.mock.calls.map((call) => call[0] as any);
guardSpy.mockRestore();

const logActionStrict = vi
  .spyOn(auditLogger, 'logActionStrict')
  .mockResolvedValue(undefined);
vi.spyOn(auditLogger, 'getRequestIp').mockReturnValue('203.0.113.9');

const response = () => {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    write: vi.fn(() => true),
    end: vi.fn(),
    destroy: vi.fn(),
    once: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};
const request = (method: string, body?: unknown, session: any = {}) => ({
  method,
  body,
  session: { user: { id: '9', ...session } },
});

const requireReauth = vi.spyOn(reauth, 'requireReauth');
const beginExport = vi.spyOn(exporter, 'beginExport');
const abandonExport = vi.spyOn(exporter, 'abandonExport');
const completeExport = vi.spyOn(exporter, 'completeExport');
const streamAccountExport = vi.spyOn(exporter, 'streamAccountExport');

beforeEach(() => {
  requireReauth.mockReset().mockResolvedValue(undefined);
  beginExport.mockReset().mockResolvedValue({ id: 77 } as any);
  abandonExport.mockReset().mockResolvedValue(undefined);
  completeExport.mockReset().mockResolvedValue(undefined);
  streamAccountExport
    .mockReset()
    .mockImplementation(async (_id: number, write: any) => {
      await write('{"meta":{}}');
      return { bytes: 11, sections: 1 };
    });
  logActionStrict.mockClear();
});

describe('data export route', () => {
  const body = { password: 'correct horse' };

  it('is POST only, signed-in, throttled, and open to restricted players', () => {
    expect(exportGuard).toEqual(
      expect.objectContaining({
        methods: ['POST'],
        authMode: 'required',
        rateLimitProfile: 'password_reset',
        allowRestrictedAccount: true,
      }),
    );
    expect(exportRoute.config).toEqual({ api: { responseLimit: false } });
  });

  it('rejects unknown or missing body fields before touching any data', async () => {
    for (const bad of [{}, { password: '' }, { password: 'x', userId: 1 }]) {
      const res = response();
      await exportRoute.default(request('POST', bad), res);
      expect(res.status).toHaveBeenCalledWith(422);
    }
    expect(requireReauth).not.toHaveBeenCalled();
  });

  it('answers a wrong password with 401 and starts nothing', async () => {
    requireReauth.mockRejectedValue(new reauth.ReauthError('invalid_password'));
    const res = response();
    await exportRoute.default(request('POST', body), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_password' });
    expect(beginExport).not.toHaveBeenCalled();
    expect(streamAccountExport).not.toHaveBeenCalled();
    expect(logActionStrict).not.toHaveBeenCalled();
  });

  it('asks for the authenticator code when 2FA is on', async () => {
    requireReauth.mockRejectedValue(new reauth.ReauthError('totp_required'));
    const res = response();
    await exportRoute.default(request('POST', body), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'totp_required' });
  });

  it('refuses a second download inside 24 hours and says when to retry', async () => {
    const retryAt = new Date('2099-01-02T00:00:00Z');
    beginExport.mockRejectedValue(
      new exporter.ExportError('rate_limited', retryAt),
    );
    const res = response();
    await exportRoute.default(request('POST', body), res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'rate_limited',
      retryAt: retryAt.toISOString(),
    });
    expect(streamAccountExport).not.toHaveBeenCalled();
  });

  it('never exports through an impersonated session', async () => {
    const res = response();
    await exportRoute.default(
      request('POST', body, { impersonatedBy: 1 }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(requireReauth).not.toHaveBeenCalled();
  });

  it('audits first, then streams the file as an attachment', async () => {
    const order: string[] = [];
    logActionStrict.mockImplementation(async () => {
      order.push('audit');
    });
    streamAccountExport.mockImplementation(async (_id: number, write: any) => {
      order.push('stream');
      await write('{"meta":{}}');
      return { bytes: 11, sections: 1 };
    });
    const res = response();
    await exportRoute.default(request('POST', body), res);

    expect(order).toEqual(['audit', 'stream']);
    expect(requireReauth).toHaveBeenCalledWith(9, 'export', body);
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        action: 'ACCOUNT_DATA_EXPORT',
        entityId: 77,
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="openthrone-data-9.json"',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(res.write).toHaveBeenCalledWith('{"meta":{}}');
    expect(completeExport).toHaveBeenCalledWith(77, { bytes: 11, sections: 1 });
    expect(res.end).toHaveBeenCalled();
    logActionStrict.mockResolvedValue(undefined);
  });

  it('cuts the stream and gives the attempt back when generation fails', async () => {
    streamAccountExport.mockRejectedValue(new Error('database went away'));
    const res = response();
    await exportRoute.default(request('POST', body), res);
    expect(abandonExport).toHaveBeenCalledWith(77);
    expect(res.destroy).toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('stops generating and keeps the 24h slot when the client goes away', async () => {
    let chunksAttempted = 0;
    streamAccountExport.mockImplementation(async (_id: number, write: any) => {
      for (let i = 0; i < 5; i++) {
        chunksAttempted++;
        await write('x'); // rejects once the response is destroyed
      }
      return { bytes: 5, sections: 1 };
    });
    const res = response();
    // The client disconnected before the first chunk.
    res.destroyed = true;
    await exportRoute.default(request('POST', body), res);

    expect(chunksAttempted).toBe(1);
    expect(res.write).not.toHaveBeenCalled();
    expect(completeExport).not.toHaveBeenCalled();
    // The player walked away: the slot stays used.
    expect(abandonExport).not.toHaveBeenCalled();
  });

  it('does not keep the attempt when the audit write fails', async () => {
    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    const res = response();
    await expect(
      exportRoute.default(request('POST', body), res),
    ).rejects.toThrow('audit down');
    expect(abandonExport).toHaveBeenCalledWith(77);
    expect(streamAccountExport).not.toHaveBeenCalled();
  });
});

describe('erasure request routes', () => {
  const requestErasure = vi.spyOn(erasure, 'requestErasure');
  const cancelErasure = vi.spyOn(erasure, 'cancelErasure');
  const getErasureState = vi.spyOn(erasure, 'getErasureState');
  const confirmErasure = vi.spyOn(erasure, 'confirmErasure');
  const state = {
    status: 'AWAITING_CONFIRMATION',
    requestedAt: '2099-01-01T00:00:00.000Z',
    confirmationExpiresAt: '2099-01-02T00:00:00.000Z',
    scheduledFor: null,
  };
  beforeEach(() => {
    requestErasure.mockReset().mockResolvedValue(state as any);
    cancelErasure.mockReset().mockResolvedValue(true);
    getErasureState.mockReset().mockResolvedValue(state as any);
    confirmErasure.mockReset();
  });

  it('requires a signed-in player; only the email link is public', () => {
    expect(erasureGuard).toEqual(
      expect.objectContaining({
        authMode: 'required',
        methods: ['GET', 'POST', 'DELETE'],
        // The page reads state on each load; it must not spend the 6/minute budget.
        rateLimitProfile: 'public_read',
      }),
    );
    expect(confirmGuard).toEqual(
      expect.objectContaining({
        authMode: 'none',
        methods: ['POST'],
        rateLimitProfile: 'public_read',
      }),
    );
  });

  it('starts a request with the credentials and answers 202', async () => {
    const res = response();
    await erasureRoute.default(
      request('POST', { password: 'pw', totpToken: '123456', reason: 'bored' }),
      res,
    );
    expect(requestErasure).toHaveBeenCalledWith(9, {
      password: 'pw',
      totpToken: '123456',
      reason: 'bored',
      ip: '203.0.113.9',
    });
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it.each([
    [new reauth.ReauthError('invalid_password'), 401, 'invalid_password'],
    [new reauth.ReauthError('rate_limited'), 429, 'rate_limited'],
    [new erasure.ErasureError('staff_account'), 403, 'staff_account'],
    [new erasure.ErasureError('already_scheduled'), 409, 'already_scheduled'],
    [new erasure.ErasureError('email_failed'), 502, 'email_failed'],
  ])('maps %p to %p', async (error, status, code) => {
    requestErasure.mockRejectedValue(error);
    const res = response();
    await erasureRoute.default(request('POST', { password: 'pw' }), res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: code });
  });

  it('lets an impersonating admin do neither', async () => {
    for (const method of ['POST', 'DELETE']) {
      const res = response();
      await erasureRoute.default(
        request(method, { password: 'pw' }, { impersonatedBy: 1 }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(requestErasure).not.toHaveBeenCalled();
    expect(cancelErasure).not.toHaveBeenCalled();
  });

  it('withdraws an unconfirmed request as the player', async () => {
    const res = response();
    await erasureRoute.default(request('DELETE'), res);
    expect(cancelErasure).toHaveBeenCalledWith(9, {
      by: 'USER',
      ip: '203.0.113.9',
    });
  });

  it('confirms by token and reports the date, or answers 400 for a bad token', async () => {
    confirmErasure.mockResolvedValue({
      scheduledFor: new Date('2099-01-15T00:00:00Z'),
    });
    const token = 'a'.repeat(64);
    const ok = response();
    await confirmRoute.default(request('POST', { token }), ok);
    expect(confirmErasure).toHaveBeenCalledWith(token, '203.0.113.9');
    expect(ok.json).toHaveBeenCalledWith({
      scheduledFor: '2099-01-15T00:00:00.000Z',
    });

    const malformed = response();
    await confirmRoute.default(request('POST', { token: 'short' }), malformed);
    expect(malformed.status).toHaveBeenCalledWith(422);

    confirmErasure.mockRejectedValue(new erasure.ErasureError('invalid_token'));
    const bad = response();
    await confirmRoute.default(request('POST', { token }), bad);
    expect(bad.status).toHaveBeenCalledWith(400);
    expect(bad.json).toHaveBeenCalledWith({ error: 'invalid_token' });
  });

  it('confirms an inactivity email link without sign-in, and refuses mixed bodies', async () => {
    const confirmNotice = vi
      .spyOn(erasure, 'confirmInactivityErasure')
      .mockResolvedValue({ scheduledFor: new Date('2099-01-15T00:00:00Z') });
    const noticeToken = 'eyJ1Ijo3LCJ3IjoxfQ.c2lnbmF0dXJl';
    const ok = response();
    await confirmRoute.default(request('POST', { noticeToken }), ok);
    expect(confirmNotice).toHaveBeenCalledWith(noticeToken, '203.0.113.9');
    expect(confirmErasure).not.toHaveBeenCalled();
    expect(ok.json).toHaveBeenCalledWith({
      scheduledFor: '2099-01-15T00:00:00.000Z',
    });
    const mixed = response();
    await confirmRoute.default(
      request('POST', { noticeToken, token: 'a'.repeat(64) }),
      mixed,
    );
    expect(mixed.status).toHaveBeenCalledWith(422);
    const junk = response();
    await confirmRoute.default(
      request('POST', { noticeToken: 'not a token' }),
      junk,
    );
    expect(junk.status).toHaveBeenCalledWith(422);
    confirmNotice.mockRestore();
  });
});

describe('admin privacy routes', () => {
  const adminOpen = vi.spyOn(erasure, 'adminOpenErasure');
  const adminCancel = vi.spyOn(erasure, 'adminCancelErasure');
  const adminExpedite = vi.spyOn(erasure, 'adminExpediteErasure');
  beforeEach(() => {
    adminOpen.mockReset().mockResolvedValue({ id: 5 } as any);
    adminCancel.mockReset().mockResolvedValue(undefined);
    adminExpedite.mockReset().mockResolvedValue(undefined);
  });

  it('is administrators only for both the list and the actions', () => {
    expect(adminListGuard).toEqual(
      expect.objectContaining({ authMode: 'admin', methods: ['GET'] }),
    );
    expect(adminErasureGuard).toEqual(
      expect.objectContaining({ authMode: 'admin', methods: ['POST'] }),
    );
    expect(adminListRoute.default).toBeDefined();
  });

  it('records the acting admin on cancel and erase-now', async () => {
    const reason = 'verified by support ticket 123';
    const cancel = response();
    await adminErasureRoute.default(
      request('POST', { action: 'cancel', requestId: 3, reason }),
      cancel,
    );
    expect(adminCancel).toHaveBeenCalledWith(3, {
      adminId: 9,
      reason,
      ip: '203.0.113.9',
    });
    const now = response();
    await adminErasureRoute.default(
      request('POST', { action: 'expedite', requestId: 3, reason }),
      now,
    );
    expect(adminExpedite).toHaveBeenCalledWith(3, {
      adminId: 9,
      reason,
      ip: '203.0.113.9',
    });
  });

  it('answers 422 when the service wants a longer reason', async () => {
    adminExpedite.mockRejectedValue(
      new erasure.ErasureError('reason_required'),
    );
    const res = response();
    await adminErasureRoute.default(
      request('POST', { action: 'expedite', requestId: 3, reason: 'x' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'reason_required' });
  });

  it('refuses to open a request for the acting admin themself', async () => {
    const res = response();
    await adminErasureRoute.default(
      request('POST', {
        action: 'open',
        userId: 9,
        reason: 'a long enough reason',
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(adminOpen).not.toHaveBeenCalled();
  });

  it('rejects an action body without a reason', async () => {
    const res = response();
    await adminErasureRoute.default(
      request('POST', { action: 'cancel', requestId: 3 }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(adminCancel).not.toHaveBeenCalled();
  });
});
