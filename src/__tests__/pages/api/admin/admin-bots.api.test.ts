import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';

const provisionBotsFromManifest = vi.fn();
const runDailyBotTick = vi.fn();
const getBotStatus = vi.fn();
const logAction = vi.fn();

mock.module('@/middleware/apiGuard', () => ({
  withApiGuard:
    (options: any) => (handler: any) => async (req: any, res: any) => {
      if (!options.methods.includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      try {
        const body = options.bodySchema
          ? options.bodySchema.parse(req.body)
          : req.body;
        return handler(req, res, { body, query: req.query ?? {} });
      } catch {
        return res.status(400).json({ error: 'Invalid request body' });
      }
    },
}));
mock.module('@/services', () => ({
  BotService: {
    provisionBotsFromManifest,
    runDailyBotTick,
    getBotStatus,
  },
}));
mock.module('@/utils/auditLogger', () => ({
  getRequestIp: () => '192.0.2.1',
  logAction,
}));

const makeResponse = () => {
  const response: any = {
    statusCode: 200,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
  return response;
};

delete require.cache[require.resolve('@/pages/api/admin/bots/provision')];
const provisionHandler = require('@/pages/api/admin/bots/provision').default;

delete require.cache[require.resolve('@/pages/api/admin/bots/run-now')];
const runNowHandler = require('@/pages/api/admin/bots/run-now').default;

delete require.cache[require.resolve('@/pages/api/admin/bots/status')];
const statusHandler = require('@/pages/api/admin/bots/status').default;

describe('admin bot operation registry validation', () => {
  beforeEach(() => {
    provisionBotsFromManifest.mockReset();
    runDailyBotTick.mockReset();
    getBotStatus.mockReset();
    logAction.mockReset();
  });

  it('rejects a manifest path before provisioning', async () => {
    const response = makeResponse();
    await provisionHandler(
      {
        method: 'POST',
        body: { manifest: '../outside', dryRun: false },
        session: { user: { id: '1' } },
      },
      response,
    );

    expect(response.statusCode).toBe(400);
    expect(provisionBotsFromManifest).not.toHaveBeenCalled();
  });

  it('rejects a schedule that is not in the on-disk registry', async () => {
    const response = makeResponse();
    await runNowHandler(
      {
        method: 'POST',
        body: { schedule: 'not-registered' },
        session: { user: { id: '1' } },
      },
      response,
    );

    expect(response.statusCode).toBe(400);
    expect(runDailyBotTick).not.toHaveBeenCalled();
  });

  it('serializes BigInt gold and exposes only registered config names', async () => {
    getBotStatus.mockResolvedValue({
      total: 1,
      bots: [
        {
          id: 10,
          display_name: 'Synthetic bot',
          email: 'synthetic@example.invalid',
          race: 'HUMAN',
          class: 'FIGHTER',
          botPersona: 'BALANCED',
          botCreatedAt: null,
          botLastRunAt: null,
          botStats: null,
          gold: 123n,
        },
      ],
    });
    const response = makeResponse();
    await statusHandler(
      { method: 'GET', query: {}, session: { user: { id: '1' } } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.bots[0].gold).toBe('123');
    expect(response.body.manifests).toContain('default');
    expect(response.body.schedules).toContain('default');
  });
});
