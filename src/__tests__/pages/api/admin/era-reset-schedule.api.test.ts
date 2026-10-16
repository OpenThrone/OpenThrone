import { afterAll, beforeEach, describe, expect, it, mock, vi } from 'bun:test';

const guardOptions = vi.fn();
const productionGuard = require('@/middleware/apiGuard');
const productionService = require('@/services/EraResetSchedule.service');

const serviceStub = {
  ...productionService,
  setEraResetSchedule: vi.fn(),
  cancelEraResetSchedule: vi.fn(),
};
const guardStub = {
  withApiGuard: (options: any) => {
    guardOptions(options);
    return (handler: any) => async (req: any, res: any) => {
      const parsed = options.bodySchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: 'Invalid request body' });
      return handler(req, res, { body: parsed.data });
    };
  },
};
mock.module('@/middleware/apiGuard', () => guardStub);
mock.module('@/services/EraResetSchedule.service', () => serviceStub);
const handler = require('@/pages/api/admin/game/era-reset-schedule').default;

const payload = () => ({
  action: 'schedule',
  eraId: 7,
  expectedEraStartDate: '2026-01-01T00:00:00.000Z',
  resetAt: new Date(Date.now() + 120_000).toISOString(),
  confirmation: 'RESET ERA 7',
  enableLogins: true,
  expectedScheduleId: null,
});
const response = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
const request = (body: unknown) => ({
  method: 'POST',
  body,
  session: { user: { id: '9' } },
  socket: { remoteAddress: '192.0.2.2' },
});
beforeEach(() => {
  serviceStub.setEraResetSchedule.mockReset();
  serviceStub.cancelEraResetSchedule.mockReset();
});
afterAll(() => {
  guardStub.withApiGuard = productionGuard.withApiGuard;
  serviceStub.setEraResetSchedule = productionService.setEraResetSchedule;
  serviceStub.cancelEraResetSchedule = productionService.cancelEraResetSchedule;
});

describe('admin era reset scheduling API', () => {
  it('requires the admin guard and passes only validated data and the authenticated actor', async () => {
    const body = payload();
    const res = response();
    await handler(request(body), res);
    expect(guardOptions).toHaveBeenCalledWith(
      expect.objectContaining({ authMode: 'admin', methods: ['POST'] }),
    );
    const { action: _action, ...fields } = body;
    expect(serviceStub.setEraResetSchedule).toHaveBeenCalledWith({
      ...fields,
      adminUserId: 9,
      ip: expect.any(String),
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('rejects invalid UTC timestamps, unknown actions and actor injection before execution', async () => {
    for (const body of [
      { ...payload(), resetAt: 'tomorrow' },
      { ...payload(), action: 'resetNow' },
      { ...payload(), adminUserId: 1 },
      { ...payload(), expectedScheduleId: undefined },
    ]) {
      const res = response();
      await handler(request(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(serviceStub.setEraResetSchedule).not.toHaveBeenCalled();
  });
  it('cancels only the explicitly identified schedule', async () => {
    const scheduleId = '00000000-0000-4000-8000-000000000007';
    const res = response();
    await handler(request({ action: 'cancel', scheduleId }), res);
    expect(serviceStub.cancelEraResetSchedule).toHaveBeenCalledWith({
      scheduleId,
      adminUserId: 9,
      ip: expect.any(String),
    });
    expect(serviceStub.setEraResetSchedule).not.toHaveBeenCalled();
  });
  it('returns a conflict when another admin has changed the schedule', async () => {
    serviceStub.setEraResetSchedule.mockRejectedValueOnce(
      new productionService.EraResetScheduleConflict('Schedule changed'),
    );
    const res = response();
    await handler(request(payload()), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Schedule changed' });
  });
});
