import type { AutocompleteProps } from '@mantine/core';
import { Autocomplete, Avatar, Group, Loader, Text } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { useRef, useState } from 'react';

import { searchPlayersByName } from '@/components/alliance/playerSearch';
import { logError } from '@/utils/logger';

interface PlayerOption {
  value: string;
  id: number;
  avatar: string | null;
}

type PlayerNameAutocompleteProps = Omit<
  AutocompleteProps,
  'data' | 'value' | 'onChange'
> & {
  value: string;
  onChange: (value: string) => void;
};

/** Display-name input that suggests matching players as the user types. */
export const PlayerNameAutocomplete = ({
  value,
  onChange,
  ...rest
}: PlayerNameAutocompleteProps) => {
  const [options, setOptions] = useState<PlayerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const latest = useRef('');

  const search = useDebouncedCallback(async (term: string) => {
    latest.current = term;
    if (term.trim().length < 2) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const matches = await searchPlayersByName(term);
      // Ignore a slow response for text the user has already changed.
      if (latest.current !== term) return;
      setOptions(
        matches.slice(0, 8).map((match) => ({
          value: match.displayName,
          id: match.id,
          avatar: match.avatarSrc ?? null,
        })),
      );
    } catch (error) {
      logError('Player name search failed', error);
      setOptions([]);
    } finally {
      if (latest.current === term) setLoading(false);
    }
  }, 300);

  return (
    <Autocomplete
      {...rest}
      value={value}
      onChange={(next) => {
        onChange(next);
        search(next);
      }}
      data={options.map((option) => option.value)}
      filter={({ options: items }) => items}
      renderOption={({ option }) => {
        const match = options.find((o) => o.value === option.value);
        return (
          <Group gap="sm" wrap="nowrap">
            <Avatar src={match?.avatar} size="sm" radius="xl" />
            <Text size="sm">{option.value}</Text>
          </Group>
        );
      }}
      limit={8}
      rightSection={loading ? <Loader size="xs" /> : rest.rightSection}
    />
  );
};
