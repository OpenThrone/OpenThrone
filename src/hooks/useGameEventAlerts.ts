import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { createElement, Fragment, useEffect, useRef } from 'react';

import {
  createAlertDeduper,
  describeGameAlert,
  GAME_ALERT_EVENTS,
  type GameAlertEvent,
  STATE_CHANGING_ALERT_EVENTS,
} from '@/hooks/gameEventAlerts';
import { alertService } from '@/services/Alert.service';

type Listen = (event: string, listener: Function) => void;

/**
 * Shows a toast when another player attacks, spies on, pays or messages the
 * signed-in player (attack, spy, gold and friend pushes on either realtime
 * transport), and calls `onStateChanged` when the push changed the player's
 * own numbers so the sidebar refetches.
 */
export default function useGameEventAlerts({
  enabled,
  addEventListener,
  removeEventListener,
  onStateChanged,
}: {
  enabled: boolean;
  addEventListener: Listen;
  removeEventListener: Listen;
  onStateChanged: () => void;
}) {
  const { t, i18n } = useTranslation('common');
  const locale = i18n?.language || 'en';
  const latest = useRef({ t, locale, onStateChanged });
  latest.current = { t, locale, onStateChanged };
  const dedupe = useRef(createAlertDeduper());

  useEffect(() => {
    if (!enabled) return undefined;
    const handlers = GAME_ALERT_EVENTS.map((event: GameAlertEvent) => {
      const handler = (payload: unknown) => {
        const hash = (payload as { hash?: unknown } | null)?.hash;
        if (!dedupe.current(hash)) return;
        const { t: translate, locale: lang } = latest.current;
        const alert = describeGameAlert(event, payload, translate, lang);
        if (!alert) return;
        const message = alert.link
          ? createElement(
              Fragment,
              null,
              alert.message,
              ' ',
              createElement(
                Link,
                { href: alert.link.href, className: 'underline font-semibold' },
                alert.link.label,
              ),
            )
          : alert.message;
        alertService.notify(alert.severity, message, {
          title: alert.title,
          timeout: 10000,
        });
        if (STATE_CHANGING_ALERT_EVENTS.has(event)) {
          latest.current.onStateChanged();
        }
      };
      addEventListener(event, handler);
      return [event, handler] as const;
    });
    return () => {
      handlers.forEach(([event, handler]) =>
        removeEventListener(event, handler),
      );
    };
  }, [enabled, addEventListener, removeEventListener]);
}
