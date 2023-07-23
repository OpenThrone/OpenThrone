import { BehaviorSubject } from 'rxjs';

interface AlertType {
  type: 'alert-success' | 'alert-danger';
  message: string;
  showAfterRedirect: boolean;
}

const alertSubject = new BehaviorSubject<AlertType | null>(null);

function success(message: string, showAfterRedirect = false): void {
  alertSubject.next({
    type: 'alert-success',
    message,
    showAfterRedirect,
  });
}

function error(message: string, showAfterRedirect = false): void {
  alertSubject.next({
    type: 'alert-danger',
    message,
    showAfterRedirect,
  });
}

// clear alerts
function clear(): void {
  // if showAfterRedirect flag is true the alert is not cleared
  // for one route change (e.g. after successful registration)
  let alert = alertSubject.value;
  if (alert?.showAfterRedirect) {
    alert.showAfterRedirect = false;
  } else {
    alert = null;
  }
  alertSubject.next(alert);
}

export const alertService = {
  alert: alertSubject.asObservable(),
  success,
  error,
  clear,
};
