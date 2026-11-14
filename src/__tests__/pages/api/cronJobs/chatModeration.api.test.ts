import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const runSweep = vi.fn(async () => ({
  enabled: true,
  processed: 2,
  failed: 0,
}));
mock.module('@/services/ChatModerationShadow.service', () => ({
  ChatModerationShadowService: { runSweep },
}));
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: () => (handler: any) => async (req: any, res: any) =>
    handler(req, res, { query: {}, body: undefined }),
}));

const makeResponse = () => {
  const response: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader() {
      return this;
    },
  };
  return response;
};

const SECRET = 'cron-test-secret';
const original = {
  TASK_SECRET: process.env.TASK_SECRET,
  DO_TURN_UPDATES: process.env.DO_TURN_UPDATES,
};
const handler = () =>
  require('../../../../pages/api/cronJobs/chatModeration').default;

beforeEach(() => {
  runSweep.mockClear();
  process.env.TASK_SECRET = SECRET;
  process.env.DO_TURN_UPDATES = 'true';
  mockPrisma.cronRun = {
    create: vi.fn(async () => ({ id: 1 })),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
});

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('chat moderation cron endpoint', () => {
  it('refuses a missing or wrong secret without running the sweep', async () => {
    for (const authorization of [undefined, 'wrong-secret-value']) {
      const res = makeResponse();
      await handler()({ method: 'POST', headers: { authorization } }, res);
      expect(res.statusCode).toBe(401);
    }
    expect(runSweep).not.toHaveBeenCalled();
  });

  it('refuses when the shared job switch is off', async () => {
    process.env.DO_TURN_UPDATES = 'false';
    const res = makeResponse();
    await handler()(
      { method: 'POST', headers: { authorization: SECRET } },
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(runSweep).not.toHaveBeenCalled();
  });

  it('runs the sweep with the raw task secret', async () => {
    const res = makeResponse();
    await handler()(
      { method: 'POST', headers: { authorization: SECRET } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.processed).toBe(2);
    expect(runSweep).toHaveBeenCalledTimes(1);
  });

  it('reports a skipped sweep when the provider is unreachable', async () => {
    runSweep.mockImplementationOnce(async () => ({
      enabled: true,
      processed: 0,
      failed: 0,
      providerUnavailable: true,
    }));
    const res = makeResponse();
    await handler()(
      { method: 'POST', headers: { authorization: SECRET } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.providerUnavailable).toBe(true);
    expect(res.body.message).toMatch(/unreachable/);
  });
});
