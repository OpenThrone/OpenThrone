import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import { z } from 'zod';

import { logDebug } from '@/utils/logger';

const AlertSchema = z.object({
  type: z.enum(['success', 'error', 'info', 'warn', 'loading']),
  message: z.custom<ReactNode>(),
  timestamp: z.date(),
  showAfterRedirect: z.boolean(),
  showButton: z.boolean(),
  button: z.custom<ReactNode>(),
  timeout: z.number().optional().nullable(),
});

export type AlertType = z.infer<typeof AlertSchema>;

const alertSubject = new BehaviorSubject<AlertType | null>(null);
let defaultTimeout: number | null = null;

function showAlert(
  type: 'success' | 'error' | 'info' | 'warn' | 'loading',
  message: ReactNode,
  showAfterRedirect: boolean = false,
  showButton: boolean = false,
  button: ReactNode = '',
  timeout: number | null = defaultTimeout,
): void {
  const alert = AlertSchema.parse({
    type,
    message,
    timestamp: new Date(),
    showAfterRedirect: showAfterRedirect ?? false,
    showButton: showButton ?? false,
    button,
    timeout: timeout ?? null,
  });

  // Always emit the alert, do not deduplicate by hash/localStorage
  alertSubject.next(alert);

  logDebug(
    'AlertService',
    'showAlert',
    {
      type,
      message,
      showAfterRedirect,
      showButton,
      button,
      timeout,
    } as AlertType,
    'Alert emitted',
  );

  if (timeout !== null && type !== 'loading') {
    setTimeout(clear, timeout);
  }
}

// clear alerts
function clear(): void {
  const alert = alertSubject.value;
  if (alert?.showAfterRedirect) {
    alert.showAfterRedirect = false;
  } else {
    alertSubject.next(null);
  }
}

export const alertService = {
  alert: alertSubject.asObservable(),
  success: (
    message: ReactNode,
    showAfterRedirect: boolean = false,
    timeout: number | null = defaultTimeout,
  ) => showAlert('success', message, showAfterRedirect, false, '', timeout),
  error: (
    message: ReactNode,
    showAfterRedirect?: boolean,
    showButton: boolean = false,
    button: ReactNode = '',
    timeout?: number,
  ) =>
    showAlert('error', message, showAfterRedirect, showButton, button, timeout),
  info: (
    message: ReactNode,
    showAfterRedirect: boolean = false,
    timeout: number | null = defaultTimeout,
  ) => showAlert('info', message, showAfterRedirect, false, '', timeout),
  warn: (
    message: ReactNode,
    showAfterRedirect: boolean = false,
    timeout: number | null = defaultTimeout,
  ) => showAlert('warn', message, showAfterRedirect, false, '', timeout),
  loading: (
    message: ReactNode,
    showAfterRedirect: boolean = false,
    timeout: number | null = null,
  ) => showAlert('loading', message, showAfterRedirect, false, '', timeout),
  clear,
  setDefaultTimeout: (timeout: number | null) => {
    defaultTimeout = timeout;
  },
  updateLoading: (
    newType: 'success' | 'error',
    message: ReactNode,
    timeout: number | null = defaultTimeout,
  ) => {
    const currentAlert = alertSubject.value;
    if (currentAlert?.type === 'loading') {
      showAlert(newType, message, false, false, '', timeout);
    }
  },
};
