import { Anchor, Button, Group, Paper, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import classes from '@/components/analytics/ConsentBanner.module.css';

interface ConsentBannerViewProps {
  /** Explicitly accept analytics cookies. */
  onAccept: () => void;
  /** Explicitly decline analytics cookies. */
  onDecline: () => void;
  /** Fixed to the viewport bottom as on live pages (inline in the guide). */
  docked?: boolean;
}

/**
 * The consent banner as visitors see it: presentational only, so the /test
 * guide can show it with mock actions. The stateful decision (when to show
 * it) lives in `ConsentProvider`.
 */
export function ConsentBannerView({
  onAccept,
  onDecline,
  docked = true,
}: ConsentBannerViewProps) {
  const { t } = useTranslation('common');
  return (
    <Paper
      component="section"
      aria-label={t('consent.banner.regionLabel')}
      role="region"
      withBorder
      p="md"
      shadow="md"
      radius={docked ? 0 : undefined}
      className={docked ? classes.banner : undefined}
      style={{ background: 'var(--ot-surface)', color: 'var(--ot-text)' }}
    >
      <div className={classes.content}>
        <Stack gap={4} className={classes.copy}>
          <Text size="sm" fw={700}>
            {t('consent.banner.title')}
          </Text>
          <Text size="sm" c="var(--ot-muted)">
            {t('consent.banner.text')}{' '}
            <Anchor
              component={Link}
              href="/legal/privacy"
              underline="hover"
              inline
            >
              {t('consent.banner.privacyLink')}
            </Anchor>
          </Text>
        </Stack>
        <Group gap="sm" grow className={classes.actions}>
          <Button variant="light" color="yellow" onClick={onAccept}>
            {t('consent.banner.accept')}
          </Button>
          <Button variant="light" color="yellow" onClick={onDecline}>
            {t('consent.banner.decline')}
          </Button>
        </Group>
      </div>
    </Paper>
  );
}
