import { useState } from 'react';
import { Modal, Text, Button } from '@mantine/core';
import toast from 'react-hot-toast';
import { logError } from '@/utils/logger';

interface VacationModeModalProps {
  opened: boolean;
  onClose: () => void;
  userId: number | null;
  onVacationEnd: () => void;
}

const VacationModeModal: React.FC<VacationModeModalProps> = ({ opened, onClose, userId, onVacationEnd }) => {
  const [loading, setLoading] = useState(false);

  const handleVacationOverride = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/account/end-vacation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        toast.success('Vacation mode ended. Please refresh the page.');
        onVacationEnd();
      } else {
        throw new Error('Failed to end vacation mode');
      }
    } catch (error) {
      logError(error);
      toast.error('Could not end vacation mode');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Vacation Mode Active" centered>
      <Text mb="md">
        Your account is currently in vacation mode. Do you want to end vacation mode and return to the game?
      </Text>
      <Button onClick={handleVacationOverride} loading={loading} fullWidth mt="md">
        End Vacation Mode
      </Button>
      <Button onClick={onClose} variant="outline" color="red" fullWidth mt="sm">
        Log Out
      </Button>
    </Modal>
  );
};

export default VacationModeModal;
