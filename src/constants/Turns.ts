import { getTurnIntervalMinutes } from '@/utils/timefunctions';

/**
 * Attack turns are granted on this clock; the sidebar countdown reads it too.
 * 30 minutes unless the server sets TURN_INTERVAL_MINUTES (accelerated test
 * servers).
 */
export const ATTACK_TURN_INTERVAL_MINUTES = getTurnIntervalMinutes();
