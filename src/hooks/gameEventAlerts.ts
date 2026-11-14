/**
 * Turns the per-user realtime pushes (attack, spy, gold and friend notices)
 * into toast content. Pure so it can be tested without React or a socket;
 * `useGameEventAlerts` wires it to the shared realtime listener registry.
 *
 * The server sends English `message` text for old clients; the toast is built
 * from the payload's fields instead, so it follows the player's language.
 */

export type GameAlertEvent =
  | 'attackNotification'
  | 'spyDefenseNotification'
  | 'goldTransferReceived'
  | 'friendRequestNotification'
  | 'goldRequestNotification';

export const GAME_ALERT_EVENTS: readonly GameAlertEvent[] = [
  'attackNotification',
  'spyDefenseNotification',
  'goldTransferReceived',
  'friendRequestNotification',
  'goldRequestNotification',
];

/** Events that change the player's own numbers, so the sidebar refetches. */
export const STATE_CHANGING_ALERT_EVENTS: ReadonlySet<GameAlertEvent> = new Set(
  ['attackNotification', 'spyDefenseNotification', 'goldTransferReceived'],
);

export type GameAlert = {
  severity: 'error' | 'success' | 'info';
  title: string;
  message: string;
  link?: { href: string; label: string };
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

const SPY_MISSIONS = new Set(['INTEL', 'ASSASSINATE', 'INFILTRATE']);

const asRecord = (payload: unknown): Record<string, unknown> =>
  payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};

const positiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const nameOf = (value: unknown, t: Translate): string =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : t('gameAlerts.someone');

/** Formats a whole gold amount (sent as a string) for the player's locale. */
export const formatGoldAmount = (value: unknown, locale: string): string => {
  const text =
    typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  if (!/^\d+$/.test(text)) return text;
  try {
    return BigInt(text).toLocaleString(locale);
  } catch {
    return text;
  }
};

/** Builds the toast for one realtime push, or null for a malformed payload. */
export const describeGameAlert = (
  event: GameAlertEvent,
  payload: unknown,
  t: Translate,
  locale: string,
): GameAlert | null => {
  const data = asRecord(payload);
  switch (event) {
    case 'attackNotification': {
      const battleId = positiveId(data.battleId);
      if (!battleId) return null;
      return {
        severity: 'error',
        title: t('gameAlerts.attackTitle'),
        message: t('gameAlerts.attack'),
        link: {
          href: `/battle/results/${battleId}`,
          label: t('gameAlerts.viewReport'),
        },
      };
    }
    case 'spyDefenseNotification': {
      const logId = positiveId(data.attackLogId);
      const mission = String(data.missionType ?? '');
      if (!logId || !SPY_MISSIONS.has(mission)) return null;
      return {
        severity: 'success',
        title: t('gameAlerts.spyTitle'),
        message: t('gameAlerts.spy', {
          mission: t(`gameAlerts.missions.${mission}`),
        }),
        link: {
          href: `/battle/results/${logId}`,
          label: t('gameAlerts.viewReport'),
        },
      };
    }
    case 'goldTransferReceived': {
      const amount = formatGoldAmount(data.amount, locale);
      if (!amount) return null;
      return {
        severity: 'success',
        title: t('gameAlerts.goldTitle'),
        message: t('gameAlerts.gold', {
          name: nameOf(data.senderName, t),
          amount,
        }),
        link: {
          href: '/structures/bank/history',
          label: t('gameAlerts.viewBank'),
        },
      };
    }
    case 'friendRequestNotification':
      return {
        severity: 'info',
        title: t('gameAlerts.friendTitle'),
        message: t('gameAlerts.friend', { name: nameOf(data.senderName, t) }),
        link: { href: '/social/requests', label: t('gameAlerts.viewRequests') },
      };
    case 'goldRequestNotification':
      return {
        severity: 'info',
        title: t('gameAlerts.goldRequestTitle'),
        message: t('gameAlerts.goldRequest', {
          name: nameOf(data.senderName, t),
        }),
        link: { href: '/social/requests', label: t('gameAlerts.viewRequests') },
      };
    default:
      return null;
  }
};

/**
 * Remembers which pushes this tab already showed. Socket.IO can redeliver
 * after a reconnect, and the server's `hash` identifies one notice.
 */
export const createAlertDeduper = (limit = 50) => {
  const seen: string[] = [];
  return (hash: unknown): boolean => {
    if (typeof hash !== 'string' || !hash) return true;
    if (seen.includes(hash)) return false;
    seen.push(hash);
    if (seen.length > limit) seen.shift();
    return true;
  };
};
