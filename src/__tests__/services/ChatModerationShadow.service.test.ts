import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);

let runtime: Record<string, unknown> = {};
mock.module('@/services/RuntimeConfig.service', () => ({
  getRuntimeConfig: vi.fn(async () => runtime),
}));

const {
  ChatModerationShadowService,
  ShadowReviewError,
  SHADOW_LIST_MAX_LIMIT,
  SHADOW_LIST_MAX_OFFSET,
} = require('../../services/ChatModerationShadow.service');
const {
  DecisionProviderError,
  HeuristicProvider,
} = require('../../lib/decisions');

const NOW = new Date('2026-11-11T12:00:00Z');
const HOUR = 3600_000;

interface FakeMessage {
  id: number;
  content: string;
  messageType: string;
  deletedAt: Date | null;
  sentAt: Date;
  room: { allianceId: number | null; isPrivate: boolean };
}
const message = (over: Partial<FakeMessage> & { id: number }): FakeMessage => ({
  content: 'good game',
  messageType: 'TEXT',
  deletedAt: null,
  sentAt: new Date(NOW.getTime() - HOUR),
  room: { allianceId: null, isPrivate: false },
  ...over,
});

let messages: FakeMessage[] = [];
let verdicts: Array<Record<string, unknown>> = [];

beforeEach(() => {
  runtime = { moderationShadowEnabled: true, moderationShadowBatchSize: 25 };
  verdicts = [];
  messages = [
    message({ id: 1 }),
    message({ id: 2, deletedAt: new Date(NOW.getTime() - 1000) }),
    message({ id: 3, messageType: 'ATTACK_LOG_SHARE' }),
    message({ id: 4, sentAt: new Date(NOW.getTime() - 48 * HOUR) }),
    message({
      id: 5,
      content:
        "You're a worthless player. Quit the game, nobody wants you here.",
      room: { allianceId: 9, isPrivate: true },
    }),
    message({ id: 6 }),
  ];
  mockPrisma.chatMessage = {
    findMany: vi.fn(async ({ where, take }: any) =>
      messages
        .filter(
          (m) =>
            (m.deletedAt === null) === (where.deletedAt === null) &&
            m.messageType === where.messageType &&
            m.sentAt >= where.sentAt.gte &&
            !(
              where.moderationVerdicts?.none &&
              verdicts.some((v) => v.messageId === m.id)
            ),
        )
        .slice(0, take),
    ),
  };
  mockPrisma.chatModerationVerdict = {
    createMany: vi.fn(async ({ data }: any) => {
      verdicts.push(...data);
      return { count: data.length };
    }),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => []),
    findUnique: vi.fn(),
    update: vi.fn(),
  };
});

