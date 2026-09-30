import type { BotActionType, BotClass, BotPersona, BotRace } from './types';

export const PERSONA_TRAINING_PREFERENCE: Record<BotPersona, BotActionType> = {
  FARMER_GREEDY: 'TRAIN_WORKER',
  FARMER_CAUTIOUS: 'TRAIN_WORKER',
  FARMER_ADAPTIVE: 'TRAIN_WORKER',
  AGGRESSIVE: 'TRAIN_OFFENSE',
  DEFENSIVE: 'TRAIN_DEFENSE',
  BALANCED: 'TRAIN_WORKER',
};

export const DEFAULT_RACE_DISTRIBUTION: Record<BotRace, number> = {
  ELF: 0.25,
  HUMAN: 0.25,
  GOBLIN: 0.25,
  UNDEAD: 0.25,
};

export const DEFAULT_CLASS_DISTRIBUTION: Record<BotClass, number> = {
  FIGHTER: 0.25,
  CLERIC: 0.25,
  ASSASSIN: 0.25,
  THIEF: 0.25,
};

export const DEFAULT_PERSONA_DISTRIBUTION: Record<BotPersona, number> = {
  FARMER_GREEDY: 0.15,
  FARMER_CAUTIOUS: 0.15,
  FARMER_ADAPTIVE: 0.15,
  AGGRESSIVE: 0.2,
  DEFENSIVE: 0.2,
  BALANCED: 0.15,
};

export const DEFAULT_MANIFEST_NAME = 'default';
export const DEFAULT_SCHEDULE_NAME = 'default';
export const DEFAULT_BOT_COUNT = 35;

export const DEFAULT_DISPLAY_PREFIX = 'Bot';
export const DEFAULT_EMAIL_DOMAIN = 'bots.openthrone.local';

export const BOT_IP_ADDRESS = '127.0.0.1';
export const RECRUIT_GOLD_REWARD = 250;
export const RECRUIT_DAILY_CAP_PER_BOT = 5;

export const CONFIG_ROOT_DIR = 'config/bots';
