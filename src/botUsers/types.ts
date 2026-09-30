export const BOT_RACES = ['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'] as const;
export type BotRace = (typeof BOT_RACES)[number];

export const BOT_CLASSES = ['FIGHTER', 'CLERIC', 'ASSASSIN', 'THIEF'] as const;
export type BotClass = (typeof BOT_CLASSES)[number];

export const BOT_PERSONAS = [
  'FARMER_GREEDY',
  'FARMER_CAUTIOUS',
  'FARMER_ADAPTIVE',
  'AGGRESSIVE',
  'DEFENSIVE',
  'BALANCED',
] as const;
export type BotPersona = (typeof BOT_PERSONAS)[number];

export const BOT_ACTIONS = [
  'RECRUIT',
  'TRAIN_WORKER',
  'TRAIN_OFFENSE',
  'TRAIN_DEFENSE',
  'IDLE',
] as const;
export type BotActionType = (typeof BOT_ACTIONS)[number];

export type BotRunStatus = 'success' | 'skipped' | 'failed';

export interface BotManifestSpec {
  email: string;
  displayName: string;
  race: BotRace;
  class: BotClass;
  persona: BotPersona;
}

export interface BotManifestDistribution {
  count: number;
  races?: Partial<Record<BotRace, number>>;
  classes?: Partial<Record<BotClass, number>>;
  personas?: Partial<Record<BotPersona, number>>;
}

export interface BotManifestNaming {
  displayPrefix?: string;
  emailDomain?: string;
}

export interface BotManifest {
  name: string;
  description?: string;
  bots?: BotManifestSpec[];
  distribution?: BotManifestDistribution;
  naming?: BotManifestNaming;
}

export interface BotScheduleAllocations {
  recruit: number;
  trainWorkers: number;
  trainOffense: number;
  trainDefense: number;
  idle: number;
}

export interface BotSchedule {
  name: string;
  description?: string;
  allocations: BotScheduleAllocations;
}

export interface BotTrainDetails {
  type: string;
  level: number;
  quantity: number;
}

export interface BotRunResult {
  userId: number;
  displayName: string;
  persona: BotPersona;
  action: BotActionType;
  status: BotRunStatus;
  reason?: string;
  durationMs: number;
  recruited?: number;
  trained?: BotTrainDetails;
}

export interface BotRunSummary {
  totalBots: number;
  processedAt: string;
  byAction: Record<BotActionType, number>;
  byStatus: Record<BotRunStatus, number>;
  results: BotRunResult[];
  durationMs: number;
}

export interface BotConfig {
  recruitedToday?: number;
  lastAction?: BotActionType;
  customSchedule?: string;
}
