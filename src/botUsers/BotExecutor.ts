import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { performRecruitment } from '@/services/Recruitment.service';
import { trainUnits } from '@/services/Training.service';
import { logError } from '@/utils/logger';
import { getOTStartDate } from '@/utils/timefunctions';

import { BOT_IP_ADDRESS, RECRUIT_DAILY_CAP_PER_BOT } from './constants';
import type {
  BotActionType,
  BotPersona,
  BotRunResult,
  BotTrainDetails,
} from './types';

const MAX_TRAIN_PER_RUN = 100;

const ACTION_TO_UNIT: Record<
  Extract<BotActionType, 'TRAIN_WORKER' | 'TRAIN_OFFENSE' | 'TRAIN_DEFENSE'>,
  { type: string; level: number }
> = {
  TRAIN_WORKER: { type: 'WORKER', level: 1 },
  TRAIN_OFFENSE: { type: 'OFFENSE', level: 1 },
  TRAIN_DEFENSE: { type: 'DEFENSE', level: 1 },
};

interface MinimalBot {
  id: number;
  display_name: string;
  botPersona: BotPersona | null;
}

function now(): number {
  return Date.now();
}

function success(
  bot: MinimalBot,
  action: BotActionType,
  startTime: number,
  details?: { recruited?: number; trained?: BotTrainDetails },
): BotRunResult {
  return {
    userId: bot.id,
    displayName: bot.display_name,
    persona: (bot.botPersona ?? 'BALANCED') as BotPersona,
    action,
    status: 'success',
    durationMs: now() - startTime,
    recruited: details?.recruited,
    trained: details?.trained,
  };
}

function skipped(
  bot: MinimalBot,
  action: BotActionType,
  startTime: number,
  reason: string,
): BotRunResult {
  return {
    userId: bot.id,
    displayName: bot.display_name,
    persona: (bot.botPersona ?? 'BALANCED') as BotPersona,
    action,
    status: 'skipped',
    reason,
    durationMs: now() - startTime,
  };
}

function failed(
  bot: MinimalBot,
  action: BotActionType,
  startTime: number,
  reason: string,
): BotRunResult {
  return {
    userId: bot.id,
    displayName: bot.display_name,
    persona: (bot.botPersona ?? 'BALANCED') as BotPersona,
    action,
    status: 'failed',
    reason,
    durationMs: now() - startTime,
  };
}

type UserWithUnits = Prisma.usersGetPayload<{
  include: { UserUnit: true };
}>;

async function fetchUserWithUnits(
  userId: number,
): Promise<UserWithUnits | null> {
  return prisma.users.findUnique({
    where: { id: userId },
    include: { UserUnit: true },
  });
}

function getCitizens(user: UserWithUnits): number {
  const citizenRow = user.UserUnit.find(
    (u) => u.type === 'CITIZEN' && u.level === 1,
  );
  const qty = citizenRow?.quantity;
  if (typeof qty === 'number') return qty;
  if (typeof qty === 'string') return parseInt(qty, 10) || 0;
  return 0;
}

export class BotExecutor {
  static async executeRecruit(bot: MinimalBot): Promise<BotRunResult> {
    const startTime = now();
    const action: BotActionType = 'RECRUIT';

    try {
      const todayCount = await prisma.recruit_history.count({
        where: {
          from_user: bot.id,
          to_user: bot.id,
          timestamp: { gte: getOTStartDate() },
        },
      });

      const remaining = Math.max(0, RECRUIT_DAILY_CAP_PER_BOT - todayCount);
      if (remaining === 0) {
        return skipped(
          bot,
          action,
          startTime,
          'Daily self-recruit cap reached',
        );
      }

      let recruited = 0;
      for (let i = 0; i < remaining; i++) {
        try {
          await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
              await performRecruitment({
                tx,
                fromUser: bot.id,
                toUser: bot.id,
                userIdToUpdate: bot.id,
                ipAddress: BOT_IP_ADDRESS,
                strategy: 'standard',
              });
            },
            { timeout: 15_000, maxWait: 5_000 },
          );
          recruited++;
        } catch (err) {
          if (recruited > 0) {
            return success(bot, action, startTime, { recruited });
          }
          throw err;
        }
      }

      return success(bot, action, startTime, { recruited });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`BotExecutor.executeRecruit failed for bot ${bot.id}`, {
        error,
      });
      return failed(bot, action, startTime, message);
    }
  }

  static async executeTrain(
    bot: MinimalBot,
    action: Extract<
      BotActionType,
      'TRAIN_WORKER' | 'TRAIN_OFFENSE' | 'TRAIN_DEFENSE'
    >,
  ): Promise<BotRunResult> {
    const startTime = now();

    try {
      const user = await fetchUserWithUnits(bot.id);
      if (!user) {
        return failed(bot, action, startTime, 'User not found');
      }

      const citizens = getCitizens(user);
      if (citizens <= 0) {
        return skipped(
          bot,
          action,
          startTime,
          'No citizens available to train',
        );
      }

      const unitSpec = ACTION_TO_UNIT[action];
      const quantity = Math.min(citizens, MAX_TRAIN_PER_RUN);

      if (quantity <= 0) {
        return skipped(bot, action, startTime, 'Computed quantity is zero');
      }

      await trainUnits({
        userId: bot.id,
        units: [
          {
            type: unitSpec.type,
            level: unitSpec.level,
            quantity,
          },
        ],
      });

      return success(bot, action, startTime, {
        trained: {
          type: unitSpec.type,
          level: unitSpec.level,
          quantity,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('Not enough gold') ||
        message.includes('Not enough citizens')
      ) {
        return skipped(bot, action, startTime, message);
      }
      logError(`BotExecutor.executeTrain failed for bot ${bot.id}`, { error });
      return failed(bot, action, startTime, message);
    }
  }

  static async executeIdle(bot: MinimalBot): Promise<BotRunResult> {
    const startTime = now();
    return {
      userId: bot.id,
      displayName: bot.display_name,
      persona: (bot.botPersona ?? 'BALANCED') as BotPersona,
      action: 'IDLE',
      status: 'success',
      durationMs: now() - startTime,
    };
  }
}

export type { MinimalBot };
export { ACTION_TO_UNIT as BOT_ACTION_UNIT_MAP };
