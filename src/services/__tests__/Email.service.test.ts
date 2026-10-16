import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import nodemailer from 'nodemailer';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const userService = require('@/services/User.service');

const transportConstructionSpy = vi.spyOn(nodemailer, 'createTransport');
const service = require('@/services/Email.service');

const transportsAtImport = transportConstructionSpy.mock.calls.length;
transportConstructionSpy.mockRestore();

const user = (id: number, extra = {}) => ({
  id,
  email: `player${id}@example.test`,
  locale: 'en-US',
  display_name: `Player ${id}`,
  emailPreference: null,
  ...extra,
});
let statusSpy: ReturnType<typeof vi.spyOn>;
let sendSpy: ReturnType<typeof vi.spyOn>;
let envRoot: string | undefined;
let claimed: any[];
let tx: any;

beforeEach(() => {
  envRoot = process.env.NEXT_PUBLIC_URL_ROOT;
  process.env.NEXT_PUBLIC_URL_ROOT = 'https://example.test';
  statusSpy = vi
    .spyOn(userService, 'getLoginBlockingStatuses')
    .mockResolvedValue(new Map());
  sendSpy = vi
    .spyOn(
      Object.getPrototypeOf(
        nodemailer.createTransport({ jsonTransport: true }),
      ),
      'sendMail',
    )
    .mockResolvedValue({ messageId: 'test' });
  claimed = [];
  mockPrisma.users.findMany = vi
    .fn()
    .mockResolvedValueOnce([user(1)])
    .mockResolvedValue([]);
  mockPrisma.emailSuppression = { findMany: vi.fn().mockResolvedValue([]) };
  mockPrisma.emailOutbox = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  };
  mockPrisma.emailCampaign = { update: vi.fn(), updateMany: vi.fn() };
  tx = {
    ...mockPrisma,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) =>
      strings.join('').includes('UPDATE "EmailOutbox"')
        ? claimed.splice(0, 1)
        : [],
    ),
  };
  mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
});
afterEach(() => {
  statusSpy.mockRestore();
  sendSpy.mockRestore();
  if (envRoot === undefined) delete process.env.NEXT_PUBLIC_URL_ROOT;
  else process.env.NEXT_PUBLIC_URL_ROOT = envRoot;
});
const row = (extra = {}) => ({
  id: 9,
  campaignId: 3,
  userId: 1,
  toAddress: 'player1@example.test',
  category: 'NEWS',
  subject: 'Hello',
  textBody: 'Body',
  htmlBody: null,
  attempts: 1,
  ...extra,
});

