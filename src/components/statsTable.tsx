import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Button,
  Popover,
  Table,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Link from 'next/link';
import React from 'react';

import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import toLocale from '@/utils/numberFormatting';

const StatsTable = ({
  title,
  data,
  description = 'description',
  displayButton = true,
}) => {
  const [opened, { close, open }] = useDisclosure(false);
  const theme = useMantineTheme();
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';
  const headers = [
    'Rank',
    'Player',
    'Stat',
    ...(displayButton ? ['Action'] : []),
  ];

  return (
    <GameCard
      title={title}
      action={
        description ? (
          <Popover
            withArrow
            shadow="md"
            width={260}
            opened={opened}
            position="bottom"
          >
            <Popover.Target>
              <ActionIcon
                variant="subtle"
                color="yellow"
                onMouseEnter={open}
                onMouseLeave={close}
                aria-label={`${title} description`}
              >
                <FontAwesomeIcon icon={faCircleInfo} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown style={{ pointerEvents: 'none' }}>
              <Text size="sm">{description}</Text>
            </Popover.Dropdown>
          </Popover>
        ) : null
      }
    >
      <StyledTable headers={headers}>
        {data.map((player, index) => (
          <Table.Tr key={player.id ?? index} style={{ background: '#0f141a' }}>
            <Table.Td style={{ borderColor: '#1f2b3b' }}>
              <Text size="sm" fw={700} c="dimmed">
                {index + 1}
              </Text>
            </Table.Td>
            <Table.Td style={{ borderColor: '#1f2b3b' }}>
              <Text size="sm" fw={700}>
                {player.display_name}
              </Text>
            </Table.Td>
            <Table.Td style={{ borderColor: '#1f2b3b' }}>
              <Text size="sm" fw={700} style={{ color: accent }}>
                {toLocale(player.stat) || 0}
              </Text>
            </Table.Td>
            {displayButton && (
              <Table.Td style={{ borderColor: '#1f2b3b' }}>
                <Link href={`/userprofile/${player.id}`}>
                  <Button color="yellow" size="xs" fullWidth>
                    View Profile
                  </Button>
                </Link>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </StyledTable>
    </GameCard>
  );
};

export default StatsTable;
