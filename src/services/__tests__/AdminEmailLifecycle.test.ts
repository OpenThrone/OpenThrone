import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const email = require('@/services/Email.service');
const templates = require('@/services/emailTemplates');
const runtime = require('@/services/RuntimeConfig.service');
const audit = require('@/utils/auditLogger');
const anonymization = require('@/services/AccountAnonymization.service');
const lifecycle = require('@/services/AccountInactivity.service');
const adminEmail = require('@/services/AdminEmail.service');
const broadcast = require('@/utils/broadcastPolicy');
const authorization = require('@/utils/authorization');

let originals: Record<string, unknown>;
let spies: ReturnType<typeof vi.spyOn>[];
let tx: any;
let rows: any[];
const now = new Date();
const makeNotice = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  userId: 7,
  warnedAt: new Date(now.getTime() - 180 * lifecycle.DAY_MS),
  scheduledDeletionAt: new Date(now.getTime() + 20 * lifecycle.DAY_MS),
  reminderSentAt: null,
  cancelledAt: null,
  completedAt: null,
  lastActiveAtWarning: null,
  createdByUserId: 3,
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
    create: vi.fn(async ({ data }: any) => ({
      id: 12,
      createdAt: now,
      ...data,
    })),
    update: vi.fn(async ({ data }: any) => ({
      id: 12,
      createdAt: now,
      ...data,
    })),
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

