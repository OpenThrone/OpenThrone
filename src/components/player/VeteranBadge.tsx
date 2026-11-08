import { Badge, Tooltip } from '@mantine/core';
import { useTranslation } from 'next-i18next';

export interface VeteranBadgeProps {
  /** Prisma VeteranTitle value; unknown or null titles render nothing. */
  title?: string | null;
  /** Original join date restored with the title (ISO string). */
  since?: string | null;
}

/**
 * "Era 1 Tester" title badge for players who reclaimed an erased account,
 * tinted with the active race accent like the other identity marks.
 */
export function VeteranBadge({ title, since }: VeteranBadgeProps) {
  const { t, i18n } = useTranslation('common');
  if (title !== 'ERA1_TESTER') return null;
  const sinceDate = since ? new Date(since) : null;
  const tooltip =
    sinceDate && !Number.isNaN(sinceDate.getTime())
      ? t('veteran.since', {
          date: sinceDate.toLocaleDateString(i18n.language, {
            dateStyle: 'long',
            timeZone: 'UTC',
          }),
        })
      : t('veteran.badge');
  return (
    <Tooltip label={tooltip}>
      <Badge
        // Focusable so keyboard users can reach the join-date tooltip.
        tabIndex={0}
        aria-label={
          tooltip === t('veteran.badge')
            ? tooltip
            : `${t('veteran.badge')}: ${tooltip}`
        }
        variant="outline"
        size="md"
        styles={{
          root: {
            // Sits inside display-font headings; keep the label in the UI face.
            fontFamily: 'var(--mantine-font-family)',
            textTransform: 'none',
            verticalAlign: 'middle',
            marginInlineStart: '0.5em',
            color: 'var(--ot-brand-text)',
            borderColor: 'var(--ot-brand)',
            background:
              'color-mix(in srgb, var(--ot-brand) 30%, var(--ot-surface))',
          },
        }}
      >
        {t('veteran.badge')}
      </Badge>
    </Tooltip>
  );
}

export default VeteranBadge;
