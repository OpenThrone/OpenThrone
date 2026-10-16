import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);

const { GeneralService } = require('@/services/General.service');
const handler = require('../../../../pages/api/general/resetGame').default;

const resetGame = vi.spyOn(GeneralService, 'resetGame');

// Synthetic secret for the test only; never read from the environment.
const TEST_SECRET = 'synthetic-task-secret-for-tests';

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

const originalSecret = process.env.TASK_SECRET;

describe('resetGame task endpoint', () => {
  beforeEach(() => {
    resetGame.mockReset();
    resetGame.mockResolvedValue({ success: false });
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.TASK_SECRET;
    else process.env.TASK_SECRET = originalSecret;
  });

  it('refuses every request when TASK_SECRET is unset, even an empty header', async () => {
    delete process.env.TASK_SECRET;
    const res = makeRes();
    await handler({ method: 'POST', headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(resetGame).not.toHaveBeenCalled();
  });

  it('refuses when TASK_SECRET is empty and the header is empty', async () => {
    process.env.TASK_SECRET = '';
    const res = makeRes();
    await handler({ method: 'POST', headers: { authorization: '' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(resetGame).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret', async () => {
    process.env.TASK_SECRET = TEST_SECRET;
    const res = makeRes();
    await handler(
      { method: 'POST', headers: { authorization: 'wrong-secret-value-x' } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(resetGame).not.toHaveBeenCalled();
  });

  it('refuses non-POST methods even with the right secret', async () => {
    process.env.TASK_SECRET = TEST_SECRET;
    const res = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: TEST_SECRET } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(405);
    expect(resetGame).not.toHaveBeenCalled();
  });

  it('runs the reset with the matching secret', async () => {
    process.env.TASK_SECRET = TEST_SECRET;
    const res = makeRes();
    await handler(
      { method: 'POST', headers: { authorization: TEST_SECRET } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(resetGame).toHaveBeenCalledTimes(1);
  });
});
