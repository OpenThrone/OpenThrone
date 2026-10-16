import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);

// Synthetic staff and player ids; none correspond to real accounts.
const ADMIN_ID = 1;
const GAME_MASTER_ID = 2;
const MODERATOR_ID = 3;
const OTHER_ADMIN_ID = 4;
const TARGET_ID = 10;
const IP = '192.0.2.1';

// Fixture role and grant maps, read by the emulated guard and by mockPrisma.
const db = {
  roles: new Map<number, string[]>(),
  grants: new Map<number, string[]>(),
};
const setRoles = (userId: number, roles: string[]) =>
  db.roles.set(userId, roles);

const sendMail = vi.fn(async () => ({ messageId: 'synthetic' }));
let transportSpy: ReturnType<typeof vi.spyOn>;

const logAction = vi.fn();
const logActionStrict = vi.fn(async (_entry: any, _client?: any) => undefined);
mock.module('@/utils/auditLogger', () => ({
  logAction,
  logActionStrict,
  getRequestIp: () => IP,
}));
silenceLogger();

// Other test files replace the real apiGuard process-wide, so this file installs
// an emulation of its checks (method, session, ADMINISTRATOR, expanded permissions)
// before the routes are loaded. The routes' authMode and permission config is what
// is under test here.
mock.module('@/middleware/apiGuard', () => {
  const { expandPermissions } = require('@/utils/permissions');
  return {
    withApiGuard:
      (options: any) => (handler: any) => async (req: any, res: any) => {
        if (!options.methods.includes(req.method)) {
          res.setHeader('Allow', options.methods.join(', '));
          return res.status(405).json({ message: 'Method not allowed' });
        }
        const actorId = Number(req.session?.user?.id);
        const hasSession = !!req.session?.user?.id;
        const roles = db.roles.get(actorId) ?? [];
        if (options.authMode === 'admin') {
          if (!hasSession)
            return res.status(401).json({ message: 'Unauthorized' });
          if (!roles.includes('ADMINISTRATOR'))
            return res.status(403).json({ message: 'Forbidden' });
        } else if (
          options.authMode === 'permission' ||
          options.requiredAnyPermissions
        ) {
          if (!hasSession)
            return res.status(401).json({ message: 'Unauthorized' });
          const granted = expandPermissions(
            roles,
            (db.grants.get(actorId) ?? []) as any[],
          );
          const allowed = (options.requiredAnyPermissions ?? []).some(
            (p: string) => granted.includes(p),
          );
          if (!allowed) return res.status(403).json({ message: 'Forbidden' });
        }
        const query = options.querySchema
          ? options.querySchema.parse(req.query)
          : (req.query ?? {});
        return handler(req, res, {
          requestId: 'test',
          actor: { type: 'session_admin', userId: actorId },
          actorType: 'session_admin',
          query,
          body: req.body,
        });
      },
  };
});

// Load routes fresh so a route cached by another file's guard mock is not reused.
delete require.cache[require.resolve('../../../../pages/api/admin/game/eras')];
const erasHandler = require('../../../../pages/api/admin/game/eras').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/users/export')
];
const exportHandler =
  require('../../../../pages/api/admin/users/export').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/users/[userId]')
];
const userHandler =
  require('../../../../pages/api/admin/users/[userId]').default;
const { AdminService } = require('../../../../services/Admin.service');

delete require.cache[
  require.resolve('../../../../pages/api/admin/account-action')
];
const accountActionHandler =
  require('../../../../pages/api/admin/account-action').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/account-reset')
];
const accountResetHandler =
  require('../../../../pages/api/admin/account-reset').default;

delete require.cache[require.resolve('../../../../pages/api/admin/vacation')];
const vacationHandler = require('../../../../pages/api/admin/vacation').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/users/reset-password')
];
const resetPasswordHandler =
  require('../../../../pages/api/admin/users/reset-password').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/grantPermission')
];
const grantPermissionHandler =
  require('../../../../pages/api/admin/grantPermission').default;

delete require.cache[
  require.resolve('../../../../pages/api/admin/impersonate/start')
];
const impersonateStartHandler =
  require('../../../../pages/api/admin/impersonate/start').default;

