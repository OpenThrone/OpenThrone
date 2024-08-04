import { BehaviorSubject } from 'rxjs';

export interface AlertType {
  type: 'success' | 'error';
  message: string;
  showAfterRedirect: boolean;
}

const alertSubject = new BehaviorSubject<AlertType | null>(null);

function showAlert(
  type: 'success' | 'error',
  message: string,
  showAfterRedirect = false
): void {
  alertSubject.next({ type, message, showAfterRedirect });
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
