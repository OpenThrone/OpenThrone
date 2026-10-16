import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
  vi,
} from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

import { AccountService } from '@/services/Account.service';

installMockPrisma(vi);
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
silenceLogger();

const handler =
  require('../../../../pages/api/account/updateLastActive').default;
const {
  invalidateRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');

function setLoginDisabled(disabled: boolean) {
  process.env.NEXT_PUBLIC_DISABLE_LOGIN = String(disabled);
  invalidateRuntimeConfigCache();
}

const originalLogin = process.env.NEXT_PUBLIC_DISABLE_LOGIN;

// Synthetic session identity; not a real account.
const session = {
  user: { id: 125, email: 'player@example.com', display_name: 'Player' },
};

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('account activity endpoint', () => {
  let updateLastActive: ReturnType<typeof spyOn>;
  beforeEach(() => {
    resetMockPrisma();
    invalidateRuntimeConfigCache();
    // Spy on the service method instead of mocking '@/services' process-wide,
    // which would replace the service index for every later test file.
    updateLastActive = spyOn(
      AccountService,
      'updateLastActive',
    ).mockResolvedValue({ message: 'ok', userId: 125 } as any);
  });
  afterEach(() => {
    updateLastActive.mockRestore();
    if (originalLogin === undefined)
      delete process.env.NEXT_PUBLIC_DISABLE_LOGIN;
    else process.env.NEXT_PUBLIC_DISABLE_LOGIN = originalLogin;
    invalidateRuntimeConfigCache();
  });

  it('does not record activity for a non-staff session while login is disabled', async () => {
    setLoginDisabled(true);
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue(null);
    const res = makeRes();

    await handler(
      { method: 'POST', body: { email: session.user.email }, session },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateLastActive).not.toHaveBeenCalled();
  });

  it('records activity for the session owner holding an active staff role while login is disabled', async () => {
    setLoginDisabled(true);
    mockPrisma.staffRoleAssignment.findFirst.mockResolvedValue({ id: 7 });
    const res = makeRes();

    await handler(
      { method: 'POST', body: { email: session.user.email }, session },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateLastActive).toHaveBeenCalledWith({ userId: 125 });
  });

  it('rejects a request that names another account', async () => {
    setLoginDisabled(false);
    const res = makeRes();

    await handler({ method: 'POST', body: { userId: 36 }, session }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateLastActive).not.toHaveBeenCalled();
  });

  it('records activity only for the session owner when login is open', async () => {
    setLoginDisabled(false);
    const res = makeRes();

    await handler(
      { method: 'POST', body: { email: session.user.email }, session },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateLastActive).toHaveBeenCalledWith({ userId: 125 });
  });
});