delete require.cache[require.resolve('../../../../pages/api/admin/start-era')];
const startEraHandler =
  require('../../../../pages/api/admin/start-era').default;

const makeRes = () => {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (actorId: number, overrides: Record<string, unknown> = {}) => {
  return {
    method: 'GET',
    headers: {},
    url: '/api/admin/test',
    socket: { remoteAddress: IP },
    session: { user: { id: String(actorId) } },
    query: {},
    body: undefined,
    ...overrides,
  } as any;
};

/** Wires the authorization lookups used by withApiGuard and expandPermissions. */
const wireAuthorization = () => {
  mockPrisma.staffRoleAssignment.findFirst = vi.fn(async ({ where }: any) =>
    (db.roles.get(where.userId) ?? []).includes(where.role) ? { id: 1 } : null,
  );
  mockPrisma.staffRoleAssignment.findMany = vi.fn(async ({ where }: any) => {
    // countOtherAdministrators: every holder of a role except one user.
    if (where.role) {
      return [...db.roles.entries()]
        .filter(
          ([userId, roles]) =>
            roles.includes(where.role) && userId !== where.userId?.not,
        )
        .map(([userId]) => ({ userId, role: where.role }));
    }
    return (db.roles.get(where.userId) ?? []).map((role) => ({ role }));
  });
  mockPrisma.permissionGrant.findMany = vi.fn(async ({ where }: any) =>
    (db.grants.get(where.user_id) ?? []).map((type) => ({ type })),
  );
};

/** Fake transaction client; unset methods resolve to harmless defaults. */
const makeTx = (models: Record<string, Record<string, any>> = {}) => {
  const cache: Record<string, any> = {};
  const tx: any = new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === '$queryRaw')
          return cache[model] ?? (cache[model] = vi.fn(async () => []));
        if (!cache[model]) {
          const methods = models[model] ?? {};
          cache[model] = new Proxy(
            {},
            {
              get: (_m, method: string) =>
                methods[method] ??
                (methods[method] = vi.fn(async () =>
                  method === 'findMany' ? [] : method === 'count' ? 0 : null,
                )),
            },
          );
        }
        return cache[model];
      },
    },
  );
  return tx;
};

const makeUserDetails = (overrides: Record<string, unknown> = {}) => ({
  id: TARGET_ID,
  email: 'target@example.com',
  password_hash: 'synthetic-hash-original',
  display_name: 'target',
  units: [],
  items: [],
  currentEraId: 1,
  ...overrides,
});

afterEach(() => transportSpy?.mockRestore());

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: 'synthetic' });
  transportSpy = vi
    .spyOn(require('@/services/Email.service'), 'sendImmediate')
    .mockImplementation(sendMail);
  resetMockPrisma();
  logAction.mockClear();
  logActionStrict.mockReset();
  logActionStrict.mockImplementation(async () => undefined);
  db.roles.clear();
  db.grants.clear();
  setRoles(ADMIN_ID, ['ADMINISTRATOR']);
  setRoles(GAME_MASTER_ID, ['GAME_MASTER']);
  setRoles(MODERATOR_ID, ['MODERATOR']);
  setRoles(OTHER_ADMIN_ID, ['ADMINISTRATOR']);
  wireAuthorization();
  mockPrisma.era = {
    findFirst: vi.fn(async () => ({ id: 1, startSettings: null })),
    findMany: vi.fn(async () => []),
  } as any;
  mockPrisma.$transaction = vi.fn();
});