describe('inactive account selection', () => {
  it('uses the 365-day cutoff and excludes staff, grants, deleted and sanctioned accounts', () => {
    const where = lifecycle.inactiveUsersWhere(now);
    expect(where.AND).toContainEqual({
      OR: [
        {
          last_active: { lt: new Date(now.getTime() - 365 * lifecycle.DAY_MS) },
        },
        {
          last_active: null,
          created_at: { lt: new Date(now.getTime() - 365 * lifecycle.DAY_MS) },
        },
      ],
    });
    expect(where.AND).toContainEqual({
      staffRoleAssignments: { none: { revokedAt: null } },
    });
    expect(where.AND).toContainEqual({
      permissions: { none: { revokedAt: null } },
    });
    expect(JSON.stringify(where)).toContain('@deleted.local');
    expect(JSON.stringify(where)).toContain('SUSPENDED');
  });
  it('filters open notices and all un-noticed accounts', () => {
    expect(lifecycle.inactiveUsersWhere(now, 'none').AND).toContainEqual({
      accountInactivityNotice: { is: null },
    });
    expect(lifecycle.inactiveUsersWhere(now, 'warned').AND).toContainEqual({
      accountInactivityNotice: { is: { cancelledAt: null, completedAt: null } },
    });
  });
  it('upserts a 180-day notice and queues a campaign before releasing it', async () => {
    const result = await lifecycle.sendInactivityNotices({
      userIds: [7],
      actorId: 3,
      ip: 'test',
    });
    expect(result).toMatchObject({ noticed: 1, queued: 1, undeliverable: 0 });
    const data = tx.accountInactivityNotice.upsert.mock.calls[0][0];
    expect(
      data.create.scheduledDeletionAt.getTime() -
        data.create.warnedAt.getTime(),
    ).toBe(180 * lifecycle.DAY_MS);
    expect(data.update).toMatchObject({
      cancelledAt: null,
      reminderSentAt: null,
    });
    expect(tx.emailCampaign.create.mock.calls[0][0].data.kind).toBe(
      'INACTIVITY_NOTICE',
    );
    expect(tx.emailCampaign.update.mock.calls[0][0].data.status).toBe('QUEUED');
    expect(tx.emailOutbox.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.emailCampaign.update.mock.invocationCallOrder[0],
    );
    expect(audit.logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_INACTIVITY_NOTICE' }),
      tx,
    );
  });
  it('reports undeliverable users without creating deadlines', async () => {
    email.resolveEligibleRecipients.mockResolvedValue([]);
    expect(
      await lifecycle.sendInactivityNotices({ actorId: 3, ip: 'test' }),
    ).toMatchObject({
      noticed: 0,
      queued: 0,
      undeliverable: 1,
      undeliverableUserIds: [7],
    });
    expect(tx.accountInactivityNotice.upsert).not.toHaveBeenCalled();
  });
  it('rejects malformed email without writing a deadline', async () => {
    email.resolveEligibleRecipients.mockResolvedValue([
      { userId: 7, email: 'invalid', locale: 'en', display_name: 'Player' },
    ]);
    expect(
      await lifecycle.sendInactivityNotices({ actorId: 3, ip: 'test' }),
    ).toMatchObject({ noticed: 0, undeliverable: 1 });
    expect(tx.accountInactivityNotice.upsert).not.toHaveBeenCalled();
  });
  it('locks ordered pages of 250 and releases one campaign only after the final page', async () => {
    const ids = Array.from({ length: 251 }, (_, i) => i + 1);
    tx.users.findMany
      .mockResolvedValueOnce(ids.slice(0, 250).map((id) => ({ id })))
      .mockResolvedValueOnce([{ id: 251 }]);
    tx.users.findFirst.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      last_active: null,
      accountInactivityNotice: null,
    }));
    email.resolveEligibleRecipients.mockImplementation(
      async ({ userIds }: any) =>
        userIds.map((id: number) => ({
          userId: id,
          email: `player${id}@example.test`,
          locale: 'en',
          display_name: 'Player',
        })),
    );
    tx.$transaction.mockImplementation(async (callback: any, options: any) => {
      expect(options.timeout).toBe(30_000);
      expect(tx.emailCampaign.update).not.toHaveBeenCalled();
      return callback(tx);
    });
    expect(
      await lifecycle.sendInactivityNotices({ actorId: 3, ip: 'test' }),
    ).toMatchObject({ noticed: 251, queued: 251 });
    expect(tx.users.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { id: 'asc' },
      take: 250,
    });
    expect(tx.users.findMany.mock.calls[1][0].where.id.gt).toBe(250);
    expect(tx.$queryRaw.mock.calls.map((call: any[]) => call[1])).toEqual(ids);
    expect(tx.emailCampaign.create).toHaveBeenCalledTimes(1);
    expect(tx.emailCampaign.create.mock.calls[0][0].data.status).toBe('DRAFT');
    expect(
      tx.emailOutbox.createMany.mock.calls.map(
        (call: any[]) => call[0].data.length,
      ),
    ).toEqual([250, 1]);
    expect(tx.emailCampaign.update).toHaveBeenCalledTimes(1);
  });
  it('keeps the campaign draft if a later inactivity page fails', async () => {
    tx.users.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 250 }, (_, i) => ({ id: i + 1 })),
      )
      .mockRejectedValueOnce(new Error('page failed'));
    await expect(
      lifecycle.sendInactivityNotices({ actorId: 3, ip: 'test' }),
    ).rejects.toThrow('page failed');
    expect(tx.emailCampaign.update).not.toHaveBeenCalled();
  });
  it('does not restart an already open grace period', async () => {
    tx.users.findFirst.mockResolvedValue({
      id: 7,
      last_active: null,
      accountInactivityNotice: makeNotice(),
    });
    expect(
      await lifecycle.sendInactivityNotices({
        userIds: [7],
        actorId: 3,
        ip: 'test',
      }),
    ).toMatchObject({ noticed: 0 });
    expect(tx.accountInactivityNotice.upsert).not.toHaveBeenCalled();
  });
});

