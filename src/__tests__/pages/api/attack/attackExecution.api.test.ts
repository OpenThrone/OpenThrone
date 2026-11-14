import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
  vi,
} from 'bun:test';
import md5 from 'md5';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// The route must push its attack notification through the realtime facade,
// never through the socket server directly (post-merge contract). The full
// facade surface is mocked: loading the real barrel pulls in modules that
// import the other realtime helpers too.
const emitToUser = vi.fn(async () => {});
mock.module('@/lib/realtime', () => ({
  emitToUser,
  emitToAll: vi.fn(),
  emitToRoom: vi.fn(),
  emitToUsers: vi.fn(),
  evictUserFromChatRoom: vi.fn(),
  evictUserFromAllianceChatRooms: vi.fn(),
  isRealtimeEnabled: () => false,
  __resetRealtimeModuleCacheForTests: () => {},
}));

// Bypass apiGuard (delegates to the handler with query/body context) while
// capturing the guard options the route registers, and the idempotency
// middleware, so the route logic itself is under test.
const guardOptions: any[] = [];
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: (options: any) => {
    guardOptions.push(options);
    return (handler: any) => (req: any, res: any) =>
      handler(req, res, { query: req.query ?? {}, body: req.body ?? {} });
  },
}));
const enforceIdempotency = vi.fn(async () => true);
mock.module('@/middleware/idempotency', () => ({ enforceIdempotency }));

// Route -> BattleService contract. The protection/alliance gates themselves
// live in the service (covered by AttackService tests); here only the
// delegation, flag forwarding and response envelope are under test. The spy
// targets the source module so the barrel re-export in the route stays live
// and no '@/services' module mock leaks into other test files.
const { BattleService } = require('@/services/Battle.service');
// Other test files replace '@/utils/auditLogger' process-wide with a no-op,
// so the audit is asserted at this seam (spyOn rebinds the live export the
// route imported) rather than through prisma.auditLog.
const auditLogger = require('@/utils/auditLogger');

const route = require('../../../../pages/api/attack/[id]').default;

// Synthetic players; no real accounts.
const ATTACKER_ID = 1;
const DEFENDER_ID = 2;
const BATTLE_ID = 321;

// Envelopes copied from AttackService so the route pass-through is pinned
// against the real domain shapes.
const PROTECTION_CONFIRMATION_REQUIRED = {
  status: 'failed',
  message:
    'Attacking a player who is not protected ends your protection for the rest of the era. Confirm to continue.',
  code: 'PROTECTION_FORFEIT_CONFIRMATION_REQUIRED',
};
const ALLIANCE_CONFIRMATION_REQUIRED = {
  status: 'failed',
  message:
    'This player is a fellow member of your alliance "Order of the Test". Confirm to attack them anyway.',
  code: 'ALLIANCE_MEMBER_CONFIRMATION_REQUIRED',
  extra_variables: { allianceId: 9, allianceName: 'Order of the Test' },
};

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (
  extra: { query?: object; body?: object; session?: object } = {},
) => ({
  method: 'POST',
  headers: {},
  url: `/api/attack/${DEFENDER_ID}`,
  session: { user: { id: ATTACKER_ID } },
  query: { id: DEFENDER_ID },
  body: { turns: 5 },
  ...extra,
});

let executeAttack: ReturnType<typeof spyOn>;

beforeEach(() => {
  resetMockPrisma();
  enforceIdempotency.mockClear();
  enforceIdempotency.mockResolvedValue(true);
  emitToUser.mockClear();
  executeAttack = spyOn(BattleService, 'executeAttack');
  executeAttack.mockResolvedValue({ status: 'success' });
  mockPrisma.users.update = vi.fn(async () => ({}));
  mockPrisma.auditLog = { create: vi.fn(async () => ({})) };
});

afterEach(() => {
  executeAttack.mockRestore();
});

describe('POST /api/attack/[id] guard registration', () => {
  it('requires auth, is POST-only and uses the attack rate-limit profile', () => {
    expect(guardOptions).toHaveLength(1);
    expect(guardOptions[0]).toMatchObject({
      methods: ['POST'],
      authMode: 'required',
      rateLimitProfile: 'attack',
    });
  });
});

