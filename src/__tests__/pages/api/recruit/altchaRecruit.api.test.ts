import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

// The real captcha services run here (no mock), so these tests prove the recruit
// endpoints themselves refuse a missing, forged or reused ALTCHA payload.
installMockPrisma(vi);
silenceLogger();
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
vi.mock('@/services/AutoRecruitAccess.service', () => ({
  AUTO_RECRUIT_DISABLED: { error: 'disabled' },
  canAutoRecruit: async () => true,
}));

const {
  invalidateRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');
const { issueAltchaChallenge } = require('@/services/AltchaCaptcha.service');
const externalHandler =
  require('../../../../pages/api/recruit/external/[id]').default;
const sessionHandler =
  require('../../../../pages/api/recruit/startSession').default;
const stateHandler = require('../../../../pages/api/recruit/[id]').default;

const OWNER = 7;
const LINK = 'synthetic-owner-link';
const IP = '192.0.2.18';
const keys = [
  'ALTCHA_HMAC_KEY',
  'DISABLE_TURNSTILE',
  'NEXT_PUBLIC_USE_CAPTCHA',
] as const;
let original: (string | undefined)[];
const used = new Set<string>();

const response = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
const transaction = () => ({
  serverSetting: { findMany: vi.fn(async () => []) },
  gameEvent: { findMany: vi.fn(async () => []) },
  $queryRaw: vi.fn(async () => []),
  era: { findFirst: vi.fn(async () => null) },
  users: {
    findUnique: vi.fn(async () => ({ id: OWNER })),
    update: vi.fn(async () => ({})),
  },
  userUnit: { upsert: vi.fn(async () => ({})) },
  bank_history: { create: vi.fn(async () => ({})) },
  recruit_history: {
    count: vi.fn(async ({ where }: any) =>
      where.source !== 'EXTERNAL' ? 999 : 0,
    ),
    create: vi.fn(async () => ({})),
  },
});
async function freshPayload() {
  const challenge = await issueAltchaChallenge(60);
  const solution = await solveChallenge({ challenge, deriveKey });
  return btoa(JSON.stringify({ challenge, solution }));
}
async function postExternal(
  tx: ReturnType<typeof transaction>,
  captchaToken?: string,
) {
  mockPrisma.$transaction.mockImplementation(async (callback: any) =>
    callback(tx),
  );
  const res = response();
  await externalHandler(
    {
      method: 'POST',
      query: { id: LINK },
      body: captchaToken === undefined ? {} : { captchaToken },
      socket: { remoteAddress: IP },
    },
    res,
  );
  return res;
}

beforeEach(() => {
  original = keys.map((key) => process.env[key]);
  for (const key of keys) delete process.env[key];
  process.env.ALTCHA_HMAC_KEY = 'synthetic-test-hmac-key-0123456789';
  resetMockPrisma();
  invalidateRuntimeConfigCache();
  used.clear();
  mockPrisma.serverSetting.findMany.mockResolvedValue([]);
  mockPrisma.recruit_history = { count: vi.fn(async () => 0) };
  mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) =>
    where.recruit_link === LINK ? { id: OWNER } : null,
  );
  mockPrisma.altchaUsedChallenge = {
    create: vi.fn(async ({ data }: any) => {
      if (used.has(data.nonce))
        throw Object.assign(new Error('dup'), { code: 'P2002' });
      used.add(data.nonce);
      return data;
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
});

afterEach(() => {
  keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  });
});

describe('external recruit link with ALTCHA', () => {
  it('offers the ALTCHA widget and nothing from Cloudflare', async () => {
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(transaction()),
    );
    const res = response();
    await externalHandler(
      { method: 'GET', query: { id: LINK }, socket: { remoteAddress: IP } },
      res,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ showCaptcha: true, captchaProvider: 'altcha' }),
    );
  });

  it('refuses a request with no payload before any reward is written', async () => {
    const tx = transaction();
    const res = await postExternal(tx);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CAPTCHA_FAILED' }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.recruit_history.create).not.toHaveBeenCalled();
  });

  it('refuses a forged payload', async () => {
    const forged = btoa(
      JSON.stringify({
        challenge: { parameters: {} },
        solution: { counter: 1, derivedKey: 'ab' },
      }),
    );
    const res = await postExternal(transaction(), forged);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rewards once for a solved payload and refuses the same payload again', async () => {
    const payload = await freshPayload();
    const first = transaction();
    const accepted = await postExternal(first, payload);
    expect(accepted.status).toHaveBeenCalledWith(200);
    expect(first.recruit_history.create).toHaveBeenCalledTimes(1);

    const second = transaction();
    const replay = await postExternal(second, payload);
    expect(replay.status).toHaveBeenCalledWith(400);
    expect(replay.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CAPTCHA_FAILED' }),
    );
    expect(second.recruit_history.create).not.toHaveBeenCalled();
  });

  it('serves ALTCHA payloads only while the provider is ALTCHA', async () => {
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'recruit.captchaProvider', value: 'turnstile' },
    ]);
    invalidateRuntimeConfigCache();
    process.env.TURNSTILE_SECRET = 'synthetic-test-secret';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ success: false })));
    const res = await postExternal(transaction(), await freshPayload());
    delete process.env.TURNSTILE_SECRET;
    fetchSpy.mockRestore();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('auto-recruit session with ALTCHA', () => {
  const session = { user: { id: 42 } };
  const tx = {
    autoRecruitSession: {
      deleteMany: vi.fn(async () => ({})),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({ id: 11 })),
    },
  };
  const start = async (body: unknown) => {
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );
    const res = response();
    await sessionHandler(
      {
        method: 'POST',
        body,
        session,
        headers: {},
        socket: { remoteAddress: IP },
      },
      res,
    );
    return res;
  };

  it('asks for a payload naming the provider, then opens one session per payload', async () => {
    const asked = await start({});
    expect(asked.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CAPTCHA_REQUIRED',
        captchaProvider: 'altcha',
      }),
    );
    const payload = await freshPayload();
    const opened = await start({ captchaToken: payload });
    expect(opened.json).toHaveBeenCalledWith({ sessionId: 11 });
    const replay = await start({ captchaToken: payload });
    expect(replay.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CAPTCHA_FAILED' }),
    );
    expect(tx.autoRecruitSession.create).toHaveBeenCalledTimes(1);
  });
});

describe('internal recruit page state', () => {
  it('tells the page which provider to render', async () => {
    mockPrisma.recruit_history = { count: vi.fn(async () => 0) };
    const res = response();
    await stateHandler(
      { method: 'GET', query: { id: LINK }, session: { user: { id: 42 } } },
      res,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        eligible: true,
        showCaptcha: true,
        captchaProvider: 'altcha',
      }),
    );
  });
});
