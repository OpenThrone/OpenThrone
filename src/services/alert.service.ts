import { BehaviorSubject } from 'rxjs';

export interface AlertType {
  type: 'success' | 'error';
  message: string;
  showAfterRedirect: boolean;
  showButton: boolean;
  button: string;
}

const alertSubject = new BehaviorSubject<AlertType | null>(null);

function showAlert(
  type: 'success' | 'error',
  message: string,
  showAfterRedirect = false,
  showButton = false,
  button: string = ''
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
  success: (message: string, showAfterRedirect?: boolean) =>
    showAlert('success', message, showAfterRedirect),
  error: (message: string, showAfterRedirect?: boolean) =>
    showAlert('error', message, showAfterRedirect),
  clear,
};