describe('ADM-01: era start is admin-only', () => {
  it('rejects a GAME_MASTER starting an era and writes nothing', async () => {
    const res = makeRes();
    mockPrisma.$transaction = vi.fn();

    await erasHandler(
      makeReq(GAME_MASTER_ID, { method: 'POST', body: {} }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('still lets a GAME_MASTER read the era list', async () => {
    const res = makeRes();
    await erasHandler(makeReq(GAME_MASTER_ID, { method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('starts an era for an administrator and writes an audit row', async () => {
    const res = makeRes();
    mockPrisma.$transaction = vi.fn(async () => ({ id: 7 }));

    await erasHandler(makeReq(ADMIN_ID, { method: 'POST', body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_ID,
        action: 'ADMIN_ERA_START_REQUESTED',
      }),
    );
    expect(logAction).toHaveBeenCalledWith(ADMIN_ID, 'ADMIN_ERA_START', IP, {
      newEraId: 7,
    });
  });

  it.each([
    ['game/eras', () => erasHandler],
    ['start-era', () => startEraHandler],
  ])(
    '%s refuses to start an era when the audit row cannot be written',
    async (_name, getHandler) => {
      const res = makeRes();
      mockPrisma.$transaction = vi.fn(async () => ({ id: 7 }));
      logActionStrict.mockRejectedValueOnce(new Error('audit down'));

      await getHandler()(makeReq(ADMIN_ID, { method: 'POST', body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe('ADM-03: user export is admin-only and audited', () => {
  beforeEach(() => {
    mockPrisma.users.findUnique = vi.fn(async () => makeUserDetails());
    mockPrisma.attack_log.findMany = vi.fn(async () => []);
    (mockPrisma as any).accountStatusHistory = {
      findMany: vi.fn(async () => []),
    };
    (mockPrisma as any).messages = {
      findMany: vi.fn(async () => [
        { id: 1, body: 'synthetic private message' },
      ]),
    };
    (mockPrisma as any).report = { findMany: vi.fn(async () => []) };
  });

  it('rejects a MODERATOR before reading any user data', async () => {
    const res = makeRes();
    await exportHandler(
      makeReq(MODERATOR_ID, { query: { userId: String(TARGET_ID) } }),
      res,
      { query: { userId: TARGET_ID } } as any,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('exports for an administrator and writes one audit row per export', async () => {
    const res = makeRes();
    await exportHandler(
      makeReq(ADMIN_ID, { query: { userId: String(TARGET_ID) } }),
      res,
      { query: { userId: TARGET_ID } } as any,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledTimes(1);
    expect(logActionStrict).toHaveBeenCalledWith({
      userId: ADMIN_ID,
      action: 'ADMIN_USER_EXPORT',
      ip: IP,
      targetUserId: TARGET_ID,
      details: { messageCount: 1, reportCount: 0 },
    });
  });

  it('returns no data when the export audit row cannot be written', async () => {
    const res = makeRes();
    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    await exportHandler(
      makeReq(ADMIN_ID, { query: { userId: String(TARGET_ID) } }),
      res,
      { query: { userId: TARGET_ID } } as any,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to export' });
    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Content-Disposition',
      expect.anything(),
    );
  });
});

describe('ADM-04: staff email takeover and admin-on-admin edits are blocked', () => {
  const putBody = (email: string, extra: Record<string, unknown> = {}) => ({
    profile: { username: 'target', email },
    stats: { gold: '0', experience: 0, level: 1 },
    army: { units: [] },
    items: { items: [] },
    permissions: { permissions: [] },
    ...extra,
  });

  const runPut = async (
    actorId: number,
    targetRoles: Array<{ role: string; revokedAt: Date | null }>,
    email: string,
    targetEmail = 'target@example.com',
    options: {
      targetId?: number;
      grantCount?: number;
      otherAdmins?: number[];
      extraBody?: Record<string, unknown>;
    } = {},
  ) => {
    const targetId = options.targetId ?? TARGET_ID;
    const update = vi.fn(async () => null);
    const grantUpdateMany = vi.fn(async () => ({ count: 0 }));
    const grantDeleteMany = vi.fn(async () => ({ count: 0 }));
    const tx = makeTx({
      users: {
        findUnique: vi.fn(async () =>
          makeUserDetails({ id: targetId, email: targetEmail }),
        ),
        update,
      },
      staffRoleAssignment: {
        findMany: vi.fn(async ({ where }: any) =>
          where.role
            ? (options.otherAdmins ?? []).map((userId) => ({ userId }))
            : targetRoles,
        ),
      },
      userUnit: { updateMany: vi.fn(async () => ({ count: 1 })) },
      userItem: { updateMany: vi.fn(async () => ({ count: 1 })) },
      permissionGrant: {
        count: vi.fn(async () => options.grantCount ?? 0),
        updateMany: grantUpdateMany,
        deleteMany: grantDeleteMany,
      },
    });
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
    const res = makeRes();
    await userHandler(
      makeReq(actorId, {
        method: 'PUT',
        query: { userId: String(targetId) },
        body: putBody(email, options.extraBody),
      }),
      res,
      { query: { userId: targetId } } as any,
    );
    return { res, update, tx, grantUpdateMany, grantDeleteMany };
  };

  it('blocks an email change on a staff account and audits the denial', async () => {
    const { res, update } = await runPut(
      ADMIN_ID,
      [{ role: 'MODERATOR', revokedAt: null }],
      'attacker@example.com',
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(update).not.toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'ADMIN_USER_UPDATE_DENIED',
      IP,
      expect.objectContaining({ targetUserId: TARGET_ID, emailChanged: true }),
    );
  });

  it('blocks an administrator editing another administrator', async () => {
    const { res, update } = await runPut(
      ADMIN_ID,
      [{ role: 'ADMINISTRATOR', revokedAt: null }],
      'target@example.com',
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(update).not.toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'ADMIN_USER_UPDATE_DENIED',
      IP,
      expect.objectContaining({ reason: 'admin_on_admin' }),
    );
  });

  it('still allows an email change on a player account and audits the update in the transaction', async () => {
    const { res, update, tx, grantUpdateMany, grantDeleteMany } = await runPut(
      ADMIN_ID,
      [],
      'new@example.com',
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(update).toHaveBeenCalled();
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_ID,
        action: 'ADMIN_USER_UPDATE',
        targetUserId: TARGET_ID,
        details: expect.objectContaining({ emailChanged: true }),
      }),
      tx,
    );
    expect(logAction).not.toHaveBeenCalled();
    // Grants are soft-revoked, never hard-deleted.
    expect(grantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
    expect(grantDeleteMany).not.toHaveBeenCalled();
  });

  it('persists bank gold and XP without rewriting rank or legacy inventory', async () => {
    const { res, update } = await runPut(
      ADMIN_ID,
      [],
      'target@example.com',
      'target@example.com',
      {
        extraBody: {
          stats: {
            gold: '123',
            goldInBank: '9007199254740993',
            experience: 234,
            level: 99,
          },
        },
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const data = update.mock.calls.map((call: any) => call[0].data);
    expect(data).toContainEqual({
      gold: 123n,
      gold_in_bank: 9007199254740993n,
      experience: 234,
    });
    expect(
      data.every(
        (entry: any) =>
          !('rank' in entry) && !('units' in entry) && !('items' in entry),
      ),
    ).toBe(true);
  });

  it('updates exact normalized levels and usages without merging matching types', async () => {
    const { res, tx } = await runPut(
      ADMIN_ID,
      [],
      'target@example.com',
      'target@example.com',
      {
        extraBody: {
          army: {
            units: [
              {
                id: 'OFFENSE:1:false',
                type: 'OFFENSE',
                level: 1,
                isMercenary: false,
                quantity: 5,
              },
              {
                id: 'OFFENSE:2:true',
                type: 'OFFENSE',
                level: 2,
                isMercenary: true,
                quantity: 9,
              },
            ],
          },
          items: {
            items: [
              {
                id: 'WEAPON:OFFENSE:1',
                type: 'WEAPON',
                usage: 'OFFENSE',
                level: 1,
                quantity: 10,
              },
              {
                id: 'WEAPON:DEFENSE:1',
                type: 'WEAPON',
                usage: 'DEFENSE',
                level: 1,
                quantity: 11,
              },
            ],
          },
        },
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.userUnit.updateMany).toHaveBeenCalledWith({
      where: {
        userId: TARGET_ID,
        type: 'OFFENSE',
        level: 2,
        isMercenary: true,
      },
      data: { quantity: 9 },
    });
    expect(tx.userItem.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, type: 'WEAPON', usage: 'DEFENSE', level: 1 },
      data: { quantity: 11 },
    });
  });

  it('rejects negative resources before any user write', async () => {
    const { res, update } = await runPut(
      ADMIN_ID,
      [],
      'target@example.com',
      'target@example.com',
      {
        extraBody: { stats: { gold: '-1', experience: 0 } },
      },
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the email lock on an account whose staff role was revoked', async () => {
    const { res, update } = await runPut(
      ADMIN_ID,
      [{ role: 'MODERATOR', revokedAt: new Date('2026-01-01') }],
      'attacker@example.com',
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the email lock on an account whose grants were revoked', async () => {
    const { res, update } = await runPut(
      ADMIN_ID,
      [],
      'attacker@example.com',
      'target@example.com',
      { grantCount: 1 },
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses the last administrator dropping their own role', async () => {
    const { res, update } = await runPut(
      ADMIN_ID,
      [{ role: 'ADMINISTRATOR', revokedAt: null }],
      'target@example.com',
      'target@example.com',
      {
        targetId: ADMIN_ID,
        otherAdmins: [],
        extraBody: { staffRoles: { roles: [] } },
      },
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(update).not.toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'ADMIN_USER_UPDATE_DENIED',
      IP,
      expect.objectContaining({ reason: 'last_administrator' }),
    );
  });

  it('lets an administrator drop their own role while another remains', async () => {
    const { res } = await runPut(
      ADMIN_ID,
      [{ role: 'ADMINISTRATOR', revokedAt: null }],
      'target@example.com',
      'target@example.com',
      {
        targetId: ADMIN_ID,
        otherAdmins: [OTHER_ADMIN_ID],
        extraBody: { staffRoles: { roles: [] } },
      },
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses serializable isolation so concurrent self-demotions cannot remove every administrator', async () => {
    await runPut(
      ADMIN_ID,
      [{ role: 'ADMINISTRATOR', revokedAt: null }],
      'target@example.com',
      'target@example.com',
      {
        targetId: ADMIN_ID,
        otherAdmins: [OTHER_ADMIN_ID],
        extraBody: { staffRoles: { roles: [] } },
      },
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rolls the edit back and reports failure when the audit write fails', async () => {
    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    const { res } = await runPut(ADMIN_ID, [], 'new@example.com');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(logAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'ADMIN_USER_UPDATE_FAILED',
      IP,
      expect.anything(),
    );
  });
});

describe('ADM-02: reset and close revoke access', () => {
  const eraTxModels = () => ({
    era: { findFirst: vi.fn(async () => ({ id: 1, startSettings: null })) },
  });

  it('reset soft-revokes the old account roles and grants and replaces its password hash', async () => {
    const staffDelete = vi.fn(async () => ({ count: 1 }));
    const grantDelete = vi.fn(async () => ({ count: 1 }));
    const staffRevoke = vi.fn(async () => ({ count: 1 }));
    const grantRevoke = vi.fn(async () => ({ count: 1 }));
    const usersUpdate = vi.fn(async () => null);
    const usersCreate = vi.fn(async () => ({ id: 99 }));
    const tx = makeTx({
      ...eraTxModels(),
      users: {
        findUnique: vi.fn(async () => makeUserDetails()),
        update: usersUpdate,
        create: usersCreate,
      },
      staffRoleAssignment: { deleteMany: staffDelete, updateMany: staffRevoke },
      permissionGrant: { deleteMany: grantDelete, updateMany: grantRevoke },
    });
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
    const beforeCommit = vi.fn(async () => undefined);

    const result = await AdminService.resetAccount(
      ADMIN_ID,
      { userId: TARGET_ID },
      { beforeCommit },
    );

    expect(result.newUserId).toBe(99);
    expect(staffDelete).not.toHaveBeenCalled();
    expect(grantDelete).not.toHaveBeenCalled();
    expect(staffRevoke).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(grantRevoke).toHaveBeenCalledWith({
      where: { user_id: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(beforeCommit).toHaveBeenCalledWith(tx, {
      oldUserId: TARGET_ID,
      newUserId: 99,
    });
    const oldAccountUpdate = usersUpdate.mock.calls.find(
      ([args]: any) => args.where.id === TARGET_ID && args.data.password_hash,
    );
    expect(oldAccountUpdate).toBeDefined();
    expect(oldAccountUpdate![0].data.password_hash).not.toBe(
      'synthetic-hash-original',
    );
    // The replacement account keeps the original credentials.
    expect(usersCreate.mock.calls[0][0].data.password_hash).toBe(
      'synthetic-hash-original',
    );
  });

  it('closing an account revokes roles and grants in the same transaction', async () => {
    const staffRevoke = vi.fn(async () => ({ count: 1 }));
    const grantRevoke = vi.fn(async () => ({ count: 1 }));
    const usersUpdate = vi.fn(async () => null);
    const tx = makeTx({
      users: { update: usersUpdate },
      accountStatusHistory: { updateMany: vi.fn(), create: vi.fn() },
      staffRoleAssignment: { updateMany: staffRevoke },
      permissionGrant: { updateMany: grantRevoke },
    });
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));

    await AdminService.performAccountAction(ADMIN_ID, {
      userId: TARGET_ID,
      action: 'CLOSED',
    });

    expect(staffRevoke).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(grantRevoke).toHaveBeenCalledWith({
      where: { user_id: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(usersUpdate).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { password_hash: expect.any(String) },
    });
  });
});

describe('ADM-05: staff cannot take over or lock out administrators', () => {
  const post = (actorId: number, body: Record<string, unknown>) =>
    makeReq(actorId, { method: 'POST', body });

  const txWithStatus = () =>
    makeTx({
      users: {
        findUnique: vi.fn(async ({ where }: any) => ({
          id: where.id,
          email: 'staff@example.invalid',
        })),
      },
      accountStatusHistory: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async () => ({ id: 1 })),
      },
      passwordReset: { create: vi.fn(async () => ({ id: 55 })) },
      permissionGrant: { create: vi.fn(async () => ({ id: 66 })) },
    });

  it.each([
    ['account-action', () => accountActionHandler, { action: 'BANNED' }],
    ['account-action', () => accountActionHandler, { action: 'CLOSED' }],
    ['account-reset', () => accountResetHandler, {}],
    ['vacation', () => vacationHandler, { action: 'start' }],
  ])(
    '%s %j refuses another administrator and writes nothing',
    async (_name, getHandler, extra) => {
      const res = makeRes();
      await getHandler()(
        post(ADMIN_ID, { userId: OTHER_ADMIN_ID, ...extra }),
        res,
        { body: { userId: OTHER_ADMIN_ID, ...extra } } as any,
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(logActionStrict).not.toHaveBeenCalled();
      expect(logAction).toHaveBeenCalledWith(
        ADMIN_ID,
        expect.stringMatching(/_DENIED$/),
        IP,
        expect.objectContaining({
          targetUserId: OTHER_ADMIN_ID,
          reason: 'admin_target',
        }),
      );
    },
  );

  it.each([
    ['account-action', () => accountActionHandler, { action: 'SUSPENDED' }],
    ['account-reset', () => accountResetHandler, {}],
    ['vacation', () => vacationHandler, { action: 'start' }],
  ])(
    '%s refuses an administrator targeting themselves',
    async (_name, getHandler, extra) => {
      const res = makeRes();
      await getHandler()(post(ADMIN_ID, { userId: ADMIN_ID, ...extra }), res, {
        body: { userId: ADMIN_ID, ...extra },
      } as any);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('bans a player and writes the audit row inside the transaction', async () => {
    const tx = txWithStatus();
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
    const res = makeRes();

    await accountActionHandler(
      post(ADMIN_ID, { userId: TARGET_ID, action: 'BANNED' }),
      res,
      { body: { userId: TARGET_ID, action: 'BANNED' } } as any,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_ACCOUNT_ACTION',
        targetUserId: TARGET_ID,
      }),
      tx,
    );
  });

  it('fails the ban when its audit row cannot be written', async () => {
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(txWithStatus()));
    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    const res = makeRes();

    await accountActionHandler(
      post(ADMIN_ID, { userId: TARGET_ID, action: 'BANNED' }),
      res,
      { body: { userId: TARGET_ID, action: 'BANNED' } } as any,
    );

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it.each(['BANNED', 'SUSPENDED', 'CLOSED'])(
    'vacation cannot overlay an active %s restriction',
    async (status) => {
      const tx = txWithStatus();
      tx.accountStatusHistory.findFirst.mockImplementation(async () => ({
        status,
        end_date: null,
      }));
      mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
      const res = makeRes();
      await vacationHandler(
        post(ADMIN_ID, { userId: TARGET_ID, action: 'start' }),
        res,
        { body: { userId: TARGET_ID, action: 'start' } } as any,
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(tx.accountStatusHistory.create).not.toHaveBeenCalled();
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    },
  );

  it('rechecks target hierarchy under lock after a concurrent administrator promotion', async () => {
    const tx = txWithStatus();
    tx.staffRoleAssignment.findMany.mockImplementation(
      async ({ where }: any) =>
        where.userId === TARGET_ID
          ? [{ role: 'ADMINISTRATOR' }]
          : [{ role: 'ADMINISTRATOR' }],
    );
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
    const res = makeRes();
    await accountActionHandler(
      post(ADMIN_ID, { userId: TARGET_ID, action: 'BANNED' }),
      res,
      { body: { userId: TARGET_ID, action: 'BANNED' } } as any,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.accountStatusHistory.create).not.toHaveBeenCalled();
  });

  it('vacation on a player is audited inside the transaction', async () => {
    const tx = txWithStatus();
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
    const res = makeRes();

    await vacationHandler(
      post(ADMIN_ID, { userId: TARGET_ID, action: 'start' }),
      res,
      { body: { userId: TARGET_ID, action: 'start' } } as any,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_VACATION_START',
        targetUserId: TARGET_ID,
      }),
      tx,
    );
  });

  it('a moderator cannot reset an administrator or moderator password', async () => {
    db.grants.set(MODERATOR_ID, []);
    for (const target of [ADMIN_ID, OTHER_ADMIN_ID, 5]) {
      if (target === 5) setRoles(5, ['MODERATOR']);
      const res = makeRes();
      await resetPasswordHandler(post(MODERATOR_ID, { userId: target }), res, {
        body: { userId: target },
      } as any);
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('an administrator resetting a moderator password audits it in the transaction', async () => {
    const tx = txWithStatus();
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
    const res = makeRes();

    await resetPasswordHandler(post(ADMIN_ID, { userId: MODERATOR_ID }), res, {
      body: { userId: MODERATOR_ID },
    } as any);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_PASSWORD_RESET_INITIATED',
        targetUserId: MODERATOR_ID,
        entityId: 55,
      }),
      tx,
    );
  });

  it('grantPermission refuses another administrator', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      id: OTHER_ADMIN_ID,
      twoFactorSecret: 'synthetic',
      permissions: [],
    }));
    const res = makeRes();

    await grantPermissionHandler(
      post(ADMIN_ID, { user: 'other-admin', permission: 'VIEW_AUDIT_LOGS' }),
      res,
      {
        body: { user: 'other-admin', permission: 'VIEW_AUDIT_LOGS' },
      } as any,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('grantPermission writes the grant and its audit row together', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      id: TARGET_ID,
      twoFactorSecret: 'synthetic',
      permissions: [],
    }));
    const tx = txWithStatus();
    mockPrisma.$transaction = vi.fn(async (cb: any) => cb(tx));
    const res = makeRes();

    await grantPermissionHandler(
      post(ADMIN_ID, { user: 'target', permission: 'VIEW_AUDIT_LOGS' }),
      res,
      { body: { user: 'target', permission: 'VIEW_AUDIT_LOGS' } } as any,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_PERMISSION_GRANT',
        targetUserId: TARGET_ID,
        entityId: 66,
        details: { permission: 'VIEW_AUDIT_LOGS' },
      }),
      tx,
    );
  });
});

describe('ADM-06: impersonation never reaches staff accounts', () => {
  const start = async (
    targetId: number,
    session: Record<string, unknown> = { user: { id: String(ADMIN_ID) } },
  ) => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      id: targetId,
      email: 'synthetic@example.com',
      display_name: 'synthetic',
    }));
    const res = makeRes();
    await impersonateStartHandler(
      makeReq(ADMIN_ID, {
        method: 'POST',
        body: { targetUserId: targetId },
        session,
      }),
      res,
      { body: { targetUserId: targetId } } as any,
    );
    return res;
  };

  it.each([
    ['an administrator', OTHER_ADMIN_ID],
    ['a game master', GAME_MASTER_ID],
    ['a moderator', MODERATOR_ID],
  ])('refuses %s and issues no ticket', async (_label, targetId) => {
    const res = await start(targetId);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(logActionStrict).not.toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'ADMIN_IMPERSONATE_DENIED',
      IP,
      expect.objectContaining({ targetUserId: targetId }),
    );
  });

  it('refuses a player holding only a permission grant', async () => {
    db.grants.set(TARGET_ID, ['VIEW_AUDIT_LOGS']);
    const res = await start(TARGET_ID);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('refuses to start from an impersonated session', async () => {
    const res = await start(TARGET_ID, {
      user: { id: String(ADMIN_ID), impersonatedBy: OTHER_ADMIN_ID },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(logActionStrict).not.toHaveBeenCalled();
  });

  it('records the ticket before issuing it for a player', async () => {
    const res = await start(TARGET_ID);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith({
      userId: ADMIN_ID,
      action: 'ADMIN_IMPERSONATE_TICKET_ISSUED',
      ip: IP,
      targetUserId: TARGET_ID,
    });
    expect(res.json.mock.calls[0][0].signInPayload.impersonationTicket).toEqual(
      expect.any(String),
    );
  });

  it('issues no ticket when the audit row cannot be written', async () => {
    logActionStrict.mockRejectedValueOnce(new Error('audit down'));
    const res = await start(TARGET_ID);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ signInPayload: expect.anything() }),
    );
  });
});

describe('ADM-07: audit rows carry the target in the indexed column', () => {
  it('GeneralService.logAuditAction copies details.targetUserId to targetUserId', async () => {
    const { GeneralService } = require('../../../../services/General.service');
    const create = vi.fn(async () => ({ id: 1 }));
    (mockPrisma as any).auditLog = { create };

    await GeneralService.logAuditAction(ADMIN_ID, 'TEST_ACTION', IP, {
      targetUserId: TARGET_ID,
    });
    await GeneralService.logAuditAction(ADMIN_ID, 'TEST_ACTION', IP, {});

    expect(create.mock.calls[0][0].data.targetUserId).toBe(TARGET_ID);
    expect(create.mock.calls[1][0].data.targetUserId).toBeNull();
  });
});

describe('admin sensitive chat reads', () => {
  const chatLogsHandler =
    require('../../../../pages/api/admin/moderation/chat/logs').default;
  beforeEach(() => {
    resetMockPrisma();
    setRoles(ADMIN_ID, ['ADMINISTRATOR']);
    logActionStrict.mockReset();
    logActionStrict.mockResolvedValue(undefined);
    mockPrisma.chatMessage = {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    };
  });

  it('does not add an unfiltered sender branch for textual searches', async () => {
    const res = makeRes();
    await chatLogsHandler(
      makeReq(ADMIN_ID, { method: 'GET', query: { search: 'needle' } }),
      res,
      { query: { search: 'needle', limit: 25, offset: 0 } } as any,
    );
    expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ content: { contains: 'needle', mode: 'insensitive' } }],
        },
      }),
    );
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_CHAT_LOGS_READ' }),
    );
  });

  it('returns no chat data when its required audit fails', async () => {
    logActionStrict.mockRejectedValueOnce(new Error('audit unavailable'));
    const res = makeRes();
    await expect(
      chatLogsHandler(makeReq(ADMIN_ID, { method: 'GET' }), res, {
        query: { limit: 25, offset: 0 },
      } as any),
    ).rejects.toThrow('audit unavailable');
    expect(res.json).not.toHaveBeenCalled();
  });
});
