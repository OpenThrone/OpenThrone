import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon, Button, Popover, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { toLocale } from '@/utils/numberFormatting';

interface StatsTableProps {
  title: string;
  data: {
    id?: number | string;
    display_name: string;
    stat: number | string | bigint;
  }[];
  description?: string;
  displayButton?: boolean;
}

const StatsTable = ({
  title,
  data,
  description,
  displayButton = true,
}: StatsTableProps) => {
  const { t } = useTranslation(['community', 'common']);
  const [opened, { close, open, toggle }] = useDisclosure(false);
  const headers = [
    t('stats.rankColumn'),
    t('stats.playerColumn'),
    t('stats.statColumn'),
    ...(displayButton ? [t('stats.actionColumn')] : []),
  ];
  return (
    <GameCard
      title={title}
      action={
        description ? (
          <Popover
            withArrow
            width={260}
            opened={opened}
            onChange={(value) => (value ? open() : close())}
            position="bottom"
          >
            <Popover.Target>
              <ActionIcon
                variant="subtle"
                onClick={toggle}
                onMouseEnter={open}
                onMouseLeave={close}
                aria-label={t('stats.tableDescription', { title })}
                aria-expanded={opened}
              >
                <FontAwesomeIcon icon={faCircleInfo} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="sm">{description}</Text>
            </Popover.Dropdown>
          </Popover>
        ) : null
      }
    >
      <StyledTable headers={headers}>
        {data.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={headers.length}>
              <Text size="sm" c="var(--ot-muted)" py="md">
                {t('phrases.noResults', { ns: 'common' })}
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
        {data.map((player, index) => (
          <Table.Tr
            key={player.id ?? index}
            style={{ background: 'var(--ot-inset)' }}
          >
            <Table.Td>
              <Text size="sm" c="var(--ot-muted)">
                {index + 1}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" fw={600}>
                {player.display_name}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text
                size="sm"
                fw={700}
                c="var(--ot-heading)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {toLocale(player.stat) || 0}
              </Text>
            </Table.Td>
            {displayButton && (
              <Table.Td>
                {player.id !== undefined && (
                  <Button
                    component={Link}
                    href={`/userprofile/${player.id}`}
                    size="xs"
                    variant="subtle"
                  >
                    {t('stats.viewProfile')}
                  </Button>
                )}
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </StyledTable>
    </GameCard>
  );
};
export default StatsTable;