describe('POST /api/attack/[id] input validation', () => {
  it('rejects a missing target id before touching the service', async () => {
    const res = makeRes();

    await route(makeReq({ query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'failed',
      message: 'Invalid input',
    });
    expect(executeAttack).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric target id', async () => {
    const res = makeRes();

    await route(makeReq({ query: { id: 'two' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'failed',
      message: 'Invalid input',
    });
    expect(executeAttack).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric turns value', async () => {
    const res = makeRes();

    await route(makeReq({ body: { turns: 'many' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'failed',
      message: 'Invalid input',
    });
    expect(executeAttack).not.toHaveBeenCalled();
  });
});

describe('POST /api/attack/[id] idempotency and session parsing', () => {
  it('scopes the idempotency key to the target and acting user', async () => {
    await route(makeReq({ session: { user: { id: '7' } } }), makeRes());

    expect(enforceIdempotency).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { scope: `attack:${DEFENDER_ID}`, actorKey: '7' },
    );
  });

  it('parses a string session id into the numeric attacker id', async () => {
    await route(makeReq({ session: { user: { id: '7' } } }), makeRes());

    expect(executeAttack).toHaveBeenCalledWith(
      expect.objectContaining({
        attackerId: 7,
        defenderId: DEFENDER_ID,
        attackTurns: 5,
      }),
    );
  });

  it('stops before the service when the idempotency key is a replay', async () => {
    enforceIdempotency.mockResolvedValue(false);
    const res = makeRes();

    await route(makeReq({}), res);

    expect(executeAttack).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(200);
  });
});

describe('POST /api/attack/[id] confirm gates (master v0.4.1 merge)', () => {
  it('forwards no confirm flags and passes the protection refusal through verbatim', async () => {
    executeAttack.mockResolvedValue(PROTECTION_CONFIRMATION_REQUIRED);
    const res = makeRes();

    await route(makeReq({}), res);

    const args = executeAttack.mock.calls[0][0];
    expect(args).toMatchObject({
      attackerId: ATTACKER_ID,
      defenderId: DEFENDER_ID,
      attackTurns: 5,
    });
    expect(args.confirmProtectionForfeit).toBeUndefined();
    expect(args.confirmAllianceAttack).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(PROTECTION_CONFIRMATION_REQUIRED);
    expect(emitToUser).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('drops the retired confirmProtectionForfeit flag (attacking never forfeits protection)', async () => {
    await route(
      makeReq({ body: { turns: 5, confirmProtectionForfeit: true } }),
      makeRes(),
    );

    expect(
      executeAttack.mock.calls[0][0].confirmProtectionForfeit,
    ).toBeUndefined();
  });

  it('passes the alliance-member refusal through verbatim without emitting', async () => {
    executeAttack.mockResolvedValue(ALLIANCE_CONFIRMATION_REQUIRED);
    const res = makeRes();

    await route(makeReq({}), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(ALLIANCE_CONFIRMATION_REQUIRED);
    expect(emitToUser).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('carries confirmAllianceAttack into the service when confirmed', async () => {
    await route(
      makeReq({ body: { turns: 5, confirmAllianceAttack: true } }),
      makeRes(),
    );

    expect(executeAttack).toHaveBeenCalledWith(
      expect.objectContaining({
        attackerId: ATTACKER_ID,
        defenderId: DEFENDER_ID,
        attackTurns: 5,
        confirmAllianceAttack: true,
      }),
    );
  });
});

describe('POST /api/attack/[id] success path', () => {
  it('notifies the defender through the realtime facade', async () => {
    executeAttack.mockResolvedValue({
      status: 'success',
      attack_log: BATTLE_ID,
    });
    const res = makeRes();

    await route(makeReq({}), res);

    const message = `You were attacked in battle ${BATTLE_ID}`;
    expect(emitToUser).toHaveBeenCalledTimes(1);
    expect(emitToUser).toHaveBeenCalledWith(DEFENDER_ID, 'attackNotification', {
      message,
      hash: md5(message + BATTLE_ID + DEFENDER_ID),
      battleId: BATTLE_ID,
      attackerId: ATTACKER_ID,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      attack_log: BATTLE_ID,
    });
  });

  it('stamps gameplay activity and audits the ATTACK action', async () => {
    executeAttack.mockResolvedValue({
      status: 'success',
      attack_log: BATTLE_ID,
    });
    const logActionSpy = spyOn(auditLogger, 'logAction');

    await route(makeReq({}), makeRes());

    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: ATTACKER_ID },
      data: { last_gameplay_at: expect.any(Date) },
    });
    expect(logActionSpy).toHaveBeenCalledWith(
      ATTACKER_ID,
      'ATTACK',
      expect.anything(),
      { targetId: DEFENDER_ID, turns: 5 },
    );
    logActionSpy.mockRestore();
  });

  it('skips the notification but keeps the activity stamp when there is no log', async () => {
    executeAttack.mockResolvedValue({ status: 'success' });

    await route(makeReq({}), makeRes());

    expect(emitToUser).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).toHaveBeenCalled();
  });
});

describe('POST /api/attack/[id] error handling', () => {
  it('returns the failed envelope with the error message when the service throws', async () => {
    executeAttack.mockRejectedValue(new Error('boom'));
    const res = makeRes();

    await route(makeReq({}), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'failed',
      message: 'Internal server error',
      error: 'boom',
    });
    expect(emitToUser).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });
});