describe('email recipient policy', () => {
  it('requires an explicit audience and uses ordered bounded queries', async () => {
    expect(
      await service.resolveEligibleRecipients({ category: 'NEWS' }),
    ).toEqual([]);
    expect(mockPrisma.users.findMany).not.toHaveBeenCalled();
    expect(
      await service.resolveEligibleRecipients({
        category: 'NEWS',
        includeAll: true,
      }),
    ).toHaveLength(1);
    expect(mockPrisma.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' }, take: 250 }),
    );
  });
  it('excludes anonymized, suppressed, opted-out and currently sanctioned marketing recipients', async () => {
    const { hashIdentity } = require('@/utils/identityHash');
    mockPrisma.users.findMany
      .mockReset()
      .mockResolvedValueOnce([
        user(1),
        user(2, { email: 'gone@deleted.local' }),
        user(3),
        user(4, { emailPreference: { newsEmails: false } }),
        user(5, { emailPreference: { unsubscribedAllAt: new Date() } }),
        user(6),
        user(7),
        user(8),
      ])
      .mockResolvedValue([]);
    mockPrisma.emailSuppression.findMany.mockResolvedValue([
      { hash: hashIdentity('EMAIL', 'player3@example.test') },
    ]);
    statusSpy.mockResolvedValue(
      new Map([
        [6, 'BANNED'],
        [7, 'SUSPENDED'],
        [8, 'CLOSED'],
      ]),
    );
    expect(
      await service.resolveEligibleRecipients({
        category: 'NEWS',
        includeAll: true,
      }),
    ).toEqual([expect.objectContaining({ userId: 1 })]);
  });
  it('lifecycle ignores marketing opt-outs and sanctions, but not suppression', async () => {
    mockPrisma.users.findMany
      .mockReset()
      .mockResolvedValueOnce([
        user(1, {
          emailPreference: {
            newsEmails: false,
            announcementEmails: false,
            unsubscribedAllAt: new Date(),
          },
        }),
      ])
      .mockResolvedValue([]);
    statusSpy.mockResolvedValue(new Map([[1, 'BANNED']]));
    expect(
      await service.resolveEligibleRecipients({
        category: 'ACCOUNT_LIFECYCLE',
        userIds: [1],
      }),
    ).toHaveLength(1);
    mockPrisma.users.findMany
      .mockReset()
      .mockResolvedValueOnce([user(1)])
      .mockResolvedValue([]);
    const { hashIdentity } = require('@/utils/identityHash');
    mockPrisma.emailSuppression.findMany.mockResolvedValue([
      { hash: hashIdentity('EMAIL', 'player1@example.test') },
    ]);
    expect(
      await service.resolveEligibleRecipients({
        category: 'ACCOUNT_LIFECYCLE',
        userIds: [1],
      }),
    ).toEqual([]);
  });
  it('processes audience pages without per-user status queries or retaining the whole audience', async () => {
    mockPrisma.users.findMany
      .mockReset()
      .mockResolvedValueOnce([user(1), user(2)])
      .mockResolvedValueOnce([user(3)]);
    const batches: number[][] = [];
    await service.forEachEligibleRecipientBatch(
      { category: 'NEWS', includeAll: true },
      2,
      async (batch: any[]) => {
        batches.push(batch.map((recipient) => recipient.userId));
      },
    );
    expect(batches).toEqual([[1, 2], [3]]);
    expect(statusSpy.mock.calls).toEqual([[[1, 2]], [[3]]]);
    expect(mockPrisma.users.findMany.mock.calls[1][0].where.id.gt).toBe(2);
  });

  it('uses the category-specific announcement preference', async () => {
    mockPrisma.users.findMany
      .mockReset()
      .mockResolvedValueOnce([
        user(1, {
          emailPreference: { announcementEmails: false, newsEmails: true },
        }),
      ])
      .mockResolvedValue([]);
    expect(
      await service.resolveEligibleRecipients({
        category: 'ANNOUNCEMENT',
        includeAll: true,
      }),
    ).toEqual([]);
  });
});
describe('email outbox', () => {
  it('enqueues idempotently using the provided transaction', async () => {
    await service.enqueueEmails(tx, [row()]);
    expect(tx.emailOutbox.createMany).toHaveBeenCalledWith({
      data: [row()],
      skipDuplicates: true,
    });
  });
  it('claims with skip-locked SQL, sends with unsubscribe headers and completes counters', async () => {
    claimed = [row()];
    expect(await service.processOutboxBatch(1)).toBe(1);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain(
      'FOR UPDATE OF o SKIP LOCKED',
    );
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }),
      }),
    );
    expect(tx.emailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    expect(tx.emailCampaign.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { sentCount: { increment: 1 } },
    });
    expect(tx.emailCampaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });
  it('prioritizes essential categories and does not offer essential-mail unsubscribe', async () => {
    claimed = [row({ category: 'ACCOUNT_LIFECYCLE' })];
    await service.processOutboxBatch(1);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain(
      "CASE o.category WHEN 'ACCOUNT_LIFECYCLE' THEN 0 WHEN 'TRANSACTIONAL' THEN 0 ELSE 1 END, o.id",
    );
    expect(sendSpy.mock.calls[0][0].headers).toEqual({});
    expect(service.unsubscribeHeaders(1, 'TRANSACTIONAL')).toEqual({});
    expect(service.unsubscribeHeaders(1, 'ACCOUNT_LIFECYCLE')).toEqual({});
    const saved = process.env.SMTP_FROM_EMAIL;
    try {
      delete process.env.SMTP_FROM_EMAIL;
      expect(
        service.unsubscribeHeaders(1, 'NEWS')['List-Unsubscribe'],
      ).not.toContain('mailto:');
    } finally {
      if (saved !== undefined) process.env.SMTP_FROM_EMAIL = saved;
    }
  });

  it('skips recipients whose address changed since enqueue', async () => {
    claimed = [row({ toAddress: 'previous@example.test' })];
    await service.processOutboxBatch(1);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(tx.emailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SKIPPED' } }),
    );
  });
  it('rechecks opt-outs before delivery', async () => {
    claimed = [row()];
    mockPrisma.users.findMany
      .mockReset()
      .mockResolvedValueOnce([
        user(1, { emailPreference: { newsEmails: false } }),
      ])
      .mockResolvedValue([]);
    await service.processOutboxBatch(1);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(tx.emailCampaign.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { skippedCount: { increment: 1 } },
    });
  });
  it('backs off without storing SMTP details and permanently fails the fifth attempt', async () => {
    claimed = [row({ attempts: 2 })];
    sendSpy.mockRejectedValue(new Error('Synthetic private SMTP detail'));
    const before = Date.now();
    await service.processOutboxBatch(1);
    const { data } = tx.emailOutbox.update.mock.calls[0][0];
    expect(data.status).toBe('PENDING');
    expect(data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      before + 120_000,
    );
    expect(data.lastError).toBe('Email delivery failed');
    expect(tx.emailCampaign.update).not.toHaveBeenCalled();
    claimed = [row({ attempts: 5 })];
    mockPrisma.users.findMany
      .mockReset()
      .mockResolvedValueOnce([user(1)])
      .mockResolvedValue([]);
    await service.processOutboxBatch(1);
    expect(tx.emailOutbox.update.mock.calls[1][0].data.status).toBe('FAILED');
    expect(tx.emailCampaign.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { failedCount: { increment: 1 } },
    });
  });
  it('claims one message immediately before each send, and stops when the queue is empty', async () => {
    claimed = [row(), row({ id: 10 })];
    mockPrisma.users.findMany.mockReset().mockResolvedValue([user(1)]);
    expect(await service.processOutboxBatch(10)).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const claims = tx.$queryRaw.mock.calls.filter((call: any[]) =>
      call[0].join('').includes('WITH picked'),
    );
    expect(claims).toHaveLength(3);
    expect(claims[0][0].join('')).toContain('LIMIT 1');
  });
  it('finalizes an abandoned fifth claim without sending it again', async () => {
    claimed = [row({ attempts: 5, exhausted: true })];
    await service.processOutboxBatch(1);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(tx.emailOutbox.update.mock.calls[0][0].data.status).toBe('FAILED');
  });
  it('does not misclassify a database failure after SMTP acceptance as a send failure', async () => {
    claimed = [row()];
    tx.emailOutbox.update.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(service.processOutboxBatch(1)).rejects.toThrow(
      'database unavailable',
    );
    expect(tx.emailOutbox.update).toHaveBeenCalledTimes(1);
  });
});

