import {
  combineEventEffects,
  DEFAULT_GAME_EVENT_MODIFIERS,
  type GameEventEffects,
  type GameEventModifiers,
  parseEventEffects,
} from '@/constants/gameEvents';
import prisma from '@/lib/prisma';
import { GameEventType } from '@/lib/prisma-exports';
import { logError } from '@/utils/logger';

export type { GameEventModifiers } from '@/constants/gameEvents';

/** A running event as shown to players. */
export interface RunningGameEvent {
  id: number;
  name: string;
  description: string | null;
  startsAt: Date;
  /** Null when the event lasts until the era ends. */
  endsAt: Date | null;
  eraBound: boolean;
  effects: GameEventEffects;
}

const CACHE_TTL_MS = 5_000;
const MAX_ACTIVE_EVENTS = 100;
let cached: { expiresAt: number; value: RunningGameEvent[] } | null = null;
let pending: Promise<RunningGameEvent[]> | null = null;
let pendingEpoch = -1;
let cacheEpoch = 0;

export function invalidateGameEventModifiers(): void {
  cacheEpoch += 1;
  cached = null;
}

/**
 * Events running right now: ACTIVE, inside their time window, and, when bound
 * to an era, only while that era is still open.
 */
export async function getRunningGameEvents(): Promise<RunningGameEvent[]> {
  const nowMs = Date.now();
  if (cached && cached.expiresAt > nowMs) return cached.value;
  if (pending && pendingEpoch === cacheEpoch) return pending;

  const requestEpoch = cacheEpoch;
  let request: Promise<RunningGameEvent[]>;
  request = (async () => {
    try {
      const now = new Date();
      const rows = await prisma.gameEvent.findMany({
        where: {
          status: 'ACTIVE',
          startsAt: { lte: now },
          type: { in: [GameEventType.GOLD_MODIFIER, GameEventType.CUSTOM] },
          AND: [
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            { OR: [{ eraId: null }, { era: { endDate: null } }] },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          startsAt: true,
          endsAt: true,
          eraId: true,
          config: true,
        },
        orderBy: { startsAt: 'asc' },
        take: MAX_ACTIVE_EVENTS,
      });
      const result: RunningGameEvent[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        startsAt: row.startsAt,
        endsAt: row.endsAt ?? null,
        eraBound: row.eraId != null,
        effects: parseEventEffects(row.config),
      }));
      if (requestEpoch === cacheEpoch)
        cached = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
      return result;
    } catch (error) {
      logError('Failed to load active game events:', error);
      if (requestEpoch === cacheEpoch)
        cached = { value: [], expiresAt: Date.now() + CACHE_TTL_MS };
      return [];
    } finally {
      if (pending === request) pending = null;
    }
  })();
  pending = request;
  pendingEpoch = requestEpoch;
  return request;
}

/** Returns the combined modifiers from events active in their configured time window. */
export async function getGameEventModifiers(): Promise<GameEventModifiers> {
  const events = await getRunningGameEvents();
  if (!events.length)
    return { ...DEFAULT_GAME_EVENT_MODIFIERS, dailyCitizenGrants: [] };
  return combineEventEffects(
    events.map((event) => ({
      config: event.effects,
      eraBound: event.eraBound,
    })),
  );
}
