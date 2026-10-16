import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'bun:test';

import * as guard from '@/middleware/apiGuard';
import * as auditLogger from '@/utils/auditLogger';
import * as authorization from '@/utils/authorization';

import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from '../../../../../test/utils/mockPrisma';
import { silenceLogger } from '../../../../../test/utils/silenceLogger';

installMockPrisma(vi);

const ADMIN_ID = 1;
const TARGET_ID = 10;
const IP = '192.0.2.1';
const EMAIL = 'target@example.invalid';

const logAction = vi.fn();
const logActionStrict = vi.fn(async () => undefined);
// Restore shared dependency spies after this file; Bun module mocks persist
// process-wide even after mock.restore().
const spies: Array<{ mockRestore: () => void }> = [];
beforeAll(() => {
  spies.push(
    vi.spyOn(auditLogger, 'logAction').mockImplementation(logAction),
    vi
      .spyOn(auditLogger, 'logActionStrict')
      .mockImplementation(logActionStrict),
    vi.spyOn(auditLogger, 'getRequestIp').mockReturnValue(IP),
    vi.spyOn(authorization, 'checkStaffTargetAction').mockResolvedValue(null),
    vi.spyOn(authorization, 'isAdmin').mockResolvedValue(true),
  );
});
afterAll(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

// Scope the guard replacement to route construction. The resulting wrapper
// retains this suite's method/session gates without replacing other routes.
const guardSpy = vi
  .spyOn(guard, 'withApiGuard')
  .mockImplementation(
    (options: any) => (handler: any) => async (req: any, res: any) => {
      if (!options.methods.includes(req.method)) {
        res.setHeader('Allow', options.methods.join(', '));
        return res.status(405).json({ error: 'Method not allowed' });
      }
      if (!req.session?.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return handler(req, res, { requestId: 'test', body: req.body });
    },
  );
const routePath = require.resolve('@/pages/api/admin/account-action');
delete require.cache[routePath];
const handler = require('@/pages/api/admin/account-action').default;

guardSpy.mockRestore();
delete require.cache[routePath];
silenceLogger();

const { hashIdentity } = require('@/utils/identityHash');

const makeRes = () => {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const post = (body: any) => ({
  method: 'POST',
  headers: {},
  url: '/api/admin/account-action',
  socket: { remoteAddress: IP },
  session: { user: { id: String(ADMIN_ID) } },
  body,
});

/** Transaction double covering everything the route and blocks touch. */
const buildTx = () => ({
  $queryRaw: vi.fn(async () => [{ id: TARGET_ID }]),
  accountStatusHistory: {
    updateMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async () => ({ id: 1 })),
  },
  users: {
    findUnique: vi.fn(async () => ({ email: EMAIL })),
    update: vi.fn(async () => ({})),
  },
  identityBlock: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 1 })),
    update: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  staffRoleAssignment: { updateMany: vi.fn(async () => ({ count: 0 })) },
  permissionGrant: { updateMany: vi.fn(async () => ({ count: 0 })) },
});

let tx: ReturnType<typeof buildTx>;

beforeEach(() => {
  resetMockPrisma();
  logAction.mockClear();
  logActionStrict.mockClear();
  tx = buildTx();
  mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
});

describe('account-action identity blocks', () => {
  it('a permanent ban writes a SANCTION email block with null expiry inside the transaction', async () => {
    const res = makeRes();
    await handler(post({ userId: TARGET_ID, action: 'BANNED' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.identityBlock.create).toHaveBeenCalledWith({
      data: {
        kind: 'EMAIL',
        hash: hashIdentity('EMAIL', EMAIL),
        reason: 'SANCTION',
        sourceUserId: TARGET_ID,
        expiresAt: null,
      },
    });
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_ACCOUNT_ACTION',
        targetUserId: TARGET_ID,
      }),
      tx,
    );
  });

  it('a timed suspension writes a SANCTION block expiring at the sanction end', async () => {
    const res = makeRes();
    await handler(
      post({ userId: TARGET_ID, action: 'SUSPENDED', duration: 30 }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const { data } = tx.identityBlock.create.mock.calls[0][0];
    expect(data.reason).toBe('SANCTION');
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400_000,
    );
    expect(data.expiresAt.getTime()).toBeLessThan(Date.now() + 31 * 86400_000);
  });

  it('reactivating to ACTIVE clears the user SANCTION blocks', async () => {
    const res = makeRes();
    await handler(post({ userId: TARGET_ID, action: 'ACTIVE' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.identityBlock.deleteMany).toHaveBeenCalledWith({
      where: {
        kind: 'EMAIL',
        hash: hashIdentity('EMAIL', EMAIL),
        reason: 'SANCTION',
        sourceUserId: TARGET_ID,
      },
    });
    expect(tx.identityBlock.create).not.toHaveBeenCalled();
  });

  it('rejects every non-CLOSED action on anonymized accounts before any status write', async () => {
    tx.users.findUnique.mockResolvedValue({
      email: '10-deleted@deleted.local',
    });
    for (const action of ['ACTIVE', 'BANNED', 'SUSPENDED']) {
      const res = makeRes();
      await handler(post({ userId: TARGET_ID, action }), res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('Anonymized accounts'),
      });
    }
    expect(tx.accountStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.identityBlock.deleteMany).not.toHaveBeenCalled();
  });

  it('closing an account does not write or clear sanction blocks', async () => {
    const res = makeRes();
    await handler(post({ userId: TARGET_ID, action: 'CLOSED' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.identityBlock.create).not.toHaveBeenCalled();
    expect(tx.identityBlock.deleteMany).not.toHaveBeenCalled();
  });

  it('a failed block write rolls the status change back with it', async () => {
    tx.identityBlock.create.mockRejectedValue(new Error('block write failed'));
    const res = makeRes();

    await handler(post({ userId: TARGET_ID, action: 'BANNED' }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    // The strict audit row only commits when the whole transaction does.
    expect(logActionStrict).not.toHaveBeenCalled();
  });
});
