import { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';

export interface AlertType {
  type: 'success' | 'error';
  message: ReactNode;
  showAfterRedirect: boolean;
  showButton: boolean;
  button: ReactNode;
}

const alertSubject = new BehaviorSubject<AlertType | null>(null);

function showAlert(
  type: 'success' | 'error',
  message: ReactNode,
  showAfterRedirect = false,
  showButton = false,
  button: ReactNode = ''
): void {
  alertSubject.next({ type, message, showAfterRedirect, showButton, button });
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
  success: (message: ReactNode, showAfterRedirect?: boolean) =>
    showAlert('success', message, showAfterRedirect),
  error: (message: ReactNode, showAfterRedirect?: boolean, showButton: boolean = false, button: ReactNode = '' ) =>
    showAlert('error', message, showAfterRedirect, showButton, button),
  clear,
};
