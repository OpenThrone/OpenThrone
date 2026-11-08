import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);

const captcha = { required: true };
vi.mock('@/services/RecruitmentCaptcha.service', () => ({
  verifyRecruitmentCaptcha: vi.fn(
    async (token: unknown) => token === 'valid-token',
  ),
  isRecruitmentCaptchaRequired: () => captcha.required,
}));
vi.mock('@/services/AutoRecruitAccess.service', () => ({
  AUTO_RECRUIT_DISABLED: { error: 'disabled' },
  canAutoRecruit: async () => true,
}));
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
silenceLogger();

const handler = require('../../../../pages/api/recruit/startSession').default;

// Synthetic recruiter; not a real player.
const session = { user: { id: 42 } };

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const tx = {
  autoRecruitSession: {
    deleteMany: vi.fn(async () => ({})),
    count: vi.fn(async () => 0),
    create: vi.fn(async () => ({ id: 11 })),
  },
};

const run = async (body: any) => {
  const res = makeRes();
  await handler(
    { method: 'POST', body, session, headers: {}, socket: {} },
    res,
  );
  return res;
};

describe('startSession captcha', () => {
  beforeEach(() => {
    resetMockPrisma();
    captcha.required = true;
    tx.autoRecruitSession.create.mockClear();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
  });

  it('asks for verification before opening a session', async () => {
    const res = await run({});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CAPTCHA_REQUIRED' }),
    );
    expect(tx.autoRecruitSession.create).not.toHaveBeenCalled();
  });

  it('refuses a failed verification', async () => {
    const res = await run({ captchaToken: 'bad-token' });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CAPTCHA_FAILED' }),
    );
    expect(tx.autoRecruitSession.create).not.toHaveBeenCalled();
  });

  it('opens a session after one successful verification', async () => {
    const res = await run({ captchaToken: 'valid-token' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sessionId: 11 });
  });

  it('opens a session without a token when captcha is off', async () => {
    captcha.required = false;
    const res = await run({});
    expect(res.json).toHaveBeenCalledWith({ sessionId: 11 });
  });
});
