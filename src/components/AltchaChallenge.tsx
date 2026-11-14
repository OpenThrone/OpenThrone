import { useTranslation } from 'next-i18next';
import { useEffect, useRef } from 'react';

import classes from '@/components/AltchaChallenge.module.css';

/** The endpoint the widget fetches its signed challenge from. */
export const ALTCHA_CHALLENGE_URL = '/api/recruit/captcha-challenge';
/** Browser workers solving at once; more than this only slows the page down. */
const MAX_WORKERS = 4;

/** Why a challenge could not be completed. */
export type AltchaFailure = 'error' | 'expired';

interface AltchaChallengeProps {
  /** Called once, with the payload the recruit endpoints verify, when solved. */
  onVerified: (payload: string) => void;
  onFailed: (reason: AltchaFailure) => void;
}

/** Widget language codes for the site locales; English is built in. */
const WIDGET_LANGUAGE: Record<string, string> = { de: 'de', es: 'es-es' };

interface WidgetEvent extends Event {
  detail?: { payload?: string | null; state?: string };
}

/**
 * Self-hosted ALTCHA proof of work. Solving starts as soon as the widget
 * mounts (`auto="onload"`), so it is normally finished before the player acts.
 * The web component is loaded in the browser only and is created by hand: it
 * is not server-renderable, and React never owns its markup.
 */
export default function AltchaChallenge({
  onVerified,
  onFailed,
}: AltchaChallengeProps) {
  const { i18n } = useTranslation('common');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const callbacks = useRef({ onVerified, onFailed });
  const language = WIDGET_LANGUAGE[i18n?.language ?? 'en'] ?? 'en';

  useEffect(() => {
    callbacks.current = { onVerified, onFailed };
  });

  useEffect(() => {
    let disposed = false;
    let widget: HTMLElement | null = null;
    let settled = false;
    const settle = (finish: () => void) => {
      if (disposed || settled) return;
      settled = true;
      finish();
    };

    const mount = async () => {
      await import('altcha');
      await Promise.all([
        import('altcha/i18n/de'),
        import('altcha/i18n/es-es'),
      ]);
      const host = hostRef.current;
      if (disposed || !host) return;
      widget = document.createElement('altcha-widget');
      widget.setAttribute('challenge', ALTCHA_CHALLENGE_URL);
      widget.setAttribute('auto', 'onload');
      widget.setAttribute('language', language);
      widget.setAttribute(
        'configuration',
        JSON.stringify({
          // The check is the proof of work only; nothing else is collected.
          humanInteractionSignature: false,
          minDuration: 0,
          workers: Math.min(navigator.hardwareConcurrency || 2, MAX_WORKERS),
        }),
      );
      widget.addEventListener('verified', (event) => {
        const payload = (event as WidgetEvent).detail?.payload;
        if (payload) settle(() => callbacks.current.onVerified(payload));
      });
      widget.addEventListener('expired', () =>
        settle(() => callbacks.current.onFailed('expired')),
      );
      widget.addEventListener('statechange', (event) => {
        if ((event as WidgetEvent).detail?.state === 'error')
          settle(() => callbacks.current.onFailed('error'));
      });
      host.append(widget);
    };

    mount().catch(() => settle(() => callbacks.current.onFailed('error')));
    return () => {
      disposed = true;
      widget?.remove();
    };
  }, [language]);

  return <div ref={hostRef} className={classes.host} />;
}
