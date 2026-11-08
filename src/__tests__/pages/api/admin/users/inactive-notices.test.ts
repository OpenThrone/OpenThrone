import { describe, expect, it, vi } from 'bun:test';
import { installMockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);

const { InactiveNoticeBody } =
  await import('@/pages/api/admin/users/inactive-notices');

describe('inactive-notices body', () => {
  it('refuses the relaunch template without a news post', () => {
    const result = InactiveNoticeBody.safeParse({
      all: true,
      template: 'ERA_RELAUNCH',
    });
    expect(result.success).toBe(false);
  });

  it('accepts the relaunch template with a news post and a cutoff', () => {
    const result = InactiveNoticeBody.safeParse({
      all: true,
      template: 'ERA_RELAUNCH',
      newsPostId: 7,
      inactiveSince: '2026-10-01T00:00:00Z',
      noticeDays: 30,
    });
    expect(result.success).toBe(true);
  });

  it('keeps the standard template valid without a news post', () => {
    expect(InactiveNoticeBody.safeParse({ all: true }).success).toBe(true);
  });

  it('refuses a notice period shorter than 14 days', () => {
    expect(
      InactiveNoticeBody.safeParse({ all: true, noticeDays: 7 }).success,
    ).toBe(false);
  });
});