describe('inactivity sweep', () => {
  const stage = (notice: any) => {
    rows.push(notice);
    tx.accountInactivityNotice.findUnique.mockResolvedValue(notice);
  };
  it('cancels on return before considering deletion', async () => {
    stage(
      makeNotice({
        scheduledDeletionAt: new Date(0),
        user: { last_active: now },
      }),
    );
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { cancelled: 1, anonymized: 0 },
    );
    expect(tx.accountInactivityNotice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cancelledAt: expect.any(Date) } }),
    );
    expect(
      anonymization.AccountAnonymizationService.anonymizeAccount,
    ).not.toHaveBeenCalled();
  });
  it('sends a single reminder and uses the stored deletion deadline', async () => {
    const notice = makeNotice();
    stage(notice);
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { reminders: 1 },
    );
    expect(templates.renderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'INACTIVITY_REMINDER',
        vars: expect.objectContaining({
          deletionDate: notice.scheduledDeletionAt,
        }),
      }),
    );
    stage({ ...notice, reminderSentAt: now });
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { reminders: 0 },
    );
    expect(tx.emailCampaign.create).toHaveBeenCalledTimes(1);
  });
  it('anonymizes only due accounts that remain eligible', async () => {
    stage(
      makeNotice({
        scheduledDeletionAt: new Date(0),
        reminderSentAt: new Date(now.getTime() - 8 * lifecycle.DAY_MS),
      }),
    );
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { anonymized: 1 },
    );
    expect(
      anonymization.AccountAnonymizationService.anonymizeAccount,
    ).toHaveBeenCalledWith(tx, 7, {
      reason: 'Inactive for over 18 months',
      initiatedBy: 'INACTIVITY',
    });
    stage(
      makeNotice({
        scheduledDeletionAt: new Date(0),
        reminderSentAt: new Date(now.getTime() - 8 * lifecycle.DAY_MS),
      }),
    );
    tx.users.findFirst.mockResolvedValue(null);
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { anonymized: 0 },
    );
    expect(
      anonymization.AccountAnonymizationService.anonymizeAccount,
    ).toHaveBeenCalledTimes(1);
  });
  it('defers overdue deletion until seven days after an enqueued reminder', async () => {
    stage(makeNotice({ scheduledDeletionAt: new Date(0) }));
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { reminders: 1, anonymized: 0 },
    );
    stage(
      makeNotice({
        scheduledDeletionAt: new Date(0),
        reminderSentAt: new Date(now.getTime() - 6 * lifecycle.DAY_MS),
      }),
    );
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { reminders: 0, anonymized: 0 },
    );
    expect(
      anonymization.AccountAnonymizationService.anonymizeAccount,
    ).not.toHaveBeenCalled();
  });
  it('anonymizes on the initial deadline when reminders are disabled', async () => {
    runtime.getRuntimeConfig.mockResolvedValue({
      inactivityRemindersEnabled: false,
      inactivityAutoAnonymizeEnabled: true,
    });
    stage(makeNotice({ scheduledDeletionAt: new Date(0) }));
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { anonymized: 1, reminders: 0 },
    );
  });
  it('does not mark a reminder sent when no deliverable recipient is enqueued', async () => {
    stage(makeNotice({ scheduledDeletionAt: new Date(0) }));
    email.resolveEligibleRecipients.mockResolvedValue([]);
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { reminders: 0, anonymized: 0 },
    );
    expect(tx.accountInactivityNotice.update).not.toHaveBeenCalled();
    expect(tx.emailCampaign.create).not.toHaveBeenCalled();
    stage(makeNotice());
    email.resolveEligibleRecipients.mockResolvedValue([
      {
        userId: 7,
        email: 'player@example.test',
        locale: 'en',
        display_name: 'Player',
      },
    ]);
    tx.emailOutbox.createMany.mockResolvedValue({ count: 0 });
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { reminders: 0 },
    );
    expect(tx.accountInactivityNotice.update).not.toHaveBeenCalled();
  });
  it('makes no writes during dry runs but reports eligible counts with gates off', async () => {
    rows.push(
      makeNotice(),
      makeNotice({ id: 2, scheduledDeletionAt: new Date(0) }),
      makeNotice({ id: 3, user: { last_active: now } }),
    );
    runtime.getRuntimeConfig.mockResolvedValue({
      inactivityRemindersEnabled: false,
      inactivityAutoAnonymizeEnabled: false,
    });
    expect(await lifecycle.runInactivitySweep({ dryRun: true })).toMatchObject({
      reminders: 1,
      anonymized: 1,
      cancelled: 1,
    });
    expect(tx.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.accountInactivityNotice.update).not.toHaveBeenCalled();
    expect(tx.emailCampaign.create).not.toHaveBeenCalled();
    expect(
      anonymization.AccountAnonymizationService.anonymizeAccount,
    ).not.toHaveBeenCalled();
  });
  it('honors both runtime gates', async () => {
    runtime.getRuntimeConfig.mockResolvedValue({
      inactivityRemindersEnabled: false,
      inactivityAutoAnonymizeEnabled: false,
    });
    stage(makeNotice());
    await lifecycle.runInactivitySweep({ dryRun: false });
    stage(
      makeNotice({
        scheduledDeletionAt: new Date(0),
        reminderSentAt: new Date(now.getTime() - 8 * lifecycle.DAY_MS),
      }),
    );
    await lifecycle.runInactivitySweep({ dryRun: false });
    expect(tx.accountInactivityNotice.update).not.toHaveBeenCalled();
    expect(tx.emailCampaign.create).not.toHaveBeenCalled();
    expect(
      anonymization.AccountAnonymizationService.anonymizeAccount,
    ).not.toHaveBeenCalled();
  });
  it('continues after an anonymization failure', async () => {
    stage(
      makeNotice({
        scheduledDeletionAt: new Date(0),
        reminderSentAt: new Date(now.getTime() - 8 * lifecycle.DAY_MS),
      }),
    );
    anonymization.AccountAnonymizationService.anonymizeAccount.mockRejectedValue(
      new Error('new staff'),
    );
    expect(await lifecycle.runInactivitySweep({ dryRun: false })).toMatchObject(
      { failed: 1, anonymized: 0 },
    );
    expect(tx.accountInactivityNotice.update).not.toHaveBeenCalled();
  });
  it('cheaply cancels open notices on login and absorbs failures', async () => {
    await lifecycle.cancelInactivityOnLogin(7);
    expect(tx.accountInactivityNotice.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, cancelledAt: null, completedAt: null },
      data: { cancelledAt: expect.any(Date) },
    });
    tx.accountInactivityNotice.updateMany.mockRejectedValue(new Error('test'));
    await expect(lifecycle.cancelInactivityOnLogin(7)).resolves.toBeUndefined();
  });
});
describe('paged campaign enqueueing', () => {
  it('commits one transaction per page and keeps DRAFT until every page succeeds', async () => {
    spies.push(
      vi
        .spyOn(email, 'forEachEligibleRecipientBatch')
        .mockImplementation(
          async (
            _filter: unknown,
            size: number,
            callback: (batch: unknown[]) => Promise<void>,
          ) => {
            expect(size).toBe(250);
            for (const id of [7, 8]) {
              await callback([
                {
                  userId: id,
                  email: `player${id}@example.test`,
                  locale: 'en',
                  display_name: 'Player',
                },
              ]);
              expect(tx.emailCampaign.update).not.toHaveBeenCalled();
            }
          },
        ),
    );
    const result = await adminEmail.createQueuedCampaign(mockPrisma, {
      kind: 'BROADCAST',
      subject: 's',
      body: 'b',
      audience: { includeAll: true },
      recipientFilter: { category: 'ANNOUNCEMENT', includeAll: true },
    });
    expect(tx.emailCampaign.create.mock.calls[0][0].data.status).toBe('DRAFT');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.emailOutbox.createMany).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: 'QUEUED', recipientCount: 2 });
  });
  it('does not release a partially enqueued campaign after a page failure', async () => {
    spies.push(
      vi
        .spyOn(email, 'forEachEligibleRecipientBatch')
        .mockImplementation(
          async (
            _filter: unknown,
            _size: number,
            callback: (batch: unknown[]) => Promise<void>,
          ) => {
            await callback([
              {
                userId: 7,
                email: 'player@example.test',
                locale: 'en',
                display_name: 'Player',
              },
            ]);
            throw new Error('page failed');
          },
        ),
    );
    await expect(
      adminEmail.createQueuedCampaign(mockPrisma, {
        kind: 'BROADCAST',
        subject: 's',
        body: 'b',
        audience: { includeAll: true },
        recipientFilter: { category: 'ANNOUNCEMENT', includeAll: true },
      }),
    ).rejects.toThrow('page failed');
    expect(tx.emailOutbox.createMany).toHaveBeenCalledTimes(1);
    expect(tx.emailCampaign.update).not.toHaveBeenCalled();
  });
});

