import { Button, Loader, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import useSWR from 'swr';

import { getAllianceStanding } from '@/components/alliance/allianceStanding';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';

import { DeclareWarModal } from './DeclareWarModal';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

async function endWar(warId: number) {
  const res = await fetch('/api/alliances/wars/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ warId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
}

/** Alliance war. */
export const AllianceWar = ({
  alliance,
  viewerId = null,
}: {
  alliance: AllianceInfo;
  viewerId?: number | null;
}) => {
  const { t } = useTranslation('alliances');
  const canDeclare = getAllianceStanding(alliance, viewerId).can('declare_war');
  const [opened, { open, close }] = useDisclosure(false);

  // Correct API endpoint is /api/alliances/wars endpoint (which handles GET at index)
  // I created /api/alliances/wars/index.ts so endpoint is /api/alliances/wars
  const {
    data: wars,
    error,
    mutate,
  } = useSWR(`/api/alliances/wars?allianceId=${alliance.id}`, fetcher);

  return (
    <GameCard
      title={t('war.activeWars', 'Active Conflicts')}
      action={
        canDeclare && (
          <Button color="red" onClick={open}>
            {t('war.declareWar', 'Declare War')}
          </Button>
        )
      }
    >
      {!wars && !error ? (
        <Loader />
      ) : (
        <StyledTable
          ariaLabel={t('war.activeWars', 'Active Conflicts')}
          tableProps={{ striped: true, highlightOnHover: true }}
          headers={[
            t('war.attacker', 'Attacker'),
            t('war.defender', 'Defender'),
            t('war.status', 'Status'),
            ...(canDeclare ? [<Table.Th key="actions" />] : []),
          ]}
        >
          {Array.isArray(wars) && wars.length > 0 ? (
            wars.map((war: any) => (
              <Table.Tr key={war.id}>
                <Table.Td>{war.attacker_alliance.name}</Table.Td>
                <Table.Td>
                  {war.defender_alliance?.name ||
                    war.defender_user?.display_name ||
                    t('war.unknown', 'Unknown')}
                </Table.Td>
                <Table.Td>
                  <Text c={war.status === 'ACTIVE' ? 'red' : 'orange'} fw={700}>
                    {t(`war.statuses.${war.status}`, {
                      defaultValue: war.status,
                    })}
                  </Text>
                </Table.Td>
                {canDeclare && (
                  <Table.Td>
                    <Button
                      size="compact-xs"
                      variant="default"
                      onClick={async () => {
                        try {
                          await endWar(war.id);
                          alertService.success(t('war.ended', 'War ended.'));
                          mutate();
                        } catch (err) {
                          alertService.error((err as Error).message);
                        }
                      }}
                    >
                      {t('war.end', 'End war')}
                    </Button>
                  </Table.Td>
                )}
              </Table.Tr>
            ))
          ) : (
            <Table.Tr>
              <Table.Td colSpan={canDeclare ? 4 : 3} align="center">
                <Text c="dimmed">{t('war.none', 'No active wars')}</Text>
              </Table.Td>
            </Table.Tr>
          )}
        </StyledTable>
      )}

      <DeclareWarModal
        opened={opened}
        onClose={close}
        allianceId={alliance.id}
      />
    </GameCard>
  );
};
