/* eslint-disable jsx-a11y/control-has-associated-label */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { AlertType } from '../services/alert.service';
import { alertService } from '../services/alert.service';

const Alert: React.FC = () => {
  const router = useRouter();
  const [alert, setAlert] = useState<AlertType | null>(null);

  useEffect(() => {
    // subscribe to new alert notifications
    const subscription = alertService.alert.subscribe(setAlert);

    // unsubscribe when the component unmounts
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // clear alert on location change, respecting the showAfterRedirect flag
    alertService.clear();
  }, [router]);

  if (!alert) return null;

  const alertClassNames = {
    'alert-success': 'bg-green-500 text-white',
    'alert-error': 'bg-red-500 text-white',
  };

  return (
    <div className="container mx-auto px-4">
      <div className="my-3">
        <div
          className={`relative rounded px-3 py-2 ${
            alertClassNames[alert.type]
          } ${alert.type}`}
        >
          {alert.message}
          <button
            type="button"
            className="absolute inset-y-0 right-0 px-4 py-3"
            onClick={alertService.clear}
          >
            {/* SVG Component */}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Alert;
