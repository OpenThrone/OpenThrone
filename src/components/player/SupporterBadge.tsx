import { faCrown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip } from '@mantine/core';
import { useTranslation } from 'next-i18next';

export function SupporterBadge({
  supporter,
  size = 'sm',
}: {
  supporter: { supporterUntil?: string | null; badgeVisible?: boolean };
  size?: 'xs' | 'sm' | 'md';
}) {
  const { t } = useTranslation('supporter');
  if (
    supporter.badgeVisible === false ||
    !supporter.supporterUntil ||
    !(new Date(supporter.supporterUntil).getTime() > Date.now())
  )
    return null;
  const label = t('patron');
  return (
    <Tooltip label={label}>
      <span
        role="img"
        aria-label={label}
        style={{
          color: 'var(--ot-accent)',
          fontSize: { xs: '0.7rem', sm: '0.85rem', md: '1rem' }[size],
          marginInlineStart: '0.35em',
        }}
      >
        <FontAwesomeIcon icon={faCrown} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

export function PremiumAllianceMark() {
  const { t } = useTranslation('supporter');
  const label = t('premiumAlliance');
  return (
    <Tooltip label={label}>
      <span
        role="img"
        aria-label={label}
        style={{ color: 'var(--ot-accent)', marginInlineStart: '0.35em' }}
      >
        <FontAwesomeIcon icon={faCrown} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}
