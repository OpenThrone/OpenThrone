import {
  Anchor,
  Badge,
  Center,
  Group,
  Loader,
  Pagination,
  Table,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { GameCard } from '@/components/game/GameCard';
import { toLocale } from '@/utils/numberFormatting';

interface BattlePlayer {
  id: number;
  display_name: string | null;
}

interface InternalBattleRow {
  id: number;
  timestamp: string | null;
  attacker: BattlePlayer;
  defender: BattlePlayer;
  winner: number;
  pillaged_gold: string;
}

interface InternalBattlesResponse {
  items: InternalBattleRow[];
  total: number;
  page: number;
  pageSize: number;
}

const fetcher = async (url: string): Promise<InternalBattlesResponse> => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};

interface AllianceInternalBattlesProps {
  allianceId: number;
}

/** Members-only log of attacks between members of this alliance this era. */
export const AllianceInternalBattles = ({
  allianceId,
}: AllianceInternalBattlesProps) => {
  const { t, i18n } = useTranslation('alliances');
  const [page, setPage] = useState(1);
  const { data, error } = useSWR(
    `/api/alliances/internal-battles?allianceId=${allianceId}&page=${page}`,
    fetcher,
    { keepPreviousData: true },
  );

  const items = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  const playerLink = (player: BattlePlayer) => (
    <Anchor component={Link} href={`/userprofile/${player.id}`} size="sm">
      {player.display_name ?? `#${player.id}`}
    </Anchor>
  );

  return (
    <GameCard title={t('internalBattles.title')}>
      <Text size="sm" c="dimmed" mb="md">
        {t('internalBattles.description')}
      </Text>
      {error ? (
        <Text c="red" role="alert">
          {t('internalBattles.loadError')}
        </Text>
      ) : !data ? (
        <Center p="md">
          <Loader />
        </Center>
      ) : items.length === 0 ? (
        <Text c="dimmed">{t('internalBattles.empty')}</Text>
      ) : (
        <>
          <Table.ScrollContainer minWidth={560}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('internalBattles.date')}</Table.Th>
                  <Table.Th>{t('internalBattles.attacker')}</Table.Th>
                  <Table.Th>{t('internalBattles.defender')}</Table.Th>
                  <Table.Th>{t('internalBattles.winner')}</Table.Th>
                  <Table.Th ta="right">{t('internalBattles.gold')}</Table.Th>
                  <Table.Th>
                    <span className="sr-only">
                      {t('internalBattles.report')}
                    </span>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((battle) => {
                  const attackerWon =
                    Number(battle.winner) === Number(battle.attacker.id);
                  const winner = attackerWon
                    ? battle.attacker
                    : battle.defender;
                  return (
                    <Table.Tr key={battle.id}>
                      <Table.Td>
                        {battle.timestamp
                          ? new Date(battle.timestamp).toLocaleString(
                              i18n.language,
                            )
                          : '-'}
                      </Table.Td>
                      <Table.Td>{playerLink(battle.attacker)}</Table.Td>
                      <Table.Td>{playerLink(battle.defender)}</Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">
                            {winner.display_name ?? `#${winner.id}`}
                          </Text>
                          <Badge
                            size="xs"
                            variant="light"
                            color={attackerWon ? 'red' : 'blue'}
                          >
                            {attackerWon
                              ? t('internalBattles.attackerWon')
                              : t('internalBattles.defenderWon')}
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td ta="right">
                        {toLocale(battle.pillaged_gold)}
                      </Table.Td>
                      <Table.Td>
                        <Anchor
                          component={Link}
                          href={`/battle/results/${battle.id}`}
                          size="sm"
                        >
                          {t('internalBattles.viewReport')}
                        </Anchor>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination
                total={totalPages}
                value={page}
                onChange={setPage}
                aria-label={t('internalBattles.pagination')}
              />
            </Group>
          )}
        </>
      )}
    </GameCard>
  );
};
