import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  faCheck,
  faExclamation,
  faInfo,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { NotificationData } from '@mantine/notifications';
import { Notifications, notifications } from '@mantine/notifications';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useRef } from 'react';

import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { AlertType } from '@/services/Alert.service';
import { alertService } from '@/services/Alert.service';
import { toastsToHideOnNavigation } from '@/utils/toastScope';

import classes from './GameNotifications.module.css';

/** Auto-dismiss delay when an alert does not pass its own timeout. */
export const DEFAULT_TOAST_DURATION = 6000;
const MAX_VISIBLE_TOASTS = 6;
const TRANSITION_MS = 250;

const TONES: Record<
  Exclude<AlertType['type'], 'loading'>,
  { color: string; icon: IconDefinition }
> = {
  success: { color: 'green', icon: faCheck },
  error: { color: 'red', icon: faXmark },
  info: { color: 'blue', icon: faInfo },
  warn: { color: 'yellow', icon: faExclamation },
};

const TOAST_CLASSES = {
  root: classes.root,
  title: classes.title,
  description: classes.description,
  icon: classes.icon,
  loader: classes.loader,
  closeButton: classes.closeButton,
};

/**
 * The single toast surface: renders every `alertService` call through Mantine
 * notifications with OpenThrone tokens. Mount once inside MantineProvider.
 */
export default function GameNotifications() {
  const { t } = useTranslation('common');
  const reduceMotion = usePrefersReducedMotion();
  const loadingIdRef = useRef<string | null>(null);
  const lastAlertRef = useRef<AlertType | null>(null);
  const lastTypeRef = useRef<AlertType['type'] | null>(null);
  /** Toasts that belong to the page they were raised on, by id → shown at. */
  const pageToastsRef = useRef(new Map<string, number>());
  const router = useRouter();

  // Notices describe the page that raised them; leaving it dismisses them
  // instead of carrying "Units trained" onto the Bank (#277).
  useEffect(() => {
    const onRouteChangeStart = () => {
      const pageToasts = pageToastsRef.current;
      for (const id of toastsToHideOnNavigation(pageToasts, Date.now())) {
        notifications.hide(id);
        pageToasts.delete(id);
      }
    };
    router.events.on('routeChangeStart', onRouteChangeStart);
    return () => router.events.off('routeChangeStart', onRouteChangeStart);
  }, [router.events]);

  useEffect(() => {
    const subscription = alertService.alert.subscribe((alert) => {
      if (!alert) {
        // A cleared loading alert dismisses its toast; other toasts time out.
        if (loadingIdRef.current && lastTypeRef.current === 'loading') {
          notifications.hide(loadingIdRef.current);
          loadingIdRef.current = null;
        }
        lastTypeRef.current = null;
        return;
      }

      // The subject replays its current alert to new subscribers (StrictMode,
      // re-subscribe on locale change); skip only that same object, so two
      // alerts raised in the same millisecond both show.
      if (lastAlertRef.current === alert) return;
      lastAlertRef.current = alert;
      lastTypeRef.current = alert.type;
      const timestamp = new Date(alert.timestamp).getTime();

      const base: NotificationData = {
        title: alert.title,
        message: alert.message,
        classNames: TOAST_CLASSES,
        closeButtonProps: { 'aria-label': t('dismissNotification') },
      };

      if (alert.type === 'loading') {
        if (loadingIdRef.current) notifications.hide(loadingIdRef.current);
        loadingIdRef.current = `alert-loading-${timestamp}`;
        notifications.show({
          ...base,
          id: loadingIdRef.current,
          loading: true,
          color: 'gray',
          autoClose: false,
          withCloseButton: false,
        });
        // Keep the loading alert current so updateLoading can resolve it.
        return;
      }

      const tone = TONES[alert.type];
      const data: NotificationData = {
        ...base,
        color: tone.color,
        icon: <FontAwesomeIcon icon={tone.icon} aria-hidden />,
        loading: false,
        autoClose: alert.timeout ?? DEFAULT_TOAST_DURATION,
        withCloseButton: true,
      };

      let toastId: string;
      if (
        loadingIdRef.current &&
        (alert.type === 'success' || alert.type === 'error')
      ) {
        toastId = loadingIdRef.current;
        notifications.update({ ...data, id: toastId });
        loadingIdRef.current = null;
      } else {
        // An info/warn replaces the loading alert, so updateLoading can no
        // longer resolve it: dismiss the spinner instead of orphaning it.
        if (loadingIdRef.current) {
          notifications.hide(loadingIdRef.current);
          loadingIdRef.current = null;
        }
        toastId = notifications.show(data);
      }
      if (!alert.showAfterRedirect) {
        pageToastsRef.current.set(toastId, Date.now());
      }

      // Clear so a late subscriber does not replay this alert.
      setTimeout(() => alertService.clear(), 100);
    });
    return () => subscription.unsubscribe();
  }, [t]);

  return (
    <Notifications
      position="bottom-right"
      limit={MAX_VISIBLE_TOASTS}
      zIndex={1200}
      transitionDuration={reduceMotion ? 0 : TRANSITION_MS}
    />
  );
}
