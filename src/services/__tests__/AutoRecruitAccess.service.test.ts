import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
// Dynamic imports deliberately install the Prisma test boundary before service loading.
const { canAutoRecruit } = await import('../AutoRecruitAccess.service');
const { invalidateRuntimeConfigCache } =
  await import('../RuntimeConfig.service');

const DAY = 86_400_000;
const USER_ID = 42;

describe('canAutoRecruit supporter gate', () => {
  let membership: { status: string; currentPeriodEnd: Date | null } | null;
  let membershipLookup: ReturnType<typeof vi.fn>;

  const setSupporterFeature = (enabled: boolean) => {
    mockPrisma.serverSetting.findMany = vi.fn(async () => [
      { key: 'ENABLE_SUPPORTER', value: enabled },
    ]);
    invalidateRuntimeConfigCache();
  };

  beforeEach(() => {
    membership = {
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 10 * DAY),
    };
    membershipLookup = vi.fn(async () => membership);
    mockPrisma.supporterMembership = { findUnique: membershipLookup };
    setSupporterFeature(true);
  });

  it('allows an active supporter while the supporter feature is on', async () => {
    expect(await canAutoRecruit(USER_ID)).toBe(true);
    expect(membershipLookup).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
  });

  it('accepts a numeric string id', async () => {
    expect(await canAutoRecruit(String(USER_ID))).toBe(true);
  });

  it('refuses a player with no membership', async () => {
    membership = null;
    expect(await canAutoRecruit(USER_ID)).toBe(false);
  });

  it('refuses a supporter whose period has ended', async () => {
    membership = {
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() - DAY),
    };
    expect(await canAutoRecruit(USER_ID)).toBe(false);
  });

  it('refuses an expired-status membership even with time left', async () => {
    membership = {
      status: 'EXPIRED',
      currentPeriodEnd: new Date(Date.now() + 10 * DAY),
    };
    expect(await canAutoRecruit(USER_ID)).toBe(false);
  });

  it('refuses even an active supporter while the supporter feature is off', async () => {
    setSupporterFeature(false);
    expect(await canAutoRecruit(USER_ID)).toBe(false);
    expect(membershipLookup).not.toHaveBeenCalled();
  });

  it.each([[0], [-3], [1.5], ['abc'], [null], [undefined], [NaN]])(
    'refuses the invalid user id %p without a membership lookup',
    async (id) => {
      expect(await canAutoRecruit(id)).toBe(false);
      expect(membershipLookup).not.toHaveBeenCalled();
    },
  );
});
