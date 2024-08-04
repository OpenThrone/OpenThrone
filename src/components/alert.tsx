/* eslint-disable jsx-a11y/control-has-associated-label */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { AlertType } from '../services/alert.service';
import { alertService } from '../services/alert.service';
import { faRectangleXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Alert, Text } from '@mantine/core';

const AlertComponent: React.FC = () => {
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
        <Alert variant='filled' className={'alert-' + alert.type} title={alert.type.toUpperCase()} withCloseButton onClose={alertService.clear}>
          <Text className='text-shadow-xs text-gray-800'>{alert.message}</Text>
        </Alert>
      </div>
    </div>
  );
};

export default AlertComponent;
