import { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';

export interface AlertType {
  type: 'success' | 'error' | 'info' | 'warn' | 'loading';
  message: ReactNode;
  timestamp: Date;
  showAfterRedirect: boolean;
  showButton: boolean;
  button: ReactNode;
  timeout?: number;
}

const alertSubject = new BehaviorSubject<AlertType | null>(null);
let defaultTimeout: number | null = null;

function generateHash(obj: any): string {
  const jsonString = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

function showAlert(
  type: 'success' | 'error' | 'info' | 'warn' | 'loading',
  message: ReactNode,
  showAfterRedirect: boolean = false,
  showButton: boolean = false,
  button: ReactNode = '',
  timeout: number | null = defaultTimeout
): void {
  const alert: AlertType = {
    type,
    message,
    timestamp: new Date(),
    showAfterRedirect: showAfterRedirect ?? false,
    showButton: showButton ?? false,
    button,
    timeout: timeout ?? null,
  };

  const alertHash = generateHash(alert);
  const localStorageKey = 'alertHash';
  const storedHash = localStorage.getItem(localStorageKey);

  if (storedHash !== alertHash) {
    localStorage.setItem(localStorageKey, alertHash);
    alertSubject.next(alert);
  }

  if (timeout !== null && type !== 'loading') {
    setTimeout(clear, timeout);
  }
}

// Function to clear the alert hash from localStorage
function clearAlertHash(): void {
  localStorage.removeItem('alertHash');
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
  success: (message: ReactNode, showAfterRedirect: boolean = false, timeout: number | null = defaultTimeout) =>
    showAlert('success', message, showAfterRedirect, false, '', timeout),
  error: (message: ReactNode, showAfterRedirect?: boolean, showButton: boolean = false, button: ReactNode = '', timeout?: number) =>
    showAlert('error', message, showAfterRedirect, showButton, button, timeout),
  info: (message: ReactNode, showAfterRedirect: boolean = false, timeout: number | null = defaultTimeout) =>
    showAlert('info', message, showAfterRedirect, false, '', timeout),
  warn: (message: ReactNode, showAfterRedirect: boolean = false, timeout: number | null = defaultTimeout) =>
    showAlert('warn', message, showAfterRedirect, false, '', timeout),
  loading: (message: ReactNode, showAfterRedirect: boolean = false, timeout: number | null = null) =>
    showAlert('loading', message, showAfterRedirect, false, '', timeout),
  clear,
  setDefaultTimeout: (timeout: number | null) => {
    defaultTimeout = timeout;
  },
  clearAlertHash,
  updateLoading: (newType: 'success' | 'error', message: ReactNode, timeout: number | null = defaultTimeout) => {
    const currentAlert = alertSubject.value;
    if (currentAlert?.type === 'loading') {
      showAlert(newType, message, false, false, '', timeout);
    }
  }
};