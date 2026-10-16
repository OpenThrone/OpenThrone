import prisma from '@/lib/prisma';
import { GameEventType } from '@/lib/prisma-exports';
import { logError } from '@/utils/logger';

export interface GameEventModifiers {
  goldMultiplier: number;
  xpMultiplier: number;
}

const CACHE_TTL_MS = 5_000;
const MAX_ACTIVE_EVENTS = 100;
const DEFAULT_MODIFIERS: GameEventModifiers = {
  goldMultiplier: 1,
  xpMultiplier: 1,
};
let cached: { expiresAt: number; value: GameEventModifiers } | null = null;
let pending: Promise<GameEventModifiers> | null = null;
let pendingEpoch = -1;
let cacheEpoch = 0;

export function invalidateGameEventModifiers(): void {
  cacheEpoch += 1;
  cached = null;
}

function validMultiplier(value: unknown): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0.1 &&
    value <= 10
    ? value
    : 1;
}

/** Returns the combined modifiers from events active in their configured time window. */
export async function getGameEventModifiers(): Promise<GameEventModifiers> {
  const nowMs = Date.now();
  if (cached && cached.expiresAt > nowMs) return { ...cached.value };
  if (pending && pendingEpoch === cacheEpoch) return pending;

  const requestEpoch = cacheEpoch;
  let request: Promise<GameEventModifiers>;
  request = (async () => {
    try {
      const now = new Date();
      const events: Array<{ type: GameEventType; config: unknown }> =
        await prisma.gameEvent.findMany({
          where: {
            status: 'ACTIVE',
            startsAt: { lte: now },
            endsAt: { gt: now },
            type: { in: [GameEventType.GOLD_MODIFIER, GameEventType.CUSTOM] },
          },
          select: { type: true, config: true },
          orderBy: { startsAt: 'asc' },
          take: MAX_ACTIVE_EVENTS,
        });
      const result = events.reduce(
        (modifiers, event) => {
          const config =
            event.config && typeof event.config === 'object'
              ? (event.config as Record<string, unknown>)
              : {};
          if (event.type === GameEventType.GOLD_MODIFIER) {
            modifiers.goldMultiplier = Math.min(
              10,
              Math.max(
                0.1,
                modifiers.goldMultiplier *
                  validMultiplier(config.goldMultiplier),
              ),
            );
          }
          if (event.type === GameEventType.CUSTOM) {
            modifiers.xpMultiplier = Math.min(
              10,
              Math.max(
                0.1,
                modifiers.xpMultiplier * validMultiplier(config.xpMultiplier),
              ),
            );
          }
          return modifiers;
        },
        { ...DEFAULT_MODIFIERS },
      );
      if (requestEpoch === cacheEpoch)
        cached = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
      return result;
    } catch (error) {
      logError('Failed to load active game event modifiers:', error);
      const fallback = { ...DEFAULT_MODIFIERS };
      if (requestEpoch === cacheEpoch)
        cached = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
      return fallback;
    } finally {
      if (pending === request) pending = null;
    }
  })();
  pending = request;
  pendingEpoch = requestEpoch;
  return request;
}
