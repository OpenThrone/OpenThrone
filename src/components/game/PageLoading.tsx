import {
  Box,
  SimpleGrid,
  Skeleton,
  Stack,
  VisuallyHidden,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { GameCard } from '@/components/game/GameCard';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface PageLoadingProps {
  /** Announced to assistive tech; defaults to the shared "Loading" label. */
  label?: string;
  /** Wraps the skeleton in a GameCard with this title. */
  cardTitle?: string;
  /** Number of stat tiles to sketch above the content (0 hides the row). */
  stats?: number;
  /** Number of text lines in the content block. */
  lines?: number;
  /** Adds a taller block for tables, grids or forms. */
  block?: boolean;
}

const LINE_WIDTHS = ['100%', '92%', '70%', '85%', '60%'];

/** Skeleton-first placeholder for a page or panel that is still loading. */
export function PageLoading({
  label,
  cardTitle,
  stats = 0,
  lines = 3,
  block = true,
}: PageLoadingProps) {
  const { t } = useTranslation('common');
  const animate = !usePrefersReducedMotion();
  const accessibleLabel = label ?? t('status.loading');

  const skeleton = (
    <Box role="status" aria-live="polite" aria-busy="true">
      <VisuallyHidden>{accessibleLabel}</VisuallyHidden>
      <Stack gap="md" aria-hidden="true" data-testid="page-loading">
        {stats > 0 && (
          <SimpleGrid cols={{ base: 2, md: Math.min(stats, 4) }} spacing="sm">
            {Array.from({ length: stats }, (_, index) => (
              <Skeleton key={index} height={64} radius="sm" animate={animate} />
            ))}
          </SimpleGrid>
        )}
        <Stack gap={8}>
          {Array.from({ length: lines }, (_, index) => (
            <Skeleton
              key={index}
              height={12}
              radius="xl"
              width={LINE_WIDTHS[index % LINE_WIDTHS.length]}
              animate={animate}
            />
          ))}
        </Stack>
        {block && <Skeleton height={160} radius="sm" animate={animate} />}
      </Stack>
    </Box>
  );

  return cardTitle ? (
    <GameCard title={cardTitle}>{skeleton}</GameCard>
  ) : (
    skeleton
  );
}

export default PageLoading;
