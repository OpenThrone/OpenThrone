import { useTranslation } from 'next-i18next';

import { useConsent } from '@/context/ConsentContext';

/**
 * "Cookie settings" in the site footer: rendered only when the analytics
 * measurement ID is configured, for both public and signed-in pages.
 */
export function CookieSettingsFooterLink() {
  const { openSettings, measurementConfigured } = useConsent();
  const { t } = useTranslation('common');
  if (!measurementConfigured) return null;
  return (
    <>
      {' · '}
      <button
        type="button"
        onClick={openSettings}
        className="underline opacity-80 transition-opacity hover:opacity-100"
      >
        {t('consent.footerLink')}
      </button>
    </>
  );
}
