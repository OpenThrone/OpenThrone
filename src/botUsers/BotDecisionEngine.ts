import type { MinimalBot } from './BotExecutor';
import type { BotActionType, BotPersona } from './types';

export interface DecisionContext {
  bot: MinimalBot;
  slot: BotActionType;
}

export interface Decision {
  action: BotActionType;
  skipReason?: string;
}

const TRAIN_SLOTS = new Set<BotActionType>([
  'TRAIN_WORKER',
  'TRAIN_OFFENSE',
  'TRAIN_DEFENSE',
]);

function isTrainSlot(
  slot: BotActionType,
): slot is Extract<
  BotActionType,
  'TRAIN_WORKER' | 'TRAIN_OFFENSE' | 'TRAIN_DEFENSE'
> {
  return TRAIN_SLOTS.has(slot);
}

export class BotDecisionEngine {
  static decide(ctx: DecisionContext): Decision {
    const { slot } = ctx;

    if (slot === 'IDLE') {
      return { action: 'IDLE' };
    }

    if (slot === 'RECRUIT') {
      return { action: 'RECRUIT' };
    }

    if (isTrainSlot(slot)) {
      return { action: slot };
    }

    return { action: 'IDLE', skipReason: `Unknown slot: ${slot}` };
  }

  static personaFor(bot: MinimalBot): BotPersona {
    return (bot.botPersona ?? 'BALANCED') as BotPersona;
  }
}