describe('shadow moderation sweep', () => {
  it('does nothing and calls no provider while the runtime setting is off', async () => {
    runtime = { moderationShadowEnabled: false };
    const provider = new HeuristicProvider();
    const decide = vi.spyOn(provider, 'decide');
    const result = await ChatModerationShadowService.runSweep({
      provider,
      now: NOW,
    });
    expect(result).toEqual({ enabled: false, processed: 0, failed: 0 });
    expect(decide).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it('classifies only unclassified, non-deleted TEXT messages from the last day', async () => {
    const result = await ChatModerationShadowService.runSweep({
      provider: new HeuristicProvider(),
      now: NOW,
    });
    expect(result).toEqual({ enabled: true, processed: 3, failed: 0 });
    expect(verdicts.map((v) => v.messageId).sort()).toEqual([1, 5, 6]);

    // A second sweep finds nothing new: no duplicate verdicts.
    const again = await ChatModerationShadowService.runSweep({
      provider: new HeuristicProvider(),
      now: NOW,
    });
    expect(again.processed).toBe(0);
    expect(verdicts).toHaveLength(3);
  });

  it('records the policy action, room type and provider, and only shadows', async () => {
    await ChatModerationShadowService.runSweep({
      provider: new HeuristicProvider(),
      now: NOW,
    });
    const hostile = verdicts.find((v) => v.messageId === 5)!;
    expect(['flag', 'would_block']).toContain(hostile.policyAction);
    expect(hostile.roomType).toBe('alliance');
    expect(hostile.provider).toBe('heuristic');
    expect(verdicts.find((v) => v.messageId === 1)!.policyAction).toBe('allow');
    // No message is ever modified.
    expect(mockPrisma.chatMessage.update).toBeUndefined();
    expect(mockPrisma.chatMessage.updateMany).toBeUndefined();
    expect(mockPrisma.chatMessage.delete).toBeUndefined();
  });

  it('respects the configured batch size', async () => {
    runtime = { moderationShadowEnabled: true, moderationShadowBatchSize: 2 };
    const result = await ChatModerationShadowService.runSweep({
      provider: new HeuristicProvider(),
      now: NOW,
    });
    expect(result.processed).toBe(2);
    const call = mockPrisma.chatMessage.findMany.mock.calls[0][0];
    expect(call.take).toBe(2);
  });

  it('sends the provider only message text and room context', async () => {
    const provider = new HeuristicProvider();
    const decide = vi.spyOn(provider, 'decide');
    await ChatModerationShadowService.runSweep({ provider, now: NOW });
    for (const [request] of decide.mock.calls as any[]) {
      expect(Object.keys(request.state).sort()).toEqual(['context', 'message']);
    }
  });

  it('records a provider failure as an error verdict without the message text', async () => {
    const provider = {
      name: 'systemone',
      model: 'jev-latest',
      decide: vi.fn(async () => {
        throw new Error('Decision provider returned HTTP 503');
      }),
    };
    const result = await ChatModerationShadowService.runSweep({
      provider,
      now: NOW,
    });
    expect(result).toEqual({ enabled: true, processed: 0, failed: 3 });
    expect(verdicts.every((v) => v.policyAction === 'error')).toBe(true);
    expect(JSON.stringify(verdicts)).not.toContain('worthless');
  });

  it('stops without writing when the provider cannot be reached, so a later sweep retries', async () => {
    const provider = {
      name: 'systemone',
      model: 'kev-latest',
      decide: vi.fn(async () => {
        throw new DecisionProviderError('Decision request failed', 'network');
      }),
    };
    const result = await ChatModerationShadowService.runSweep({
      provider,
      now: NOW,
    });
    expect(result).toEqual({
      enabled: true,
      processed: 0,
      failed: 0,
      providerUnavailable: true,
    });
    expect(verdicts).toHaveLength(0);

    const retry = await ChatModerationShadowService.runSweep({
      provider: new HeuristicProvider(),
      now: NOW,
    });
    expect(retry.processed).toBe(3);
  });

  it('still records timeouts as errors so one stuck message cannot block the queue', async () => {
    const provider = {
      name: 'systemone',
      model: 'kev-latest',
      decide: vi.fn(async () => {
        throw new DecisionProviderError(
          'Decision request timed out',
          'timeout',
        );
      }),
    };
    const result = await ChatModerationShadowService.runSweep({
      provider,
      now: NOW,
    });
    expect(result).toEqual({ enabled: true, processed: 0, failed: 3 });
    expect(verdicts.every((v) => v.policyAction === 'error')).toBe(true);
  });
});

describe('shadow moderation listing', () => {
  it('caps limit and offset', async () => {
    const result = await ChatModerationShadowService.list({
      limit: 100000,
      offset: 99999999,
    });
    expect(result.limit).toBe(SHADOW_LIST_MAX_LIMIT);
    expect(result.offset).toBe(SHADOW_LIST_MAX_OFFSET);
    const call = mockPrisma.chatModerationVerdict.findMany.mock.calls[0][0];
    expect(call.take).toBe(SHADOW_LIST_MAX_LIMIT);
  });

  it('truncates the message excerpt', async () => {
    mockPrisma.chatModerationVerdict.findMany = vi.fn(async () => [
      { id: 1, policyAction: 'flag', message: { content: 'x'.repeat(500) } },
    ]);
    const result = await ChatModerationShadowService.list({
      limit: 10,
      offset: 0,
    });
    expect(result.verdicts[0].excerpt.length).toBe(201);
  });
});

describe('shadow moderation summary', () => {
  it('counts per policy action and computes the false-positive rate', async () => {
    mockPrisma.chatModerationVerdict.groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        { policyAction: 'allow', _count: { _all: 90 } },
        { policyAction: 'flag', _count: { _all: 8 } },
        { policyAction: 'would_block', _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { reviewOutcome: 'false_positive', _count: { _all: 1 } },
        { reviewOutcome: 'correct', _count: { _all: 3 } },
      ]);
    const summary = await ChatModerationShadowService.summary(NOW);
    expect(summary.counts).toEqual({
      allow: 90,
      flag: 8,
      would_block: 2,
      error: 0,
    });
    expect(summary.reviewed).toBe(4);
    expect(summary.falsePositiveRate).toBe(0.25);
  });

  it('reports no rate before any review', async () => {
    const summary = await ChatModerationShadowService.summary(NOW);
    expect(summary.falsePositiveRate).toBeNull();
  });
});

describe('shadow moderation review', () => {
  const client = (policyAction: string | null) => ({
    chatModerationVerdict: {
      findUnique: vi.fn(async () =>
        policyAction ? { id: 5, policyAction } : null,
      ),
      update: vi.fn(async ({ data }: any) => ({
        id: 5,
        policyAction,
        ...data,
      })),
    },
  });

  it('stores the reviewer and outcome', async () => {
    const tx = client('flag');
    const updated = await ChatModerationShadowService.review(
      5,
      'false_positive',
      77,
      tx,
    );
    expect(updated.reviewOutcome).toBe('false_positive');
    expect(updated.reviewedByUserId).toBe(77);
    expect(updated.reviewedAt).toBeInstanceOf(Date);
  });

  it('returns null for a missing verdict', async () => {
    expect(
      await ChatModerationShadowService.review(5, 'correct', 1, client(null)),
    ).toBeNull();
  });

  it('rejects outcomes that do not fit the verdict', async () => {
    await expect(
      ChatModerationShadowService.review(
        5,
        'false_positive',
        1,
        client('allow'),
      ),
    ).rejects.toBeInstanceOf(ShadowReviewError);
    await expect(
      ChatModerationShadowService.review(
        5,
        'false_negative',
        1,
        client('flag'),
      ),
    ).rejects.toBeInstanceOf(ShadowReviewError);
    await expect(
      ChatModerationShadowService.review(5, 'correct', 1, client('error')),
    ).rejects.toBeInstanceOf(ShadowReviewError);
  });
});
