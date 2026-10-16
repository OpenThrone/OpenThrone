import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);

// Identity wrapper, as in the updateLastActive route test. The handler itself
// must refuse any request that lacks a session user.
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
silenceLogger();

const { AccountService } = require('@/services/Account.service');
const handler = require('../../../../pages/api/account/end-vacation').default;

const endVacation = vi.spyOn(AccountService, 'endVacation');

// Synthetic session identity; not a real account.
const session = { user: { id: 125 } };

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('end-vacation endpoint', () => {
  beforeEach(() => {
    endVacation.mockReset();
    endVacation.mockResolvedValue({ message: 'Vacation mode ended' });
  });

  it('rejects a request without a session before touching the account', async () => {
    const res = makeRes();
    await handler({ method: 'POST', body: { userId: 125 } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(endVacation).not.toHaveBeenCalled();
  });

  it('ignores a body userId and ends vacation for the session owner only', async () => {
    const res = makeRes();
    await handler({ method: 'POST', body: { userId: 999 }, session }, res);

    expect(endVacation).toHaveBeenCalledWith(125);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects non-POST methods', async () => {
    const res = makeRes();
    await handler({ method: 'GET', session }, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(endVacation).not.toHaveBeenCalled();
  });
});
