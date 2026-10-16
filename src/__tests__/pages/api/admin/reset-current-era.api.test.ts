import { afterAll, beforeEach, describe, expect, it, mock, vi } from 'bun:test';

const guardOptions = vi.fn();
const productionService = require('../../../../services/EraResetSchedule.service');

const serviceStub: any = {
  ...productionService,
  startImmediateEraReset: vi.fn(),
};
const productionGuard = require('../../../../middleware/apiGuard');

const guardStub = {
  withApiGuard: (options: any) => {
    guardOptions(options);
    return (handler: any) => async (req: any, res: any) => {
      try {
        const body = options.bodySchema.parse(req.body);
        return handler(req, res, { body });
      } catch (error) {
        return res.status(400).json({ error: 'Invalid request body' });
      }
    };
  },
};

mock.module('@/middleware/apiGuard', () => guardStub);
mock.module('@/services/EraResetSchedule.service', () => serviceStub);

const handler =
  require('../../../../pages/api/admin/game/reset-current-era').default;

const response = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

const adminRequest = (body: unknown) => ({
  method: 'POST',
  session: { user: { id: '9' } },
  socket: { remoteAddress: '192.0.2.2' },
  body,
});

beforeEach(() => {
  serviceStub.startImmediateEraReset.mockReset();
  serviceStub.startImmediateEraReset.mockResolvedValue({
    eraId: 7,
    startDate: new Date('2026-10-10T00:00:00.000Z'),
    resetId: '00000000-0000-4000-8000-000000000007',
    state: 'closing',
  });
});

afterAll(() => {
  serviceStub.startImmediateEraReset = productionService.startImmediateEraReset;
  guardStub.withApiGuard = productionGuard.withApiGuard;
});

describe('POST /api/admin/game/reset-current-era', () => {
  it('is admin-only and passes validated confirmation and stale-era guard fields', async () => {
    const res = response();
    const eraStartDate = '2026-10-09T00:00:00.000Z';

    await handler(
      adminRequest({
        eraId: 7,
        expectedEraStartDate: eraStartDate,
        confirmation: 'RESET ERA 7',
        enableLogins: true,
      }),
      res,
    );

    expect(guardOptions).toHaveBeenCalledWith(
      expect.objectContaining({ authMode: 'admin', methods: ['POST'] }),
    );
    expect(serviceStub.startImmediateEraReset).toHaveBeenCalledWith({
      eraId: 7,
      expectedEraStartDate: new Date(eraStartDate),
      confirmation: 'RESET ERA 7',
      enableLogins: true,
      adminUserId: 9,
      ip: expect.any(String),
    });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, eraId: 7, state: 'closing' }),
    );
  });

  it('rejects a mismatched confirmation before calling the reset service', async () => {
    const res = response();

    await handler(
      adminRequest({
        eraId: 7,
        expectedEraStartDate: '2026-10-09T00:00:00.000Z',
        confirmation: 'RESET ERA 6',
      }),
      res,
    );

    expect(serviceStub.startImmediateEraReset).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
