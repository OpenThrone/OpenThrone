import {
  combineEventEffects,
  DEFAULT_GAME_EVENT_MODIFIERS,
  type GameEventEffects,
  type GameEventModifiers,
  parseEventEffects,
} from '@/constants/gameEvents';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
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
 * A transaction reader bypasses process caches to avoid waiting for another pool connection.
 */
export async function getRunningGameEvents(
  db?: Pick<Prisma.TransactionClient, 'gameEvent'>,
): Promise<RunningGameEvent[]> {
  const useCache = !db;
  const nowMs = Date.now();
  if (useCache && cached && cached.expiresAt > nowMs) return cached.value;
  if (useCache && pending && pendingEpoch === cacheEpoch) return pending;

  const requestEpoch = cacheEpoch;
  let request: Promise<RunningGameEvent[]>;
  request = (async () => {
    try {
      const now = new Date();
      const rows = await (db ?? prisma).gameEvent.findMany({
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
      if (useCache && requestEpoch === cacheEpoch)
        cached = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
      return result;
    } catch (error) {
      logError('Failed to load active game events:', error);
      if (useCache && requestEpoch === cacheEpoch)
        cached = { value: [], expiresAt: Date.now() + CACHE_TTL_MS };
      return [];
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

/** Returns the combined modifiers from events active in their configured time window. */
export async function getGameEventModifiers(
  db?: Pick<Prisma.TransactionClient, 'gameEvent'>,
): Promise<GameEventModifiers> {
  const events = await getRunningGameEvents(db);
  if (!events.length)
    return { ...DEFAULT_GAME_EVENT_MODIFIERS, dailyCitizenGrants: [] };
  return combineEventEffects(
    events.map((event) => ({
      config: event.effects,
      eraBound: event.eraBound,
    })),
  );
}

/** Capture the same event set used to calculate a battle's modifiers. */
export async function getBattleGameEventContext(
  db?: Pick<Prisma.TransactionClient, 'gameEvent'>,
) {
  const events = await getRunningGameEvents(db);
  const modifiers = combineEventEffects(
    events.map((event) => ({
      config: event.effects,
      eraBound: event.eraBound,
    })),
  );
  return {
    modifiers,
    snapshot: {
      version: 1 as const,
      capturedAt: new Date().toISOString(),
      events: events.map((event) => ({
        id: event.id,
        name: event.name,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt?.toISOString() ?? null,
        effects: event.effects,
      })),
      appliedXpMultiplier: modifiers.xpMultiplier,
    },
  };
}