describe('broadcast permissions and news idempotency', () => {
  it('requires administrator for email-to-all, including BOTH', () => {
    for (const channel of ['EMAIL', 'BOTH'])
      expect(
        broadcast.requiresAdministratorForBroadcast(
          broadcast.BroadcastSchema.parse({
            subject: 's',
            body: 'b',
            sendToAll: true,
            channel,
          }),
        ),
      ).toBe(true);
    for (const channel of ['EMAIL', 'BOTH'])
      expect(
        broadcast.requiresAdministratorForBroadcast(
          broadcast.BroadcastSchema.parse({
            subject: 's',
            body: 'b',
            activeWithinDays: 30,
            recipientUserIds: [7],
            channel,
          }),
        ),
      ).toBe(true);
    expect(
      broadcast.requiresAdministratorForBroadcast(
        broadcast.BroadcastSchema.parse({
          subject: 's',
          body: 'b',
          sendToAll: true,
        }),
      ),
    ).toBe(false);
    expect(
      broadcast.requiresAdministratorForBroadcast(
        broadcast.BroadcastSchema.parse({
          subject: 's',
          body: 'b',
          recipientUserIds: [7],
          channel: 'EMAIL',
        }),
      ),
    ).toBe(false);
  });
  it('refuses email-to-all before looking up any recipients', async () => {
    spies.push(vi.spyOn(authorization, 'isAdmin').mockResolvedValue(false));
    expect(
      await broadcast.canSendBroadcast(
        3,
        broadcast.BroadcastSchema.parse({
          subject: 's',
          body: 'b',
          sendToAll: true,
          channel: 'EMAIL',
        }),
      ),
    ).toBe(false);
    expect(email.resolveEligibleRecipients).not.toHaveBeenCalled();
  });
  it('creates NEWS once and returns the existing campaign on republish', async () => {
    const post = {
      id: 9,
      title: 'News',
      excerpt: 'Excerpt',
      content: 'Content',
    };
    const recipients = await email.resolveEligibleRecipients({
      category: 'NEWS',
      includeAll: true,
    });
    tx.emailCampaign.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 12, createdAt: now });
    const first = await adminEmail.queueNewsEmail(tx, post, 3, recipients);
    expect(first.alreadySent).toBe(false);
    tx.emailCampaign.findUnique.mockResolvedValue(first.campaign);
    const second = await adminEmail.queueNewsEmail(tx, post, 3, recipients);
    expect(second.alreadySent).toBe(true);
    expect(tx.emailCampaign.createMany).toHaveBeenCalledTimes(1);
    expect(tx.emailOutbox.createMany).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('treats a conflicting NEWS campaign insert as already sent', async () => {
    tx.emailCampaign.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 12, createdAt: now });
    tx.emailCampaign.createMany.mockResolvedValue({ count: 0 });
    expect(
      (
        await adminEmail.queueNewsEmail(
          tx,
          { id: 9, title: 'News', excerpt: null, content: '' },
          3,
          [],
        )
      ).alreadySent,
    ).toBe(true);
    expect(tx.emailOutbox.createMany).not.toHaveBeenCalled();
    expect(tx.emailCampaign.update).not.toHaveBeenCalled();
  });
});

describe('admin email translations', () => {
  it('provides every dynamic filter, channel, audience, kind and status in all locales', () => {
    const values = {
      filters: ['none', 'warned', 'cancelled', 'completed'],
      channels: ['IN_GAME', 'EMAIL', 'BOTH'],
      audiences: ['specific', 'all', 'active'],
      kinds: ['BROADCAST', 'NEWS', 'INACTIVITY_NOTICE', 'INACTIVITY_REMINDER'],
      statuses: ['DRAFT', 'QUEUED', 'SENDING', 'COMPLETED', 'CANCELLED'],
    };
    for (const translations of [
      require('../../../public/locales/en/admin-content.json').emailAdmin,
      require('../../../public/locales/es/admin-content.json').emailAdmin,
      require('../../../public/locales/de/admin-content.json').emailAdmin,
    ]) {
      for (const [group, keys] of Object.entries(values))
        for (const key of keys) expect(translations[group][key]).toBeTruthy();
      for (const key of ['noDeliverableEmail', 'confirmNewsEmail', 'cancel'])
        expect(translations[key]).toBeTruthy();
    }
  });
});
