import { Modal } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { ReportPlayerForm } from '@/components/ReportPlayerForm';

interface ReportPlayerModalProps {
  opened: boolean;
  onClose: () => void;
  userId: number;
  username: string;
}

/** Report a player without leaving their profile. */
export const ReportPlayerModal = ({
  opened,
  onClose,
  userId,
  username,
}: ReportPlayerModalProps) => {
  const { t } = useTranslation('common');
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('report.title')}
      size="lg"
      centered
    >
      <ReportPlayerForm
        presetUserId={userId}
        presetUsername={username}
        onDone={onClose}
        onCancel={onClose}
      />
    </Modal>
  );
};
