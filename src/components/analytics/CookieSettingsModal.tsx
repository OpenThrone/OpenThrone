import { Modal } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { CookieSettingsView } from '@/components/analytics/CookieSettingsView';
import type { ConsentChoice, EffectiveConsent } from '@/utils/consent';

interface CookieSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  /** Current effective consent (`unset` before any choice). */
  analytics: EffectiveConsent;
  /** Stores the explicit choice (also reports the aggregate tally). */
  onChange: (choice: ConsentChoice) => void;
  /** Global Privacy Control signal, shown as an informational note. */
  globalPrivacyControl?: boolean;
}

/** The cookie-settings dialog opened from the footer link or the provider. */
export function CookieSettingsModal({
  opened,
  onClose,
  analytics,
  onChange,
  globalPrivacyControl = false,
}: CookieSettingsModalProps) {
  const { t } = useTranslation('common');
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('consent.settings.title')}
      size="md"
    >
      <CookieSettingsView
        analytics={analytics}
        onChange={(granted) => onChange(granted ? 'granted' : 'denied')}
        globalPrivacyControl={globalPrivacyControl}
      />
    </Modal>
  );
}
