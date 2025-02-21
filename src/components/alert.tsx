/* eslint-disable jsx-a11y/control-has-associated-label */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { AlertType } from '../services/alert.service';
import { alertService } from '../services/alert.service';
import { Alert, Text } from '@mantine/core';

const AlertComponent: React.FC = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [alert, setAlert] = useState<AlertType | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    // subscribe to new alert notifications
    const subscription = alertService.alert.subscribe((newAlert) => {
      setAlert(newAlert);
      if (newAlert && newAlert.timeout) {
        setTimeLeft(newAlert.timeout / 1000);
        const interval = setInterval(() => {
          setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
        }, 1000);

        return () => clearInterval(interval);
      }
    });

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

  const handleClose = async () => {
    alertService.clear();
    alertService.clearAlertHash();

    try {
      await fetch('/api/account/updateLastActive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session?.user?.id }), // Or email / displayName if preferred
      });
    } catch (error) {
      console.error('Failed to update last active:', error);
    }
  };


  return (
    <div className="container mx-auto px-4">
      <div className="my-3">
        <Alert variant='filled' className={'alert-' + alert.type} title={alert.type.toUpperCase()} withCloseButton onClose={handleClose}>
          <Text className='text-shadow text-shadow-xs text-gray-800 w-auto'>{alert.message}</Text>
          {timeLeft !== null && <Text c='gray' size='sm' className=' mt-1'>Alert Clearing In: {timeLeft} seconds</Text>}
          {alert.showButton && (
            <>
              {alert.button}
            </>
          )}
        </Alert>
      </div>
    </div>
  );
};

export default AlertComponent;
