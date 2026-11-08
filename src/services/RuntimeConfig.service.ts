import {
  type AbuseDetectionConfig,
  buildAbuseConfig,
} from '@/constants/abuseSignals';
import {
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
} from '@/constants/runtimeSettings';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import type { StaminaRules } from '@/utils/stamina';

export interface RuntimeConfig {
  stamina?: StaminaRules;
  inactivityRemindersEnabled?: boolean;
  inactivityAutoAnonymizeEnabled?: boolean;
  emailOutboxEnabled?: boolean;
  emailOutboxRatePerMinute?: number;
  /** Internal daily recruitment allowance (legacy consumer property name). */
  recruitDailyCap: number;
  /** External link recruit attempts a player may receive per day. */
  externalRecruitDailyCap: number;
  /** External link recruit attempts allowed per IP and link owner per day. */
  externalRecruitIpDailyCap: number;
  /** External attempts one IP may make across all link owners per day. */
  /** Days of new-player battle protection after joining an era (1-60). */
  protectionDurationDays: number;
  mercenaryHireMultiplier?: number;
  mercenaryDailyPriceRate?: number;
  pairDailyLimit?: number;
  protectionLevelLimit?: number;
  depositCapPercent?: number;
  friendDailyReceivedCap?: number;
  /** Minimum player level to send or receive a friend gold transfer (1-100). */
  friendTransferMinLevel?: number;
  friendRequestCooldownDays?: number;
  friendRequestMaxDeclines?: number;
  friendRequestDailyCap?: number;
  maxPendingGoldRequests?: number;
  forceMaxQuantity?: number;
  forceMaxTermDays?: number;
  forceMaxPillageBps?: number;
  allianceLoanTermMinDays?: number;
  allianceLoanTermMaxDays?: number;
  allianceLoanInterestMaxPercent?: number;
  allianceMemberDailyCapMin?: number;
  allianceMemberDailyCapMax?: number;
  allianceLoanIncomeSharePercent?: number;
  /** Level the leader must have to reactivate a reserved alliance (#13). */
  allianceReactivationMinLevel?: number;
  /** Gold the leader pays to reactivate a reserved alliance (#13). */
  allianceReactivationCostGold?: number;
  /** Admin-only abuse detection thresholds (group "abuse"). */
  abuse: AbuseDetectionConfig;
  enableSupporter: boolean;
  enableAttacking: boolean;
  attackLevelRange: number;
  enableInfiltrations: boolean;
  enableAssassinations: boolean;
  enableIntel: boolean;
  enableSocial: boolean;
  /** Players may message each other; when off only admins and moderators can. */
  enableMessaging: boolean;
  enableEnemies: boolean;
  /** Low morale makes citizens, troops and mercenaries desert (daily pass). */
  enableDesertion: boolean;
  /** Undead raise units from battles. */
  enableReanimation: boolean;
  /** Repeated attacks in a day weaken the defender (down to 85% power). */
  enableGarrisonFatigue: boolean;
  /** Players see the kingdom morale meter and desertion log on the overview. */
  showKingdomMorale: boolean;
  /**
   * Players see the dungeon (captives and ransoms) panel on the overview, and
   * battles take captives. Off: captured units are killed instead.
   */
  showDungeon: boolean;
  disableLogin: boolean;
  disableRegistration: boolean;
  maintenance: { enabled: boolean; message: string };
  eraResetInProgress?: boolean;
}

let cached: { expiresAt: number; value: RuntimeConfig } | null = null;
let lastGood: { value: RuntimeConfig; loadedAt: number } | null = null;
let pending: Promise<RuntimeConfig> | null = null;
let pendingEpoch = -1;
let cacheEpoch = 0;
const CACHE_MS = 5000;
const MAX_STALE_MS = 30_000;

