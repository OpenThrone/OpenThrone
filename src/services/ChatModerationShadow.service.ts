import {
  buildModerationState,
  CHAT_MODERATION_QUESTIONS,
  type ChatRoomType,
  decideModerationPolicy,
  type DecisionProvider,
  DecisionProviderError,
  getDecisionProvider,
  MODERATION_RECOMMENDED_ACTIONS,
  type ModerationRecommendedAction,
} from '@/lib/decisions';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { logError, logWarn } from '@/utils/logger';

/** Only messages this young are classified; older backlog is ignored. */
export const SHADOW_MODERATION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SHADOW_MODERATION_DEFAULT_BATCH = 25;
export const SHADOW_MODERATION_MAX_BATCH = 200;
/** Messages classified in parallel within one sweep. */
export const SHADOW_MODERATION_CONCURRENCY = 4;

export const SHADOW_REVIEW_OUTCOMES = [
  'correct',
  'false_positive',
  'false_negative',
] as const;
export type ShadowReviewOutcome = (typeof SHADOW_REVIEW_OUTCOMES)[number];

/** Policy actions plus `error` for a failed provider call. */
export const SHADOW_VERDICT_ACTIONS = [
  'allow',
  'flag',
  'would_block',
  'error',
] as const;
export type ShadowVerdictAction = (typeof SHADOW_VERDICT_ACTIONS)[number];

export const SHADOW_LIST_MAX_LIMIT = 100;
export const SHADOW_LIST_MAX_OFFSET = 10_000;
export const SHADOW_SUMMARY_DAYS = 30;
const EXCERPT_LENGTH = 200;

export interface ShadowSweepResult {
  enabled: boolean;
  processed: number;
  failed: number;
  /**
   * True when the provider could not be reached. The sweep stops and records
   * nothing, so the messages are picked up by a later sweep.
   */
  providerUnavailable?: boolean;
}

type ClassifyOutcome = 'ok' | 'failed' | 'unavailable';

/**
 * A connection that never reached the provider (refused, DNS, reset). A
 * self-hosted model that is only up while a task runs fails this way, so the
 * message is left for a later sweep instead of being marked as an error.
 * Timeouts and HTTP errors still record an error verdict: a provider that is
 * up but stuck on one message must not block the queue forever.
 */
const isProviderUnreachable = (error: unknown) =>
  error instanceof DecisionProviderError && error.kind === 'network';

const clampBatch = (value: number | undefined) =>
  Math.max(
    1,
    Math.min(
      SHADOW_MODERATION_MAX_BATCH,
      Math.trunc(value ?? SHADOW_MODERATION_DEFAULT_BATCH),
    ),
  );

export const chatRoomTypeOf = (room: {
  allianceId: number | null;
  isPrivate: boolean;
}): ChatRoomType =>
  room.allianceId != null ? 'alliance' : room.isPrivate ? 'private' : 'public';

const isRecommended = (value: string): value is ModerationRecommendedAction =>
  (MODERATION_RECOMMENDED_ACTIONS as readonly string[]).includes(value);

/** The review outcome does not fit the verdict it was sent for. */
export class ShadowReviewError extends Error {
  constructor() {
    super('Review outcome does not fit this verdict');
    this.name = 'ShadowReviewError';
  }
}

/**
 * Shadow-mode chat moderation (#448). Classifies recent chat messages in a
 * background sweep and records what the model said and what our policy would
 * have done. It never hides, deletes or sanctions anything, and it is never
 * called from the message send path.
 */
