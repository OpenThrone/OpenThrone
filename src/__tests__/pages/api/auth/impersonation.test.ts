import { describe, expect, it, vi } from 'bun:test';
import { installMockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
vi.mock('@/utils/auditLogger', () => ({
  logActionStrict: vi.fn(async () => undefined),
  logAction: vi.fn(),
  getRequestIp: () => 'unused',
}));
silenceLogger();

const {
  authOptions,
  createAuthOptions,
  isImpersonationExpired,
} = require('../../../../pages/api/auth/[...nextauth]');
const {
  createImpersonationTicket,
  consumeImpersonationTicket,
  IMPERSONATION_MAX_MS,
} = require('../../../../lib/impersonationTickets');

const { authorize } = createAuthOptions({ clientIp: '203.0.113.9' })
  .providers[0].options;
const { jwt } = authOptions.callbacks;

describe('impersonation limits (#92)', () => {
  it('lasts ten minutes', () => {
    expect(IMPERSONATION_MAX_MS).toBe(10 * 60_000);
  });

  it('stamps an expiry on impersonated sign-ins only', async () => {
    const before = Date.now();
    const impersonated = await jwt({
      token: {},
      user: { id: 5, impersonatedBy: 1 },
    });
    expect(impersonated.user.impersonationExpiresAt).toBeGreaterThanOrEqual(
      before + IMPERSONATION_MAX_MS,
    );
    const normal = await jwt({ token: {}, user: { id: 5 } });
    expect(normal.user.impersonationExpiresAt).toBeUndefined();
  });

  it('signs out an impersonated session once the limit passes', async () => {
    await expect(
      jwt({
        token: {
          user: {
            id: 5,
            impersonatedBy: 1,
            impersonationExpiresAt: Date.now() - 1,
          },
        },
      }),
    ).rejects.toThrow('Impersonation has expired');
  });

  it('treats impersonated sessions without a limit as expired', () => {
    expect(isImpersonationExpired({ id: 5, impersonatedBy: 1 })).toBe(true);
    expect(
      isImpersonationExpired({
        id: 5,
        impersonatedBy: 1,
        impersonationExpiresAt: Date.now() + 60_000,
      }),
    ).toBe(false);
    expect(isImpersonationExpired({ id: 5 })).toBe(false);
  });
});

describe('impersonation tickets (#92)', () => {
  it('records the ticket kind and is single-use', () => {
    const ticket = createImpersonationTicket(1, 5, 'return');
    expect(consumeImpersonationTicket(ticket)).toMatchObject({
      adminUserId: 1,
      targetUserId: 5,
      kind: 'return',
    });
    expect(consumeImpersonationTicket(ticket)).toBeNull();
  });

  it('refuses a start ticket used to return, and a return ticket used to start', async () => {
    await expect(
      authorize(
        {
          returnToAdmin: 'true',
          impersonationTicket: createImpersonationTicket(1, 5, 'start'),
        },
        { headers: {} },
      ),
    ).rejects.toThrow('Unauthorized impersonation request');
    await expect(
      authorize(
        {
          impersonateUserId: '5',
          impersonationTicket: createImpersonationTicket(1, 5, 'return'),
        },
        { headers: {} },
      ),
    ).rejects.toThrow('Unauthorized impersonation request');
  });

  it('refuses a return without a ticket or with an unknown one', async () => {
    await expect(
      authorize({ returnToAdmin: 'true' }, { headers: {} }),
    ).rejects.toThrow();
    await expect(
      authorize(
        { returnToAdmin: 'true', impersonationTicket: 'not-a-ticket' },
        { headers: {} },
      ),
    ).rejects.toThrow('Unauthorized impersonation request');
  });
});
