import {
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
} from '@/constants/runtimeSettings';
import prisma from '@/lib/prisma';

export interface RuntimeConfig {
  inactivityRemindersEnabled?: boolean;
  inactivityAutoAnonymizeEnabled?: boolean;
  emailOutboxEnabled?: boolean;
  emailOutboxRatePerMinute?: number;
  /** Citizens a player can gain per day by recruiting (one per recruit). */
  recruitDailyCap: number;
  /** Days of new-player battle protection after joining an era (1-60). */
  protectionDurationDays: number;
  enableAttacking: boolean;
  attackLevelRange: number;
  enableInfiltrations: boolean;
  enableAssassinations: boolean;
  enableIntel: boolean;
  enableSocial: boolean;
  /** Players may message each other; when off only admins and moderators can. */
  enableMessaging: boolean;
  enableEnemies: boolean;
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

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (pending && pendingEpoch === cacheEpoch) return pending;

  const requestEpoch = cacheEpoch;
  let request: Promise<RuntimeConfig>;
  request = (async () => {
    try {
      // Server settings are the only stored source; feature flag rows were
      // folded into them (migration 20261019010000_feature_flags_into_settings).
      const rows = await prisma.serverSetting.findMany({
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
        recruitDailyCap: values['recruit.dailyCap'] as number,
        protectionDurationDays: values['era.protectionDurationDays'] as number,
        enableAttacking: values.ENABLE_ATTACKING as boolean,
        attackLevelRange: values.ATTACK_LEVEL_RANGE as number,
        enableInfiltrations: values.ENABLE_INFILTRATIONS as boolean,
        enableAssassinations: values.ENABLE_ASSASSINATIONS as boolean,
        enableIntel: values.ENABLE_INTEL as boolean,
        enableSocial: values.ENABLE_SOCIAL as boolean,
        enableMessaging: values.ENABLE_MESSAGING as boolean,
        enableEnemies: values.ENABLE_ENEMIES as boolean,
        disableLogin: values.DISABLE_LOGIN as boolean,
        disableRegistration: values.DISABLE_REGISTRATION as boolean,
        maintenance: values.MAINTENANCE_MODE as RuntimeConfig['maintenance'],
      };
      if (requestEpoch === cacheEpoch) {
        const loadedAt = Date.now();
        lastGood = { value, loadedAt };
        cached = { value, expiresAt: loadedAt + CACHE_MS };
      }
      return value;
    } catch {
      if (lastGood && Date.now() - lastGood.loadedAt <= MAX_STALE_MS) {
        if (requestEpoch === cacheEpoch)
          cached = { value: lastGood.value, expiresAt: Date.now() + 1000 };
        return lastGood.value;
      }
      throw new Error('Runtime configuration unavailable');
    } finally {
      if (pending === request) pending = null;
    }
  })();
  pending = request;
  pendingEpoch = requestEpoch;
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
