import { Anchor, Stack, Switch, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import type { EffectiveConsent } from '@/utils/consent';

interface CookieSettingsViewProps {
  /** Current effective consent (`unset` before any choice). */
  analytics: EffectiveConsent;
  /** Save handler; receives the switch's new checked state. */
  onChange: (granted: boolean) => void;
  /** Global Privacy Control signal (informational only). */
  globalPrivacyControl?: boolean;
}

/**
 * The body of the cookie-settings dialog: presentational only, so the /test
 * guide can show it with mock actions. The stateful dialog lives in
 * `CookieSettingsModal`.
 */
export function CookieSettingsView({
  analytics,
  onChange,
  globalPrivacyControl = false,
}: CookieSettingsViewProps) {
  const { t } = useTranslation('common');
  return (
    <Stack gap="sm">
      <Text size="sm" c="var(--ot-muted)">
        {t('consent.settings.text')}{' '}
        <Anchor component={Link} href="/legal/privacy" underline="hover" inline>
          {t('consent.settings.privacyLink')}
        </Anchor>
      </Text>
      <Switch
        checked={analytics === 'granted'}
        onChange={(event) => onChange(event.currentTarget.checked)}
        label={t('consent.settings.analyticsLabel')}
        description={
          analytics === 'unset'
            ? t('consent.settings.stateUnset')
            : analytics === 'granted'
              ? t('consent.settings.stateGranted')
              : t('consent.settings.stateDenied')
        }
        labelPosition="left"
        aria-label={t('consent.settings.analyticsLabel')}
      />
      {globalPrivacyControl && (
        <Text size="xs" c="var(--ot-muted)">
          {t('consent.settings.gpcNote')}
        </Text>
      )}
    </Stack>
  );
}
