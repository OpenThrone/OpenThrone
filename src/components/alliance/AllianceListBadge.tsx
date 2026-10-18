import { Badge, Group, Tooltip } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import useSWR from 'swr';

export type AllianceListType = 'FARM' | 'HIT' | 'BLOCK';

export interface AllianceListHit {
  allianceId: number;
  allianceName: string;
  lists: AllianceListType[];
}

interface LookupResponse {
  alliances: AllianceListHit[];
}

const LIST_COLORS = { FARM: 'green', HIT: 'red', BLOCK: 'gray' } as const;

const fetcher = async (url: string): Promise<LookupResponse> => {
  const res = await fetch(url);
  if (!res.ok) return { alliances: [] };
  return res.json();
};

interface AllianceListBadgeProps {
  /** Fetches the single-target lookup itself. Ignored when `alliances` is given. */
  targetUserId?: number | null;
  /** Pre-fetched lookup result (e.g. from the batch endpoint); skips any request. */
  alliances?: AllianceListHit[];
  /** `compact` renders extra-small badges for dense tables. */
  variant?: 'default' | 'compact';
}

/** Shows which of the viewer's alliance lists (Farm / Hit / Block) contain a target. */
export const AllianceListBadge = ({
  targetUserId,
  alliances,
  variant = 'default',
}: AllianceListBadgeProps) => {
  const { t } = useTranslation('allianceLists');
  const { data } = useSWR(
    alliances === undefined && targetUserId
      ? `/api/alliances/lists/lookup?targetUserId=${targetUserId}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const badges = (alliances ?? data?.alliances ?? []).flatMap((alliance) =>
    alliance.lists.map((list) => ({ ...alliance, list })),
  );
  if (badges.length === 0) return null;

  const labels = {
    FARM: t('badge.farm', 'Farm target'),
    HIT: t('badge.hit', 'Hit target'),
    BLOCK: t('badge.block', 'Blocked'),
  };
  const compact = variant === 'compact';
  const shortLabels = {
    FARM: t('badge.farmShort', 'Farm'),
    HIT: t('badge.hitShort', 'Hit'),
    BLOCK: t('badge.blockShort', 'Block'),
  };

  return (
    <Group gap={compact ? 4 : 'xs'} wrap="nowrap" component="span">
      {badges.map((entry) => (
        <Tooltip
          key={`${entry.allianceId}-${entry.list}`}
          label={`${labels[entry.list]}: ${t(
            'badge.tooltip',
            'Listed by {{alliance}}',
            { alliance: entry.allianceName },
          )}`}
        >
          <Badge
            color={LIST_COLORS[entry.list]}
            variant="light"
            size={compact ? 'xs' : undefined}
          >
            {compact ? shortLabels[entry.list] : labels[entry.list]}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  );
};
