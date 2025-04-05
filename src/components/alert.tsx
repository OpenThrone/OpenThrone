/* eslint-disable jsx-a11y/control-has-associated-label */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { AlertType } from '../services/alert.service';
import { alertService } from '../services/alert.service';
import { Text, CloseButton, Flex, Loader } from '@mantine/core';
import { logError } from '@/utils/logger';
import ContentCard from './ContentCard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCheckCircle, 
  faExclamationCircle, 
  faInfoCircle, 
  faExclamationTriangle, 
  faTimes 
} from '@fortawesome/free-solid-svg-icons';

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

  const handleClose = async () => {
    alertService.clear();
    alertService.clearAlertHash();

    try {
      await fetch('/api/account/updateLastActive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session?.user?.id }),
      });
    } catch (error) {
      logError('Failed to update last active:', error);
    }
  };

  // Get alert styling based on type
  const getAlertStyles = () => {
    switch (alert.type) {
      case 'success':
        return {
          icon: <FontAwesomeIcon icon={faCheckCircle} size="lg" />,
          borderColor: 'border-green-500',
          bgColor: 'bg-green-700/20',
          textColor: 'text-green-300',
          iconColor: 'text-green-400'
        };
      case 'error':
        return {
          icon: <FontAwesomeIcon icon={faExclamationCircle} size="lg" />,
          borderColor: 'border-red-500',
          bgColor: 'bg-red-700/20',
          textColor: 'text-red-300',
          iconColor: 'text-red-400'
        };
      case 'info':
        return {
          icon: <FontAwesomeIcon icon={faInfoCircle} size="lg" />,
          borderColor: 'border-blue-500',
          bgColor: 'bg-blue-700/20',
          textColor: 'text-blue-300',
          iconColor: 'text-blue-400'
        };
      case 'warn':
        return {
          icon: <FontAwesomeIcon icon={faExclamationTriangle} size="lg" />,
          borderColor: 'border-yellow-500',
          bgColor: 'bg-yellow-700/20',
          textColor: 'text-yellow-300',
          iconColor: 'text-yellow-400'
        };
      case 'loading':
        return {
          icon: <Loader size="sm" color="cyan" />,
          borderColor: 'border-cyan-500',
          bgColor: 'bg-cyan-700/20',
          textColor: 'text-cyan-300',
          iconColor: 'text-cyan-400'
        };
      default:
        return {
          icon: <FontAwesomeIcon icon={faInfoCircle} size="lg" />,
          borderColor: 'border-gray-500',
          bgColor: 'bg-gray-700/20',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
    }
  };

  const styles = getAlertStyles();
  
  // Custom close button that respects the alert type color
  const closeButton = (
    <CloseButton
      aria-label="Close alert"
      onClick={handleClose}
      className={`${styles.textColor} hover:bg-gray-800/50`}
      icon={<FontAwesomeIcon icon={faTimes} />}
    />
  );

  return (
    <div className="container mx-auto px-4">
      <div className="my-3">
        <ContentCard
          className={`${styles.borderColor} transition-all ease-in-out duration-300 shadow-lg hover:shadow-xl`}
          shadow="lg"
          withBorder={true}
          radius="md"
          bodyPadding={0} // We'll handle padding in the content
          title={alert.type.toUpperCase()}
          titleSize="md"
          titlePosition="left"
          icon={styles.icon}
          iconPosition="title-left"
          actions={closeButton}
          style={{ 
            borderWidth: '2px',
            background: 'transparent',
            backdropFilter: 'blur(8px)',
            overflow: 'visible' // Allows for shadow effects
          }}
        >
          <div className={`p-4 ${styles.bgColor}`}>
            <Flex direction="column" gap="sm">
              <Text className={`${styles.textColor} font-medium`}>{alert.message}</Text>
              
              {timeLeft !== null && (
                <Text size="xs" className="text-gray-400">
                  Alert clearing in: {timeLeft} seconds
                </Text>
              )}
              
              {alert.showButton && (
                <div className="mt-2">
                  {alert.button}
                </div>
              )}
            </Flex>
          </div>
        </ContentCard>
      </div>
    </div>
  );
};

export default AlertComponent;
