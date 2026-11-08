import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const email = require('@/services/Email.service');
const templates = require('@/services/emailTemplates');
const runtime = require('@/services/RuntimeConfig.service');
const audit = require('@/utils/auditLogger');
const anonymization = require('@/services/AccountAnonymization.service');
const lifecycle = require('@/services/AccountInactivity.service');

let originals: Record<string, unknown>;
let spies: ReturnType<typeof vi.spyOn>[];
let tx: any;
let rows: any[];
const now = new Date();
const RELAUNCH = new Date('2026-10-01T00:00:00.000Z');
const makeNotice = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  userId: 7,
  warnedAt: new Date(now.getTime() - 30 * lifecycle.DAY_MS),
  scheduledDeletionAt: new Date(now.getTime() + 20 * lifecycle.DAY_MS),
  reminderSentAt: null,
  cancelledAt: null,
  completedAt: null,
  lastActiveAtWarning: null,
  createdByUserId: 3,
  inactiveSince: null,
  template: 'STANDARD',
  newsPostId: null,
  user: { last_active: null },
  ...extra,
});
beforeEach(() => {
  originals = Object.fromEntries(Object.entries(mockPrisma));
  spies = [];
  rows = [];
  spies.push(
    vi.spyOn(email, 'resolveEligibleRecipients').mockResolvedValue([
      {
        userId: 7,
        email: 'player@example.test',
        locale: 'en',
        display_name: 'Player',
      },
    ]),
  );
  spies.push(
    vi.spyOn(templates, 'renderEmail').mockReturnValue({
      subject: 'Rendered',
      text: 'Text',
      html: '<p>Text</p>',
    }),
  );
  spies.push(
    vi.spyOn(runtime, 'getRuntimeConfig').mockResolvedValue({
      inactivityRemindersEnabled: true,
      inactivityAutoAnonymizeEnabled: true,
    }),
  );
  spies.push(vi.spyOn(audit, 'logActionStrict').mockResolvedValue(undefined));
  spies.push(
    vi
      .spyOn(anonymization.AccountAnonymizationService, 'anonymizeAccount')
      .mockResolvedValue({ pseudonym: 'New_Name_12345' }),
  );
  mockPrisma.users = {
    findMany: vi.fn().mockResolvedValue([{ id: 7 }]),
    findFirst: vi.fn().mockResolvedValue({
      id: 7,
      last_active: null,
      accountInactivityNotice: null,
    }),
  };
  mockPrisma.accountInactivityNotice = {
    findMany: vi.fn(async () => rows.splice(0, 250)),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  mockPrisma.emailCampaign = {
    findUnique: vi.fn().mockResolvedValue(null),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi.fn(async ({ data }: any) => ({ id: 12, ...data })),
    update: vi.fn(async ({ data }: any) => ({ id: 12, ...data })),
  };
  mockPrisma.emailOutbox = {
    createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
  };
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  tx = mockPrisma;
  mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
});
afterEach(() => {
  for (const spy of spies.reverse()) spy.mockRestore();
  for (const key of Object.keys(mockPrisma))
    if (!(key in originals)) delete mockPrisma[key];
  Object.assign(mockPrisma, originals);
});

describe('inactiveUsersWhere with a fixed cutoff', () => {
  it('selects by the latest of gameplay, login and creation before the cutoff', () => {
    const where = lifecycle.inactiveUsersWhere(now, undefined, {
      inactiveSince: RELAUNCH,
    });
    expect(where.AND).toContainEqual({
      OR: [
        { last_gameplay_at: { lt: RELAUNCH } },
        { last_gameplay_at: null, last_active: { lt: RELAUNCH } },
        {
          last_gameplay_at: null,
          last_active: null,
          created_at: { lt: RELAUNCH },
        },
      ],
    });
    // A relaunch wave is for people, never bot accounts.
    expect(where.AND).toContainEqual({ isBot: false });
    // The staff/grant/sanction guards still apply.
    expect(JSON.stringify(where)).toContain('staffRoleAssignments');
    expect(JSON.stringify(where)).toContain('SUSPENDED');
  });

  it('keeps the legacy 365-day rule and no bot filter without a cutoff', () => {
    const where = lifecycle.inactiveUsersWhere(now);
    expect(JSON.stringify(where)).not.toContain('last_gameplay_at');
    expect(JSON.stringify(where)).not.toContain('isBot');
    expect(where.AND).toContainEqual({
      OR: [
        {
          last_active: { lt: new Date(now.getTime() - 365 * lifecycle.DAY_MS) },
        },
        {
          last_active: null,
          created_at: {
            lt: new Date(now.getTime() - 365 * lifecycle.DAY_MS),
          },
        },
      ],
    });
  });
});

describe('reminder window for short notice periods', () => {
  const noticeDays = (warnedAgoDays: number, spanDays: number) =>
    makeNotice({
      warnedAt: new Date(now.getTime() - warnedAgoDays * lifecycle.DAY_MS),
      scheduledDeletionAt: new Date(
        now.getTime() + (spanDays - warnedAgoDays) * lifecycle.DAY_MS,
      ),
    });

  it('reminds when half the short notice period remains', () => {
    // 14-day relaunch notice issued now: window is min(30, 7) = 7 days.
    const notice = makeNotice({
      warnedAt: now,
      scheduledDeletionAt: new Date(now.getTime() + 14 * lifecycle.DAY_MS),
    });
    // Eight days before the deadline: outside the 7-day window.
    expect(
      lifecycle.inactivityDecision(
        notice,
        null,
        new Date(now.getTime() + 6 * lifecycle.DAY_MS),
      ),
    ).toBe('skip');
    // Six days before the deadline: inside it.
    expect(
      lifecycle.inactivityDecision(
        notice,
        null,
        new Date(now.getTime() + 8 * lifecycle.DAY_MS),
      ),
    ).toBe('remind');
  });

  it('still uses the 30-day cap for the standard 180-day notice', () => {
    // 180-day notice issued 160 days ago: 20 days left, window 30 days.
    const notice = noticeDays(160, 180);
    expect(lifecycle.inactivityDecision(notice, null, now)).toBe('remind');
    // 40 days left is outside the window.
    const early = noticeDays(140, 180);
    expect(lifecycle.inactivityDecision(early, null, now)).toBe('skip');
  });

  it('waits seven days after the reminder before anonymizing', () => {
    const overdue = makeNotice({
      scheduledDeletionAt: new Date(0),
      reminderSentAt: new Date(now.getTime() - 6 * lifecycle.DAY_MS),
    });
    expect(lifecycle.inactivityDecision(overdue, null, now)).toBe('skip');
    overdue.reminderSentAt = new Date(now.getTime() - 7 * lifecycle.DAY_MS);
    expect(lifecycle.inactivityDecision(overdue, null, now)).toBe('anonymize');
  });
});

describe('relaunch notices and the sweep', () => {
  it('stores the cutoff, deadline, template and news post on the notice and campaign', async () => {
    await lifecycle.sendInactivityNotices({
      userIds: [7],
      actorId: 3,
      ip: 'test',
      inactiveSince: RELAUNCH,
      noticeDays: 14,
      template: 'ERA_RELAUNCH',
      newsPostId: 7,
    });
    const data = tx.accountInactivityNotice.upsert.mock.calls[0][0];
    expect(data.create.inactiveSince).toBe(RELAUNCH);
    expect(data.create.template).toBe('ERA_RELAUNCH');
    expect(data.create.newsPostId).toBe(7);
    expect(
      data.create.scheduledDeletionAt.getTime() -
        data.create.warnedAt.getTime(),
    ).toBe(14 * lifecycle.DAY_MS);
    // Campaign vars reach the renderer through enqueue, not the campaign row.
    expect(templates.renderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'INACTIVITY_NOTICE',
        vars: expect.objectContaining({ relaunch: true, newsId: 7 }),
      }),
    );
    expect(audit.logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_INACTIVITY_NOTICE',
        details: expect.objectContaining({
          inactiveSince: RELAUNCH.toISOString(),
          noticeDays: 14,
          template: 'ERA_RELAUNCH',
          newsPostId: 7,
        }),
      }),
      tx,
    );
  });

  it('gives each recipient a one-click erasure link bound to their notice', async () => {
    const {
      verifyInactivityErasureToken,
    } = require('@/utils/inactivityErasureToken');
    await lifecycle.sendInactivityNotices({
      userIds: [7],
      actorId: 3,
      ip: 'test',
      inactiveSince: RELAUNCH,
      template: 'ERA_RELAUNCH',
      newsPostId: 7,
    });
    const notice = tx.accountInactivityNotice.upsert.mock.calls[0][0].create;
    const call = templates.renderEmail.mock.calls.find(
      (c: any[]) => c[0].kind === 'INACTIVITY_NOTICE',
    );
    expect(verifyInactivityErasureToken(call[0].vars.erasureToken)).toEqual({
      userId: 7,
      warnedAt: notice.warnedAt.getTime(),
    });
  });

  it('keeps the standard defaults when no relaunch options are given', async () => {
    await lifecycle.sendInactivityNotices({
      userIds: [7],
      actorId: 3,
      ip: 'test',
    });
    const data = tx.accountInactivityNotice.upsert.mock.calls[0][0];
    expect(data.create.inactiveSince).toBeNull();
    expect(data.create.template).toBe('STANDARD');
    expect(data.create.newsPostId).toBeNull();
    expect(
      data.create.scheduledDeletionAt.getTime() -
        data.create.warnedAt.getTime(),
    ).toBe(180 * lifecycle.DAY_MS);
    expect(templates.renderEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({
        vars: expect.objectContaining({ relaunch: true }),
      }),
    );
  });

  it('re-checks eligibility with the notice cutoff, not the 365-day rule', async () => {
    // Freshly inactive under the relaunch cutoff: eligible only via the
    // notice's stored inactiveSince (the legacy rule would skip it).
    rows.push(
      makeNotice({
        scheduledDeletionAt: new Date(0),
        reminderSentAt: new Date(now.getTime() - 8 * lifecycle.DAY_MS),
        inactiveSince: RELAUNCH,
      }),
    );
    tx.accountInactivityNotice.findUnique.mockResolvedValue(rows[0]);
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { anonymized: 1 },
    );
    const eligibilityWhere = tx.users.findFirst.mock.calls.find(
      (call: any[]) => call[0].where?.id === 7,
    )?.[0].where;
    // The activity clause is the first AND entry; it must use the cutoff.
    const activity = eligibilityWhere.AND.find((clause: any) => clause.OR).OR;
    expect(
      activity.some((clause: any) => clause.last_gameplay_at?.lt === RELAUNCH),
    ).toBe(true);
    expect(
      activity.some((clause: any) => clause.last_active?.lt === RELAUNCH),
    ).toBe(true);
    expect(
      activity.some((clause: any) => clause.created_at?.lt === RELAUNCH),
    ).toBe(true);
    expect(
      anonymization.AccountAnonymizationService.anonymizeAccount,
    ).toHaveBeenCalledWith(tx, 7, {
      reason: 'Inactive past the relaunch notice deadline',
      initiatedBy: 'INACTIVITY',
    });
  });

  it('never reminds a relaunch notice: it erases on the purge date', async () => {
    // The relaunch email promises to be the last one, even with reminders on.
    const relaunch = makeNotice({
      inactiveSince: RELAUNCH,
      template: 'ERA_RELAUNCH',
      newsPostId: 7,
      warnedAt: new Date(now.getTime() - 40 * lifecycle.DAY_MS),
      scheduledDeletionAt: new Date(now.getTime() + 5 * lifecycle.DAY_MS),
    });
    expect(lifecycle.inactivityDecision(relaunch, null, now, true)).toBe(
      'skip',
    );
    const due = { ...relaunch, scheduledDeletionAt: new Date(0) };
    expect(lifecycle.inactivityDecision(due, null, now, true)).toBe(
      'anonymize',
    );
    rows.push(due);
    tx.accountInactivityNotice.findUnique.mockResolvedValue(rows[0]);
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { reminders: 0, anonymized: 1 },
    );
    expect(templates.renderEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'INACTIVITY_REMINDER' }),
    );
  });

  it('uses an explicit purge date instead of the notice period', async () => {
    const purge = new Date(now.getTime() + 53 * lifecycle.DAY_MS);
    await lifecycle.sendInactivityNotices({
      userIds: [7],
      actorId: 3,
      ip: 'test',
      inactiveSince: RELAUNCH,
      noticeDays: 180,
      deletionDate: purge,
      template: 'ERA_RELAUNCH',
      newsPostId: 7,
    });
    const data = tx.accountInactivityNotice.upsert.mock.calls[0][0];
    expect(data.create.scheduledDeletionAt).toBe(purge);
    expect(templates.renderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        vars: expect.objectContaining({ deletionDate: purge }),
      }),
    );
  });
});

describe('parsePurgeDate', () => {
  const today = new Date('2026-11-08T12:00:00.000Z');
  it('reads a calendar day as midnight UTC within 14–365 days', () => {
    expect(lifecycle.parsePurgeDate('2026-12-31', today)?.toISOString()).toBe(
      '2026-12-31T00:00:00.000Z',
    );
  });
  it('refuses dates too soon, too late or not real', () => {
    expect(lifecycle.parsePurgeDate('2026-11-15', today)).toBeNull();
    expect(lifecycle.parsePurgeDate('2027-12-31', today)).toBeNull();
    expect(lifecycle.parsePurgeDate('2026-02-30', today)).toBeNull();
    expect(lifecycle.parsePurgeDate('31/12/2026', today)).toBeNull();
  });
});