export class ChatModerationShadowService {
  /**
   * Classifies the next batch of unclassified, non-deleted TEXT messages from
   * the last 24 hours. Returns immediately when `moderation.shadowEnabled` is
   * off. A failed provider call is recorded as an `error` verdict so the same
   * message is not retried (and paid for) on every sweep, except when the
   * provider cannot be reached at all: then the sweep stops without writing.
   */
  static async runSweep(
    options: {
      provider?: DecisionProvider;
      now?: Date;
    } = {},
  ): Promise<ShadowSweepResult> {
    const config = await getRuntimeConfig();
    if (!config.moderationShadowEnabled)
      return { enabled: false, processed: 0, failed: 0 };

    const provider = options.provider ?? getDecisionProvider();
    const cutoff = new Date(
      (options.now ?? new Date()).getTime() - SHADOW_MODERATION_WINDOW_MS,
    );
    const messages = await prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        messageType: 'TEXT',
        sentAt: { gte: cutoff },
        moderationVerdicts: { none: {} },
      },
      select: {
        id: true,
        content: true,
        room: { select: { allianceId: true, isPrivate: true } },
      },
      orderBy: { id: 'asc' },
      take: clampBatch(config.moderationShadowBatchSize),
    });

    let processed = 0;
    let failed = 0;
    for (let i = 0; i < messages.length; i += SHADOW_MODERATION_CONCURRENCY) {
      const chunk = messages.slice(i, i + SHADOW_MODERATION_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((message) => this.classify(provider, message)),
      );
      let unavailable = false;
      for (const outcome of results) {
        if (outcome === 'ok') processed++;
        else if (outcome === 'failed') failed++;
        else unavailable = true;
      }
      if (unavailable) {
        logWarn(
          'Shadow chat moderation skipped: the decision provider is unreachable.',
        );
        return { enabled: true, processed, failed, providerUnavailable: true };
      }
    }
    return { enabled: true, processed, failed };
  }

  /** Classifies one message and stores the verdict (or an error verdict). */
  private static async classify(
    provider: DecisionProvider,
    message: {
      id: number;
      content: string;
      room: { allianceId: number | null; isPrivate: boolean };
    },
  ): Promise<ClassifyOutcome> {
    const roomType = chatRoomTypeOf(message.room);
    const base = {
      messageId: message.id,
      provider: provider.name,
      model: provider.model,
      roomType,
    };
    try {
      const result = await provider.decide({
        state: buildModerationState(message.content, roomType),
        questions: CHAT_MODERATION_QUESTIONS,
      });
      const { harassment, severity, spam, recommended_action } = result.answers;
      if (
        harassment?.type !== 'noul' ||
        severity?.type !== 'score' ||
        spam?.type !== 'noul' ||
        recommended_action?.type !== 'choice'
      )
        throw new Error('Decision answers are incomplete');
      const recommended: ModerationRecommendedAction = isRecommended(
        recommended_action.choice,
      )
        ? recommended_action.choice
        : 'flag';
      const policyAction = decideModerationPolicy({
        harassment: harassment.noul,
        severity: severity.score,
        spam: spam.noul,
        recommended,
      });
      await prisma.chatModerationVerdict.createMany({
        data: [
          {
            ...base,
            provider: result.provider,
            model: result.model,
            harassment: harassment.noul,
            severity: severity.score,
            spam: spam.noul,
            recommendedAction: recommended,
            policyAction,
            latencyMs: Math.round(result.latencyMs),
          },
        ],
        skipDuplicates: true,
      });
      return 'ok';
    } catch (error) {
      if (isProviderUnreachable(error)) return 'unavailable';
      // The provider error message carries a status only, never credentials.
      const reason = error instanceof Error ? error.message : 'unknown error';
      logError('Shadow chat moderation failed for a message:', reason);
      try {
        await prisma.chatModerationVerdict.createMany({
          data: [
            {
              ...base,
              policyAction: 'error',
              error: reason.slice(0, 300),
            },
          ],
          skipDuplicates: true,
        });
      } catch (writeError) {
        logError('Could not record the shadow moderation error:', writeError);
      }
      return 'failed';
    }
  }

  /** Paginated verdicts, newest first, with a message excerpt. */
  static async list(filters: {
    policyAction?: ShadowVerdictAction;
    limit: number;
    offset: number;
  }) {
    const limit = Math.max(1, Math.min(SHADOW_LIST_MAX_LIMIT, filters.limit));
    const offset = Math.max(
      0,
      Math.min(SHADOW_LIST_MAX_OFFSET, filters.offset),
    );
    const where: Prisma.ChatModerationVerdictWhereInput = filters.policyAction
      ? { policyAction: filters.policyAction }
      : {};
    const [rows, total] = await Promise.all([
      prisma.chatModerationVerdict.findMany({
        where,
        include: { message: { select: { content: true } } },
        orderBy: { id: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.chatModerationVerdict.count({ where }),
    ]);
    return {
      total,
      limit,
      offset,
      verdicts: rows.map(({ message, ...verdict }) => ({
        ...verdict,
        excerpt:
          message.content.length > EXCERPT_LENGTH
            ? `${message.content.slice(0, EXCERPT_LENGTH)}…`
            : message.content,
      })),
    };
  }

  /**
   * Counts per policy action over the last 30 days and the false-positive
   * rate: reviewed flagged/would-block verdicts that staff marked wrong.
   */
  static async summary(now: Date = new Date()) {
    const since = new Date(
      now.getTime() - SHADOW_SUMMARY_DAYS * 24 * 60 * 60 * 1000,
    );
    const [byAction, reviewedByOutcome] = await Promise.all([
      prisma.chatModerationVerdict.groupBy({
        by: ['policyAction'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.chatModerationVerdict.groupBy({
        by: ['reviewOutcome'],
        where: {
          createdAt: { gte: since },
          reviewOutcome: { not: null },
          policyAction: { in: ['flag', 'would_block'] },
        },
        _count: { _all: true },
      }),
    ]);
    const counts: Record<ShadowVerdictAction, number> = {
      allow: 0,
      flag: 0,
      would_block: 0,
      error: 0,
    };
    for (const row of byAction) {
      if (
        (SHADOW_VERDICT_ACTIONS as readonly string[]).includes(row.policyAction)
      )
        counts[row.policyAction as ShadowVerdictAction] = row._count._all;
    }
    const reviewed = reviewedByOutcome.reduce(
      (sum, row) => sum + row._count._all,
      0,
    );
    const falsePositives =
      reviewedByOutcome.find((row) => row.reviewOutcome === 'false_positive')
        ?._count._all ?? 0;
    return {
      days: SHADOW_SUMMARY_DAYS,
      counts,
      reviewed,
      falsePositives,
      falsePositiveRate: reviewed > 0 ? falsePositives / reviewed : null,
    };
  }

  /**
   * Records a staff review of a flagged/would-block verdict (a false negative
   * may also be recorded against an `allow`). Returns null when the verdict
   * does not exist.
   */
  static async review(
    verdictId: number,
    outcome: ShadowReviewOutcome,
    reviewerId: number,
    client: Pick<Prisma.TransactionClient, 'chatModerationVerdict'> = prisma,
  ) {
    const existing = await client.chatModerationVerdict.findUnique({
      where: { id: verdictId },
      select: { id: true, policyAction: true },
    });
    if (!existing) return null;
    const flagged =
      existing.policyAction === 'flag' ||
      existing.policyAction === 'would_block';
    const fits =
      existing.policyAction !== 'error' &&
      (outcome === 'correct' ||
        (outcome === 'false_positive' && flagged) ||
        (outcome === 'false_negative' && !flagged));
    if (!fits) throw new ShadowReviewError();
    return client.chatModerationVerdict.update({
      where: { id: verdictId },
      data: {
        reviewOutcome: outcome,
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }
}
