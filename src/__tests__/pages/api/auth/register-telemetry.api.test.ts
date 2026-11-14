import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
  vi,
} from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

import { AuthService } from '@/services';

installMockPrisma(vi);
vi.mock('@/middleware/cors', () => ({
  withCors: (handler: unknown) => handler,
}));
vi.mock('@/services/RuntimeConfig.service', () => ({
  getRuntimeConfig: vi.fn(async () => ({
    disableRegistration: false,
    maintenance: { enabled: false },
  })),
}));
silenceLogger();

const registerUser = vi.fn();
spyOn(AuthService, 'registerUser').mockImplementation((...args: unknown[]) =>
  registerUser(...args),
);

const handler = require('../../../../pages/api/auth/register/route').default;

const makeReq = (headers: Record<string, string> = {}) =>
  ({
    method: 'POST',
    headers,
    socket: { remoteAddress: '203.0.113.10' },
    body: {
      email: 'new-player@example.com',
      password: 'synthetic-password-123',
      display_name: 'NewPlayer',
      race: 'HUMAN',
      class: 'FIGHTER',
      acceptTerms: true,
    },
  }) as any;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('registration telemetry', () => {
  beforeEach(() => {
    registerUser.mockReset();
    mockPrisma.loginEvent = { create: vi.fn(async () => ({})) };
  });

  afterEach(() => {
    delete process.env.DISABLE_TURNSTILE;
  });

  it('records a SIGN_UP event with the same salted hashes as a sign-in', async () => {
    registerUser.mockResolvedValue({ id: 501, display_name: 'NewPlayer' });

    const res = makeRes();
    await handler(makeReq({ 'user-agent': 'Synthetic Browser/1.0' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(registerUser).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '203.0.113.10' }),
    );
    expect(mockPrisma.loginEvent.create).toHaveBeenCalledTimes(1);
    const stored = mockPrisma.loginEvent.create.mock.calls[0][0].data;
    expect(stored.kind).toBe('SIGN_UP');
    expect(stored.userId).toBe(501);
    expect(stored.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.ipPrefixHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.userAgentHash).toMatch(/^[a-f0-9]{64}$/);
    // No raw values anywhere in the row.
    expect(JSON.stringify(stored)).not.toContain('203.0.113.10');
    expect(JSON.stringify(stored)).not.toContain('Synthetic Browser');
  });

  it('registration still succeeds when telemetry cannot be written', async () => {
    registerUser.mockResolvedValue({ id: 502, display_name: 'NewPlayer2' });
    mockPrisma.loginEvent.create = vi.fn(async () => {
      throw new Error('database unavailable');
    });

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 502 }));
  });
});
