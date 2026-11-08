import { afterAll, beforeEach, describe, expect, it, mock, vi } from 'bun:test';

// Synthetic staff ids; none correspond to real accounts.
const ADMIN_ID = 1;
const MODERATOR_ID = 3;
const PLAYER_ID = 4;
const roles = new Map<number, string[]>([
  [ADMIN_ID, ['ADMINISTRATOR']],
  [MODERATOR_ID, ['MODERATOR']],
]);

const productionService = require('../../../../services/BattleVoid.service');

const serviceStub: any = {
  ...productionService,
  previewBattleVoid: vi.fn(),
  voidBattle: vi.fn(),
};
const productionGuard = require('../../../../middleware/apiGuard');
const productionAudit = require('../../../../utils/auditLogger');

const guardOptions: any[] = [];
const logActionStrict = vi.fn(async () => undefined);

// The guard's authMode is what is under test: emulate its admin check.
const guardStub = {
  withApiGuard: (options: any) => {
    guardOptions.push(options);
    return (handler: any) => async (req: any, res: any) => {
      if (!options.methods.includes(req.method))
        return res.status(405).json({ message: 'Method not allowed' });
      const actor = Number(req.session?.user?.id);
      if (!actor) return res.status(401).json({ message: 'Unauthorized' });
      if (
        options.authMode === 'admin' &&
        !(roles.get(actor) ?? []).includes('ADMINISTRATOR')
      )
        return res.status(403).json({ message: 'Forbidden' });
      const parsed = options.bodySchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: 'Invalid request body' });
      return handler(req, res, { body: parsed.data });
    };
  },
};

mock.module('@/middleware/apiGuard', () => guardStub);
mock.module('@/services/BattleVoid.service', () => serviceStub);
mock.module('@/utils/auditLogger', () => ({
  ...productionAudit,
  logActionStrict,
  getRequestIp: () => '192.0.2.1',
}));

const handler = require('../../../../pages/api/admin/attacks/void').default;

const response = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
const request = (userId: number, body: unknown) => ({
  method: 'POST',
  session: { user: { id: String(userId) } },
  body,
});
const PLAN = { logId: 7, defenderId: 20, hash: 'a'.repeat(64), items: [] };
const confirmBody = {
  action: 'confirm',
  attackLogId: 7,
  reason: 'Exploit',
  planHash: 'a'.repeat(64),
};

beforeEach(() => {
  serviceStub.previewBattleVoid.mockReset();
  serviceStub.voidBattle.mockReset();
  logActionStrict.mockClear();
  serviceStub.previewBattleVoid.mockResolvedValue(PLAN);
  serviceStub.voidBattle.mockResolvedValue({
    plan: PLAN,
    voidedAt: new Date(),
  });
});

afterAll(() => {
  guardStub.withApiGuard = productionGuard.withApiGuard;
  Object.assign(serviceStub, productionService);
});

describe('POST /api/admin/attacks/void', () => {
  it('requires the administrator guard used for destructive economy edits', () => {
    expect(guardOptions).toContainEqual(
      expect.objectContaining({ authMode: 'admin', methods: ['POST'] }),
    );
  });

  it.each([
    ['a moderator', MODERATOR_ID, 403],
    ['a player', PLAYER_ID, 403],
    ['nobody', 0, 401],
  ])('refuses %s without touching a battle', async (_name, userId, status) => {
    for (const body of [{ action: 'preview', attackLogId: 7 }, confirmBody]) {
      const res = response();
      await handler(request(userId, body), res);
      expect(res.status).toHaveBeenCalledWith(status);
    }
    expect(serviceStub.previewBattleVoid).not.toHaveBeenCalled();
    expect(serviceStub.voidBattle).not.toHaveBeenCalled();
  });

  it('previews for an administrator and audits the preview', async () => {
    const res = response();
    await handler(
      request(ADMIN_ID, { action: 'preview', attackLogId: 7 }),
      res,
    );
    expect(serviceStub.previewBattleVoid).toHaveBeenCalledWith(7, 'full');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_BATTLE_VOID_PREVIEW' }),
    );
  });

  it('will not confirm without a reason or the previewed plan', async () => {
    for (const body of [
      { ...confirmBody, reason: '   ' },
      { ...confirmBody, reason: undefined },
      { ...confirmBody, planHash: undefined },
      { ...confirmBody, extra: 1 },
    ]) {
      const res = response();
      await handler(request(ADMIN_ID, body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(serviceStub.voidBattle).not.toHaveBeenCalled();
  });

  it('confirms with the acting administrator and the trimmed reason', async () => {
    const res = response();
    await handler(
      request(ADMIN_ID, { ...confirmBody, reason: '  Exploit  ' }),
      res,
    );
    expect(serviceStub.voidBattle).toHaveBeenCalledWith(
      expect.objectContaining({
        logId: 7,
        actorId: ADMIN_ID,
        reason: 'Exploit',
        goldMode: 'full',
        planHash: 'a'.repeat(64),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('answers a repeated or racing void with its 409 code', async () => {
    const { BattleVoidError } = productionService;
    serviceStub.voidBattle.mockRejectedValue(
      new BattleVoidError(
        409,
        'ALREADY_VOIDED',
        'This battle has already been voided',
      ),
    );
    const res = response();
    await handler(request(ADMIN_ID, confirmBody), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This battle has already been voided',
      code: 'ALREADY_VOIDED',
    });
  });
});
