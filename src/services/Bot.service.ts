import type {
  BotActionType,
  BotPersona,
  BotRunResult,
  BotRunSummary,
  BotSchedule,
  ProvisionOptions,
  ProvisionResult,
} from '@/botUsers';
import {
  BotDecisionEngine,
  BotExecutor,
  BotFactory,
  loadSchedule,
  PERSONA_TRAINING_PREFERENCE,
} from '@/botUsers';
import type { MinimalBot } from '@/botUsers/BotExecutor';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { logError } from '@/utils/logger';
import { getOTStartDate } from '@/utils/timefunctions';

export interface BotStatusEntry {
  id: number;
  display_name: string;
  email: string;
  race: string;
  class: string;
  botPersona: BotPersona | null;
  botCreatedAt: Date | null;
  botLastRunAt: Date | null;
  botStats: unknown;
  gold: bigint;
}

export interface BotStatusReport {
  total: number;
  bots: BotStatusEntry[];
}

type BotUser = Prisma.usersGetPayload<{
  include: {
    UserUnit: true;
    statusHistories: { orderBy: { created_at: 'desc' }; take: 1 };
  };
}> & {
  isBot: boolean;
  botPersona: string | null;
  botConfig: unknown;
  botCreatedAt: Date | null;
  botLastRunAt: Date | null;
  botStats: unknown;
};

const EMPTY_ACTION_COUNTS: Record<BotActionType, number> = {
  RECRUIT: 0,
  TRAIN_WORKER: 0,
  TRAIN_OFFENSE: 0,
  TRAIN_DEFENSE: 0,
  IDLE: 0,
};

const EMPTY_STATUS_COUNTS = {
  success: 0,
  skipped: 0,
  failed: 0,
};

function dailySeed(): number {
  const today = new Date();
  return (
    today.getFullYear() * 10_000 +
    (today.getMonth() + 1) * 100 +
    today.getDate()
  );
}

