import { useEffect, useRef } from 'react';
import { alertService, AlertType } from '@/services/alert.service';
import { useSnackbar, SnackType } from '@/context/snackbar-context';
import { logError } from '@/utils/logger';

// Map alert types to snackbar types
const mapAlertTypeToSnackType = (type: AlertType['type']): SnackType => {
  switch (type) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'info':
      return 'info';
    case 'warn':
      return 'warning';
    case 'loading': // Use 'default' or 'info' for loading, customize icon/message
      return 'info'; // Or 'default'
    default:
      return 'default';
  }
};

const SnackbarBridge: React.FC = () => {
  const { snackbar } = useSnackbar();
  const loadingSnackIdRef = useRef<string | null>(null);
  const lastAlertTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    const subscription = alertService.alert.subscribe((alert) => {
      if (alert) {
        // Only show snackbar if this alert is new (by timestamp)
        const alertTimestamp = new Date(alert.timestamp).getTime();
        if (lastAlertTimestampRef.current === alertTimestamp) return;
        lastAlertTimestampRef.current = alertTimestamp;
        const snackType = mapAlertTypeToSnackType(alert.type);
        const options = {
          duration: alert.timeout ?? undefined,
          action: alert.showButton && alert.button ? {
            label: 'Action',
            onClick: () => {
              console.warn('SnackbarBridge action clicked, original button logic might need adjustment.');
            }
          } : undefined,
        };
        const messageString = typeof alert.message === 'string' ? alert.message : 'Notification';
        if (typeof alert.message !== 'string') {
          console.warn('SnackbarBridge received non-string message:', alert.message);
        }
        if (alert.type === 'loading') {
          if (loadingSnackIdRef.current) {
            snackbar.dismiss([loadingSnackIdRef.current]);
          }
          loadingSnackIdRef.current = snackbar.info(messageString, { ...options, duration: 999999 });
        } else {
          if (loadingSnackIdRef.current && (alert.type === 'success' || alert.type === 'error')) {
            snackbar.dismiss([loadingSnackIdRef.current]);
            loadingSnackIdRef.current = null;
          }
          switch (snackType) {
            case 'success':
              snackbar.success(messageString, options);
              break;
            case 'error':
              snackbar.error(messageString, options);
              break;
            case 'warning':
              snackbar.warning(messageString, options);
              break;
            case 'info':
              snackbar.info(messageString, options);
              break;
            default:
              snackbar(messageString, options);
          }
        }
        // Clear the alert after showing to prevent repeated notifications
        setTimeout(() => alertService.clear(), 100);
      } else {
        if (loadingSnackIdRef.current) {
          snackbar.dismiss([loadingSnackIdRef.current]);
          loadingSnackIdRef.current = null;
        }
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [snackbar]);

  // This component doesn't render anything itself
  return null;
};

export default SnackbarBridge;