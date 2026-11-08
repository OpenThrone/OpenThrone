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

  it('lets preview and test renders skip the audience but not a send', () => {
    for (const action of ['preview', 'test'])
      expect(
        InactiveNoticeBody.safeParse({
          action,
          template: 'ERA_RELAUNCH',
          newsPostId: 7,
          deletionDate: '2026-12-31',
        }).success,
      ).toBe(true);
    expect(InactiveNoticeBody.safeParse({ action: 'send' }).success).toBe(
      false,
    );
    expect(
      InactiveNoticeBody.safeParse({ action: 'preview', locale: 'fr' }).success,
    ).toBe(false);
  });

  it('accepts only a plain YYYY-MM-DD purge date', () => {
    expect(
      InactiveNoticeBody.safeParse({ all: true, deletionDate: '2026-12-31' })
        .success,
    ).toBe(true);
    expect(
      InactiveNoticeBody.safeParse({
        all: true,
        deletionDate: '2026-12-31T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});