function seededShuffle<T>(array: readonly T[], seed: number): T[] {
  let state = seed % 2_147_483_647;
  if (state <= 0) state += 2_147_483_646;
  const rng = () => {
    state = (state * 16807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface SlotTargets {
  RECRUIT: number;
  TRAIN_WORKER: number;
  TRAIN_OFFENSE: number;
  TRAIN_DEFENSE: number;
  IDLE: number;
}

function computeTargets(total: number, schedule: BotSchedule): SlotTargets {
  const a = schedule.allocations;
  const recruit = Math.floor(total * a.recruit);
  const trainWorkers = Math.floor(total * a.trainWorkers);
  const trainOffense = Math.floor(total * a.trainOffense);
  const trainDefense = Math.floor(total * a.trainDefense);
  const idle = Math.max(
    0,
    total - recruit - trainWorkers - trainOffense - trainDefense,
  );
  return {
    RECRUIT: recruit,
    TRAIN_WORKER: trainWorkers,
    TRAIN_OFFENSE: trainOffense,
    TRAIN_DEFENSE: trainDefense,
    IDLE: idle,
  };
}

const SLOT_PRIORITY: BotActionType[] = [
  'RECRUIT',
  'TRAIN_WORKER',
  'TRAIN_OFFENSE',
  'TRAIN_DEFENSE',
  'IDLE',
];

function assignSlots<T extends { persona: BotPersona }>(
  bots: readonly T[],
  schedule: BotSchedule,
  seed: number,
): Map<number, BotActionType> {
  const targets = computeTargets(bots.length, schedule);
  const remaining: SlotTargets = { ...targets };
  const assignments = new Map<number, BotActionType>();
  const shuffled = seededShuffle(bots, seed);

  const personaPreferred: Partial<Record<BotActionType, BotActionType>> = {};
  for (const persona of Object.keys(
    PERSONA_TRAINING_PREFERENCE,
  ) as BotPersona[]) {
    personaPreferred[PERSONA_TRAINING_PREFERENCE[persona]] =
      PERSONA_TRAINING_PREFERENCE[persona];
  }

  const tryClaimSlot = (slot: BotActionType): boolean => {
    if (remaining[slot] > 0) {
      remaining[slot] -= 1;
      return true;
    }
    return false;
  };

  for (const bot of shuffled) {
    const preferred = PERSONA_TRAINING_PREFERENCE[bot.persona];
    let assigned: BotActionType | null = null;

    if (preferred && tryClaimSlot(preferred)) {
      assigned = preferred;
    }

    if (!assigned) {
      for (const slot of SLOT_PRIORITY) {
        if (tryClaimSlot(slot)) {
          assigned = slot;
          break;
        }
      }
    }

    assignments.set((bot as unknown as { id: number }).id, assigned ?? 'IDLE');
  }

  return assignments;
}

function hasRunToday(bot: { botLastRunAt: Date | null }): boolean {
  if (!bot.botLastRunAt) return false;
  const todayStart = getOTStartDate();
  return bot.botLastRunAt >= todayStart;
}

function toMinimalBot(user: BotUser): MinimalBot {
  return {
    id: user.id,
    display_name: user.display_name,
    botPersona: (user.botPersona ?? 'BALANCED') as BotPersona,
  };
}

async function runSingleBot(
  bot: BotUser,
  slot: BotActionType,
): Promise<BotRunResult> {
  const minimal = toMinimalBot(bot);
  const decision = BotDecisionEngine.decide({ bot: minimal, slot });

  if (decision.action === 'IDLE') {
    return BotExecutor.executeIdle(minimal);
  }
  if (decision.action === 'RECRUIT') {
    return BotExecutor.executeRecruit(minimal);
  }
  if (
    decision.action === 'TRAIN_WORKER' ||
    decision.action === 'TRAIN_OFFENSE' ||
    decision.action === 'TRAIN_DEFENSE'
  ) {
    return BotExecutor.executeTrain(minimal, decision.action);
  }
  return BotExecutor.executeIdle(minimal);
}

function appendRunToStats(
  existing: unknown,
  result: BotRunResult,
): { history: BotRunResult[] } {
  const safe = (existing as { history?: BotRunResult[] } | null) ?? {};
  const history = safe.history ?? [];
  const next = [...history, result];
  return { history: next.slice(-30) };
}

interface BotWithStatus {
  id: number;
  statusHistories?: Array<{ status: string }>;
}

async function ensureActiveStatus(userId: number): Promise<void> {
  try {
    await prisma.accountStatusHistory.create({
      data: {
        user_id: userId,
        status: 'ACTIVE',
        start_date: new Date(),
        reason: 'Bot account initialization',
      },
    });
  } catch (error) {
    logError(`Failed to seed ACTIVE status for bot ${userId}`, { error });
  }
}

async function ensureBotsHaveActiveStatus(
  bots: ReadonlyArray<BotWithStatus>,
): Promise<void> {
  for (const bot of bots) {
    const latest = bot.statusHistories?.[0]?.status;
    if (!latest) {
      await ensureActiveStatus(bot.id);
    }
  }
}

export class BotService {
  static async runDailyBotTick(
    scheduleName = 'default',
  ): Promise<BotRunSummary> {
    const schedule = loadSchedule(scheduleName);
    const startTime = Date.now();

    const bots = (await prisma.users.findMany({
      where: { isBot: true },
      include: {
        UserUnit: true,
        statusHistories: { orderBy: { created_at: 'desc' }, take: 1 },
      },
    })) as BotUser[];

    if (bots.length === 0) {
      return {
        totalBots: 0,
        processedAt: new Date().toISOString(),
        byAction: { ...EMPTY_ACTION_COUNTS },
        byStatus: { ...EMPTY_STATUS_COUNTS },
        results: [],
        durationMs: Date.now() - startTime,
      };
    }

    await ensureBotsHaveActiveStatus(bots);

    const pending = bots.filter((bot) => !hasRunToday(bot));
    const seed = dailySeed();
    const assignments = assignSlots(
      pending.map((b) => ({
        id: b.id,
        persona: (b.botPersona ?? 'BALANCED') as BotPersona,
      })),
      schedule,
      seed,
    );

    const results: BotRunResult[] = [];
    for (const bot of pending) {
      const slot = assignments.get(bot.id) ?? 'IDLE';
      let result: BotRunResult;
      try {
        result = await runSingleBot(bot, slot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Bot tick threw for user ${bot.id}`, { error });
        result = {
          userId: bot.id,
          displayName: bot.display_name,
          persona: (bot.botPersona ?? 'BALANCED') as BotPersona,
          action: slot,
          status: 'failed',
          reason: message,
          durationMs: 0,
        };
      }

      results.push(result);

      try {
        await prisma.users.update({
          where: { id: bot.id },
          data: {
            botLastRunAt: new Date(),
            last_active: new Date(),
            botStats: appendRunToStats(bot.botStats, result),
          },
        });
      } catch (error) {
        logError(`Failed to update botStats for user ${bot.id}`, { error });
      }
    }

    const byAction: Record<BotActionType, number> = { ...EMPTY_ACTION_COUNTS };
    const byStatus = { ...EMPTY_STATUS_COUNTS };
    for (const r of results) {
      byAction[r.action] += 1;
      byStatus[r.status] += 1;
    }

    return {
      totalBots: bots.length,
      processedAt: new Date().toISOString(),
      byAction,
      byStatus,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  static async provisionBotsFromManifest(
    manifestName = 'default',
    options: ProvisionOptions = {},
  ): Promise<ProvisionResult> {
    return BotFactory.provisionFromManifest(manifestName, options);
  }

  static async getBotStatus(): Promise<BotStatusReport> {
    const bots = await prisma.users.findMany({
      where: { isBot: true },
      select: {
        id: true,
        display_name: true,
        email: true,
        race: true,
        class: true,
        botPersona: true,
        botCreatedAt: true,
        botLastRunAt: true,
        botStats: true,
        gold: true,
      },
      orderBy: { id: 'asc' },
    });

    return {
      total: bots.length,
      bots: bots as BotStatusEntry[],
    };
  }
}
