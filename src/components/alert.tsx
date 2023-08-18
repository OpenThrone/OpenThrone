/* eslint-disable jsx-a11y/control-has-associated-label */
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { alertService } from '../services';

interface AlertType {
  type: string;
  message: string;
}

const Alert: React.FC = () => {
  const router = useRouter();
  const [alert, setAlert] = useState<AlertType | null>(null);

  useEffect(() => {
    // subscribe to new alert notifications
    const subscription = alertService.alert.subscribe(
      (nAlert: AlertType | null) => {
        setAlert(nAlert);
      }
    );

    // unsubscribe when the component unmounts
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // clear alert on location change
    alertService.clear();
  }, [router]);

  if (!alert) return null;

  return (
    <div className="container mx-auto px-4">
      <div className="my-3">
        <div
          className={`relative rounded px-3 py-2 ${
            alert.type === 'alert-success' ? 'bg-green-500 text-white' : ''
          } ${alert.type === 'alert-error' ? 'bg-red-500 text-white' : ''} ${
            alert.type
          }`}
        >
          {alert.message}
          <button
            type="button"
            className="absolute inset-y-0 right-0 px-4 py-3"
            onClick={() => alertService.clear()}
          >
            <svg
              className="h-6 w-6 fill-current text-white"
              role="button"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
            >
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-2.779a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Alert;
