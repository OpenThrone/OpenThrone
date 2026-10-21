import type { BadgeProps } from '@mantine/core';
import { Badge } from '@mantine/core';
import { useTranslation } from 'next-i18next';

export type YouBadgeProps = Omit<
  BadgeProps,
  'children' | 'color' | 'variant' | 'styles'
>;

/** Marks the signed-in player in a list, tinted with the active race accent. */
export function YouBadge(badgeProps: YouBadgeProps) {
  const { t } = useTranslation('common');
  return (
    <Badge
      variant="outline"
      {...badgeProps}
      styles={{
        root: {
          color: 'var(--ot-brand-text)',
          borderColor: 'var(--ot-brand)',
          background:
            'color-mix(in srgb, var(--ot-brand) 30%, var(--ot-surface))',
        },
      }}
    >
      {t('player.you')}
    </Badge>
  );
}

export default YouBadge;
