import type { AbuseDetectionConfig } from '@/constants/abuseSignals';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { logWarn } from '@/utils/logger';

/** Longest a background abuse job waits for the runtime configuration. */
export const ABUSE_CONFIG_TIMEOUT_MS = 2000;
const WARNING_INTERVAL_MS = 60_000;

let lastGood: AbuseDetectionConfig | null = null;
let lastWarningAt = Number.NEGATIVE_INFINITY;

/** Clears the remembered configuration (tests). */
export const resetAbuseConfigCache = () => {
  lastGood = null;
  lastWarningAt = Number.NEGATIVE_INFINITY;
};

/**
 * The abuse thresholds for a background job, read with a time bound. The
 * runtime-configuration read shares one pending promise across callers and its
 * cache-miss query has no deadline, so a hung read would otherwise occupy every
 * runner slot. On timeout or failure this resolves to the last configuration
 * seen, or null when there is none (callers then treat detection as disabled
 * for that job), and logs at most once a minute. RuntimeConfig itself is
 * unchanged for every other caller.
 */
export async function getAbuseConfigBounded(
  ms: number = ABUSE_CONFIG_TIMEOUT_MS,
): Promise<AbuseDetectionConfig | null> {
  const config = await new Promise<AbuseDetectionConfig | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    getRuntimeConfig().then(
      (runtime) => {
        clearTimeout(timer);
        resolve(runtime.abuse ?? null);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
  if (config) {
    lastGood = config;
    return config;
  }
  const now = Date.now();
  if (now - lastWarningAt >= WARNING_INTERVAL_MS) {
    lastWarningAt = now;
    logWarn(
      lastGood
        ? 'Abuse config unavailable; using the last known configuration'
        : 'Abuse config unavailable; abuse detection skipped for this job',
    );
  }
  return lastGood;
}