function envValue(key: keyof typeof RUNTIME_SETTING_REGISTRY): unknown {
  const meta = RUNTIME_SETTING_REGISTRY[key];
  if (!meta.env) return meta.fallback;
  const raw = process.env[meta.env];
  if (raw === undefined) return meta.fallback;
  if (meta.type === 'BOOLEAN') {
    if (key === 'ENABLE_ATTACKING') return raw.toLowerCase() !== 'false';
    return raw.toLowerCase() === 'true';
  }
  if (meta.type === 'NUMBER') return Number(raw);
  return raw;
}

export function invalidateRuntimeConfigCache() {
  cacheEpoch += 1;
  cached = null;
}

/** Transaction readers use their existing connection and never share or publish cached work. */
export async function getRuntimeConfig(
  db?: Pick<Prisma.TransactionClient, 'serverSetting'>,
): Promise<RuntimeConfig> {
  const useCache = !db;
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.value;
  if (useCache && pending && pendingEpoch === cacheEpoch) return pending;

  const requestEpoch = cacheEpoch;
  let request: Promise<RuntimeConfig>;
  request = (async () => {
    try {
      // Server settings are the only stored source; feature flag rows were
      // folded into them (migration 20261019010000_feature_flags_into_settings).
      const rows = await (db ?? prisma).serverSetting.findMany({
        where: {
          key: { in: [...RUNTIME_SETTING_KEYS, 'ERA_RESET_SCHEDULE'] },
        },
      });
      const values: Record<string, unknown> = {};
      for (const key of RUNTIME_SETTING_KEYS) {
        const { schema } = RUNTIME_SETTING_REGISTRY[key];
        const row = rows.find((candidate) => candidate.key === key);
        const fromDb = row ? schema.safeParse(row.value) : null;
        const fromEnv = schema.safeParse(envValue(key));
        values[key] = fromDb?.success
          ? fromDb.data
          : fromEnv.success
            ? fromEnv.data
            : RUNTIME_SETTING_REGISTRY[key].fallback;
      }
      const resetSchedule = rows.find(
        (row) => row.key === 'ERA_RESET_SCHEDULE',
      )?.value;
      const eraResetInProgress =
        !!resetSchedule &&
        typeof resetSchedule === 'object' &&
        !Array.isArray(resetSchedule) &&
        resetSchedule.state === 'closing';
      const value: RuntimeConfig = {
        eraResetInProgress,
        stamina: {
          penaltyThreshold: values['stamina.penaltyThreshold'] as number,
          minOffensePercent: values['stamina.minOffensePercent'] as number,
          enabled: values['stamina.enabled'] as boolean,
          recoveryEnabled: values['stamina.recoveryEnabled'] as boolean,
          recoveryAmount: values['stamina.recoveryAmount'] as number,
          recoveryIntervalMinutes: values[
            'stamina.recoveryIntervalMinutes'
          ] as number,
          baseCost: values['stamina.baseCost'] as number,
          perTurnCost: values['stamina.perTurnCost'] as number,
        },
        inactivityRemindersEnabled: values[
          'account.inactivity.remindersEnabled'
        ] as boolean,
        inactivityAutoAnonymizeEnabled: values[
          'account.inactivity.autoAnonymizeEnabled'
        ] as boolean,
        emailOutboxEnabled: values['email.outbox.enabled'] as boolean,
        emailOutboxRatePerMinute: values[
          'email.outbox.ratePerMinute'
        ] as number,
        recruitDailyCap: values['recruit.internalDailyCap'] as number,
        externalRecruitDailyCap: values['recruit.dailyCap'] as number,
        externalRecruitIpDailyCap: values[
          'recruit.externalIpDailyCap'
        ] as number,
        protectionDurationDays: values['era.protectionDurationDays'] as number,
        mercenaryHireMultiplier: values['mercenary.hireMultiplier'] as number,
        mercenaryDailyPriceRate: values['mercenary.dailyPriceRate'] as number,
        pairDailyLimit: values['combat.pairDailyLimit'] as number,
        protectionLevelLimit: values['era.protectionLevelLimit'] as number,
        depositCapPercent: values['bank.depositCapPercent'] as number,
        friendDailyReceivedCap: values['friend.dailyReceivedCap'] as number,
        friendTransferMinLevel: values['friend.transferMinLevel'] as number,
        friendRequestCooldownDays: values[
          'friend.requestCooldownDays'
        ] as number,
        friendRequestMaxDeclines: values['friend.requestMaxDeclines'] as number,
        friendRequestDailyCap: values['friend.requestDailyCap'] as number,
        maxPendingGoldRequests: values[
          'alliance.maxPendingGoldRequests'
        ] as number,
        forceMaxQuantity: values['force.maxQuantity'] as number,
        forceMaxTermDays: values['force.maxTermDays'] as number,
        forceMaxPillageBps: values['force.maxPillageBps'] as number,
        allianceLoanTermMinDays: values['alliance.loanTermMinDays'] as number,
        allianceLoanTermMaxDays: values['alliance.loanTermMaxDays'] as number,
        allianceLoanInterestMaxPercent: values[
          'alliance.loanInterestMaxPercent'
        ] as number,
        allianceMemberDailyCapMin: values[
          'alliance.memberDailyCapMin'
        ] as number,
        allianceMemberDailyCapMax: values[
          'alliance.memberDailyCapMax'
        ] as number,
        allianceLoanIncomeSharePercent: values[
          'alliance.loanIncomeSharePercent'
        ] as number,
        allianceReactivationMinLevel: values[
          'alliance.reactivationMinLevel'
        ] as number,
        allianceReactivationCostGold: values[
          'alliance.reactivationCostGold'
        ] as number,
        abuse: buildAbuseConfig(values),
        enableSupporter: values.ENABLE_SUPPORTER as boolean,
        enableAttacking: values.ENABLE_ATTACKING as boolean,
        attackLevelRange: values.ATTACK_LEVEL_RANGE as number,
        enableInfiltrations: values.ENABLE_INFILTRATIONS as boolean,
        enableAssassinations: values.ENABLE_ASSASSINATIONS as boolean,
        enableIntel: values.ENABLE_INTEL as boolean,
        enableSocial: values.ENABLE_SOCIAL as boolean,
        enableMessaging: values.ENABLE_MESSAGING as boolean,
        enableEnemies: values.ENABLE_ENEMIES as boolean,
        enableDesertion: values.ENABLE_DESERTION as boolean,
        enableReanimation: values.ENABLE_REANIMATION as boolean,
        enableGarrisonFatigue: values.ENABLE_GARRISON_FATIGUE as boolean,
        showKingdomMorale: values.SHOW_KINGDOM_MORALE as boolean,
        showDungeon: values.SHOW_DUNGEON as boolean,
        disableLogin: values.DISABLE_LOGIN as boolean,
        disableRegistration: values.DISABLE_REGISTRATION as boolean,
        maintenance: values.MAINTENANCE_MODE as RuntimeConfig['maintenance'],
      };
      if (useCache && requestEpoch === cacheEpoch) {
        const loadedAt = Date.now();
        lastGood = { value, loadedAt };
        cached = { value, expiresAt: loadedAt + CACHE_MS };
      }
      return value;
    } catch {
      if (
        useCache &&
        lastGood &&
        Date.now() - lastGood.loadedAt <= MAX_STALE_MS
      ) {
        if (useCache && requestEpoch === cacheEpoch)
          cached = { value: lastGood.value, expiresAt: Date.now() + 1000 };
        return lastGood.value;
      }
      throw new Error('Runtime configuration unavailable');
    } finally {
      if (pending === request) pending = null;
    }
  })();
  if (useCache) {
    pending = request;
    pendingEpoch = requestEpoch;
  }
  return request;
}

/** Clears all process-local state; intended for isolated tests and worker reset. */
export function resetRuntimeConfigCache() {
  cacheEpoch += 1;
  cached = null;
  lastGood = null;
  pending = null;
  pendingEpoch = -1;
}
