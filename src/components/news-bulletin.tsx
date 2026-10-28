import { faBullhorn } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Anchor,
  CloseButton,
  Paper,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { CSSProperties, ReactNode } from 'react';

import frameClasses from '@/components/game/FantasyFrame.module.css';
import { resolveArtworkSource } from '@/utils/artwork';

import classes from './NewsBulletin.module.css';

export type NewsBulletinSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

const SEVERITY_COLOR: Record<NewsBulletinSeverity, string> = {
  INFO: 'var(--ot-accent)',
  SUCCESS: 'var(--mantine-color-green-5)',
  WARNING: 'var(--mantine-color-yellow-5)',
  CRITICAL: 'var(--mantine-color-red-5)',
};

interface NewsBulletinProps {
  compact?: boolean;
  controls?: ReactNode;
  title: string;
  body: string;
  severity?: NewsBulletinSeverity | string | null;
  linkUrl?: string | null;
  dismissible?: boolean;
  onDismiss?: () => void;
}

/** Ornate site-wide announcement panel. Content is supplied by the caller. */
const NewsBulletin: React.FC<NewsBulletinProps> = ({
  compact = false,
  controls,
  title,
  body,
  severity,
  linkUrl,
  dismissible = true,
  onDismiss,
}) => {
  const { t } = useTranslation('common');
  const color =
    SEVERITY_COLOR[(severity ?? 'INFO') as NewsBulletinSeverity] ??
    SEVERITY_COLOR.INFO;

  return (
    <Paper
      component="section"
      className={`${classes.bulletin} ${compact ? classes.compact : ''} ${frameClasses.surface} ${frameClasses.ornate}`}
      style={
        {
          '--announcement-art': resolveArtworkSource(
            '/assets/images/ui/shell/announcement-scene.webp',
          )
            ? `url("${resolveArtworkSource('/assets/images/ui/shell/announcement-scene.webp')}")`
            : 'none',
          background: 'var(--ot-panel)',
          border: '1px solid var(--frame-edge)',
          boxShadow: 'var(--frame-shadow)',
        } as CSSProperties
      }
      aria-live="polite"
      aria-label={t('ariaLabels.siteAnnouncement')}
      radius="sm"
    >
      <Tooltip
        label={t(
          `announcementsFeed.${Object.prototype.hasOwnProperty.call(SEVERITY_COLOR, severity ?? '') ? severity : 'INFO'}`,
        )}
        events={{ hover: true, focus: true, touch: true }}
      >
        <ThemeIcon
          className={classes.icon}
          variant="outline"
          size={compact ? 36 : 48}
          radius="xl"
          color={color}
          tabIndex={0}
          role="img"
          aria-label={t(
            `announcementsFeed.${Object.prototype.hasOwnProperty.call(SEVERITY_COLOR, severity ?? '') ? severity : 'INFO'}`,
          )}
        >
          <FontAwesomeIcon icon={faBullhorn} />
        </ThemeIcon>
      </Tooltip>
      <div className={classes.copy}>
        <Text component="h2" className={classes.title}>
          {title}
        </Text>
        <Text className={classes.body}>{body}</Text>
        {linkUrl ? (
          <Anchor
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={classes.link}
          >
            {t('announcementLearnMore')}
          </Anchor>
        ) : null}
      </div>
      {controls && <div className={classes.controls}>{controls}</div>}
      {dismissible && onDismiss ? (
        <CloseButton
          onClick={onDismiss}
          aria-label={t('ariaLabels.dismissAnnouncement')}
          className={classes.close}
          size="lg"
        />
      ) : null}
    </Paper>
  );
};

export default NewsBulletin;
