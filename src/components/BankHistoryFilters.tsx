import React from 'react';
import { Chip, Group } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';


export default function BankHistoryFilters({ colorScheme, filters, setFilters }) {
  
  const toggleFilter = (key) => {
    setFilters({
      ...filters,
      [key]: !filters[key],
    });
  };

  return (
    <Group>
      <Chip
        variant="filled"
        checked={filters.war_spoils}
        onChange={() => toggleFilter('war_spoils')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        War Spoils
      </Chip>
      <Chip
        variant="filled"
        checked={filters.deposits}
        onChange={() => toggleFilter('deposits')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Deposits
      </Chip>
      <Chip
        variant="filled"
        checked={filters.withdraws}
        onChange={() => toggleFilter('withdraws')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Withdraws
      </Chip>
      <Chip
        variant="filled"
        checked={filters.transfers}
        onChange={() => toggleFilter('transfers')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Transfers
      </Chip>
      <Chip
        variant="filled"
        checked={filters.sale}
        onChange={() => toggleFilter('sale')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Sale
      </Chip>
      <Chip
        variant="filled"
        checked={filters.training}
        onChange={() => toggleFilter('training')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Training
      </Chip>
      <Chip
        variant="filled"
        checked={filters.recruitment}
        onChange={() => toggleFilter('recruitment')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Recruitment
      </Chip>
      <Chip
        variant="filled"
        checked={filters.economy}
        onChange={() => toggleFilter('economy')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Income
      </Chip>
      <Chip
        variant="filled"
        checked={filters.fortification}
        onChange={() => toggleFilter('fortification')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Fort Repairs
      </Chip>
      <Chip
        variant="filled"
        checked={filters.daily}
        onChange={() => toggleFilter('daily')}
        color={
          colorScheme === 'ELF'
            ? 'green'
            : colorScheme === 'GOBLIN'
              ? 'red'
              : colorScheme === 'UNDEAD'
                ? 'gray'
                : 'blue'
        }
      >
        Daily Rewards
      </Chip>
    </Group>
  );
}