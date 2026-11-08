import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Synthetic ids; none correspond to real accounts.
const GAME_MASTER_ID = 2;
const PLAYER_ID = 10;
const MODERATOR_ID = 11;

// Emulation of the real apiGuard checks (method, session, expanded
// permissions), like admin-hardening.api.test.ts: the route's authMode and
// permission config is what is under test here.
mock.module('@/middleware/apiGuard', () => {
  const { expandPermissions } = require('@/utils/permissions');
  return {
    withApiGuard:
      (options: any) => (handler: any) => async (req: any, res: any) => {
        if (!options.methods.includes(req.method)) {
          return res.status(405).json({ message: 'Method not allowed' });
        }
        const actorId = Number(req.session?.user?.id);
        const roles =
          actorId === GAME_MASTER_ID
            ? ['GAME_MASTER']
            : actorId === MODERATOR_ID
              ? ['MODERATOR']
              : [];
        if (
          options.authMode === 'permission' ||
          options.requiredAnyPermissions
        ) {
          if (!req.session?.user?.id)
            return res.status(401).json({ message: 'Unauthorized' });
          const granted = expandPermissions(roles, []);
          const allowed = (options.requiredAnyPermissions ?? []).some(
            (p: string) => granted.includes(p),
          );
          if (!allowed) return res.status(403).json({ message: 'Forbidden' });
        }
        try {
          const query = options.querySchema
            ? options.querySchema.parse(req.query)
            : (req.query ?? {});
          return handler(req, res, {
            query,
            actor: { type: 'session_admin', userId: actorId },
          });
        } catch {
          return res.status(400).json({ message: 'Invalid query' });
        }
      },
  };
});

delete require.cache[require.resolve('@/pages/api/admin/cron-runs')];
const cronRunsHandler = require('@/pages/api/admin/cron-runs').default;

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

const staffRequest = (query: Record<string, string> = {}) => ({
  method: 'GET',
  session: { user: { id: String(GAME_MASTER_ID) } },
  query,
});

describe('admin cron-runs API', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.cronRun.findMany = vi.fn(async () => []);
    mockPrisma.cronRun.count = vi.fn(async () => 0);
    mockPrisma.cronRun.groupBy = vi.fn(async () => []);
  });

  it('rejects a request without a session', async () => {
    const response = makeResponse();
    await cronRunsHandler({ method: 'GET', session: {}, query: {} }, response);

    expect(response.statusCode).toBe(401);
    expect(mockPrisma.cronRun.findMany).not.toHaveBeenCalled();
  });

  it('rejects a player without staff permissions', async () => {
    const response = makeResponse();
    await cronRunsHandler(
      {
        method: 'GET',
        session: { user: { id: String(PLAYER_ID) } },
        query: {},
      },
      response,
    );

    expect(response.statusCode).toBe(403);
    expect(mockPrisma.cronRun.findMany).not.toHaveBeenCalled();
  });

  it('rejects a moderator, who lacks the server settings permission', async () => {
    const response = makeResponse();
    await cronRunsHandler(
      {
        method: 'GET',
        session: { user: { id: String(MODERATOR_ID) } },
        query: {},
      },
      response,
    );

    expect(response.statusCode).toBe(403);
    expect(mockPrisma.cronRun.findMany).not.toHaveBeenCalled();
  });

  it('returns runs, jobs and last success to staff', async () => {
    const run = {
      id: 3,
      job: 'daily',
      status: 'SUCCESS',
      startedAt: new Date('2026-10-30T00:00:00Z'),
      finishedAt: new Date('2026-10-30T00:00:05Z'),
      durationMs: 5000,
      summary: { processed: 4 },
      error: null,
    };
    mockPrisma.cronRun.findMany
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([
        {
          job: 'daily',
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          durationMs: run.durationMs,
        },
      ]);
    mockPrisma.cronRun.count.mockResolvedValue(1);
    mockPrisma.cronRun.groupBy.mockResolvedValue([{ job: 'daily' }]);

    const response = makeResponse();
    await cronRunsHandler(staffRequest({ page: '1' }), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.jobs).toEqual(['daily']);
    expect(response.body.rows[0].job).toBe('daily');
    expect(response.body.lastSuccess[0].job).toBe('daily');
  });

  it('flags RUNNING rows older than 2 hours as stale, but not recent or finished ones', async () => {
    const hoursAgo = (hours: number) =>
      new Date(Date.now() - hours * 60 * 60 * 1000);
    const base = {
      job: 'turns',
      finishedAt: null,
      durationMs: null,
      summary: null,
      error: null,
    };
    mockPrisma.cronRun.findMany
      .mockResolvedValueOnce([
        { ...base, id: 1, status: 'RUNNING', startedAt: hoursAgo(3) },
        { ...base, id: 2, status: 'RUNNING', startedAt: hoursAgo(1) },
        { ...base, id: 3, status: 'SUCCESS', startedAt: hoursAgo(5) },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.cronRun.count.mockResolvedValue(3);
    mockPrisma.cronRun.groupBy.mockResolvedValue([{ job: 'turns' }]);

    const response = makeResponse();
    await cronRunsHandler(staffRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.rows.map((row: any) => [row.id, row.stale])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
  });

  it('applies job and status filters and paginates', async () => {
    mockPrisma.cronRun.findMany.mockResolvedValue([]);
    mockPrisma.cronRun.count.mockResolvedValue(0);
    mockPrisma.cronRun.groupBy.mockResolvedValue([]);

    const response = makeResponse();
    await cronRunsHandler(
      staffRequest({ page: '3', job: 'turns', status: 'FAILED' }),
      response,
    );

    expect(response.statusCode).toBe(200);
    const rowsCall = mockPrisma.cronRun.findMany.mock.calls[0][0];
    expect(rowsCall.where).toEqual({ job: 'turns', status: 'FAILED' });
    expect(rowsCall.skip).toBe(50);
    expect(rowsCall.take).toBe(25);
    expect(mockPrisma.cronRun.count).toHaveBeenCalledWith({
      where: { job: 'turns', status: 'FAILED' },
    });
  });

  it('rejects an unknown status filter', async () => {
    const response = makeResponse();
    await cronRunsHandler(staffRequest({ status: 'EXPLODED' }), response);

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.cronRun.findMany).not.toHaveBeenCalled();
  });
});
