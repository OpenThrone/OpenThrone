import { useTranslation } from 'next-i18next';

import ConfirmationModal from '@/components/ConfirmationModal';

interface ConfirmActionModalProps {
  opened: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  /** When set, the user must type this exact text before confirming. */
  requiredText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** Destructive alliance confirmation: a thin wrapper over ConfirmationModal. */
export const ConfirmActionModal = ({
  opened,
  title,
  message,
  confirmLabel,
  loading = false,
  requiredText,
  onConfirm,
  onClose,
}: ConfirmActionModalProps) => {
  const { t } = useTranslation('alliances');

  return (
    <ConfirmationModal
      isOpen={opened}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      message={message}
      type="destructive"
      confirmText={confirmLabel}
      cancelText={t('manage.cancel', 'Cancel')}
      isLoading={loading}
      requiredText={requiredText}
      requiredTextLabel={
        requiredText === undefined
          ? undefined
          : t('manage.typeToConfirm', 'Type "{{text}}" to confirm', {
              text: requiredText,
            })
      }
    />
  );
};