describe('outbox worker empty-queue fast path', () => {
  it('refuses to start in production and logs only the missing configuration names', () => {
    const worker = require('@/server/emailOutboxWorker');
    const logger = require('@/utils/logger');
    const loggerSpy = vi.spyOn(logger, 'logError').mockImplementation(() => {});
    const keys = [
      'NODE_ENV',
      'IDENTITY_HASH_SECRET',
      'ANTI_ABUSE_SALT',
      'EMAIL_UNSUBSCRIBE_SECRET',
    ];
    const saved = keys.map((key) => process.env[key]);
    try {
      Object.assign(process.env, { NODE_ENV: 'production' });
      delete process.env.IDENTITY_HASH_SECRET;
      delete process.env.ANTI_ABUSE_SALT;
      delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
      worker.startEmailOutboxWorker()();
      expect(loggerSpy).toHaveBeenCalledWith(
        'Email outbox configuration missing: IDENTITY_HASH_SECRET (or ANTI_ABUSE_SALT), EMAIL_UNSUBSCRIBE_SECRET',
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.users.findMany).not.toHaveBeenCalled();
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
      loggerSpy.mockRestore();
    }
  });

  it('does not reserve a delivery slot or take advisory locks when no message is ready', async () => {
    const runtime = require('@/services/RuntimeConfig.service');
    const worker = require('@/server/emailOutboxWorker');
    const configSpy = vi.spyOn(runtime, 'getRuntimeConfig').mockResolvedValue({
      emailOutboxEnabled: true,
      emailOutboxRatePerMinute: 60,
    });
    mockPrisma.emailOutbox.findFirst = vi.fn(async () => null);
    const stop = worker.startEmailOutboxWorker();
    try {
      for (let index = 0; index < 10; index++) await Promise.resolve();
      expect(mockPrisma.emailOutbox.findFirst).toHaveBeenCalled();
      expect(mockPrisma.emailCampaign.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'COMPLETED', completedAt: expect.any(Date) },
        }),
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    } finally {
      stop();
      configSpy.mockRestore();
    }
  });
});

describe('SMTP transport policy', () => {
  it('does not construct a transport at module import', () => {
    expect(transportsAtImport).toBe(0);
  });
  it('defaults to secure TLS regardless of port and opts out only for explicit false', () => {
    const saved = process.env.SMTP_SECURE;
    try {
      delete process.env.SMTP_SECURE;
      expect(service.smtpTransportOptions()).toMatchObject({
        secure: true,
        tls: { rejectUnauthorized: true },
      });
      for (const value of ['true', '0', 'FALSE', '']) {
        process.env.SMTP_SECURE = value;
        expect(service.smtpTransportOptions().secure).toBe(true);
      }
      process.env.SMTP_SECURE = 'false';
      expect(service.smtpTransportOptions()).toMatchObject({
        secure: false,
        tls: { rejectUnauthorized: true },
      });
    } finally {
      if (saved === undefined) delete process.env.SMTP_SECURE;
      else process.env.SMTP_SECURE = saved;
    }
  });
});

describe('battle alert delivery preferences', () => {
  it('only sends explicit opt-ins and rechecks opt-out before SMTP', async () => {
    for (const preference of [
      null,
      { attackNotificationEmails: false },
      { attackNotificationEmails: true, unsubscribedAllAt: new Date() },
    ]) {
      claimed = [row({ category: 'ATTACK_NOTIFICATION', campaignId: null })];
      mockPrisma.users.findMany
        .mockReset()
        .mockResolvedValueOnce([user(1, { emailPreference: preference })])
        .mockResolvedValue([]);
      await service.processOutboxBatch(1);
    }
    expect(sendSpy).not.toHaveBeenCalled();
    claimed = [row({ category: 'ATTACK_NOTIFICATION', campaignId: null })];
    mockPrisma.users.findMany
      .mockReset()
      .mockResolvedValueOnce([
        user(1, { emailPreference: { attackNotificationEmails: true } }),
      ])
      .mockResolvedValue([]);
    await service.processOutboxBatch(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].headers['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click',
    );
    expect(mockPrisma.emailCampaign.update).not.toHaveBeenCalled();
  });
});
