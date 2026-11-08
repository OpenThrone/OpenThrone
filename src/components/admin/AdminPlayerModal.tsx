import { Modal } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import UserAdminEditor from '@/components/UserAdminEditor';

export default function AdminPlayerModal({
  userId,
  opened,
  isAdministrator,
  onClose,
  onSaved,
}: {
  userId: string | null;
  opened: boolean;
  isAdministrator: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('admin-users');
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={t('editor.modalTitle')}
    >
      {userId && (
        <UserAdminEditor
          key={userId}
          userId={userId}
          isAdministrator={isAdministrator}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}
