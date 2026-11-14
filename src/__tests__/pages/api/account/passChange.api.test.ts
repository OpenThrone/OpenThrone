import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';

installMockPrisma(vi);

const services = require('@/services');
const handler = require('../../../../pages/api/account/passChange').default;

const body = {
  email: 'player@example.com',
  verify: 'code-from-email',
  newPassword: 'a-new-password',
};

const makeRes = () => {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    getHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('password reset with a code answers caller errors as 4xx', () => {
  let reset: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMockPrisma();
    installRateLimitStore(mockPrisma, vi);
    reset = vi.spyOn(services.AccountService, 'resetPasswordWithCode');
  });
  afterEach(() => reset.mockRestore());

  it.each(['Invalid verification code', 'User not found'])(
    '%s is a 400 with the same text as verify',
    async (message) => {
      reset.mockRejectedValue(new Error(message));
      const res = makeRes();
      await handler({ method: 'POST', headers: {}, body }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'Invalid or expired verification code',
      });
    },
  );

  it('the attempt limit is a 429', async () => {
    reset.mockRejectedValue(
      new Error('Too many verification attempts. Request a new code.'),
    );
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body }, res);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('an unexpected fault is still a 500', async () => {
    reset.mockRejectedValue(new Error('connection reset'));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('a valid reset returns the service result', async () => {
    reset.mockResolvedValue({ status: true, passwordChanged: true });
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body }, res);
    expect(res.json).toHaveBeenCalledWith({
      status: true,
      passwordChanged: true,
    });
  });
});
