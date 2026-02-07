import {
  Button,
  Group,
  Loader,
  Paper,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import useSWR from 'swr';

import type { AllianceInfo } from '@/services/Alliance.service';

import { DeclareWarModal } from './DeclareWarModal';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export const AllianceWar = ({ alliance }: { alliance: AllianceInfo }) => {
  const { t } = useTranslation('alliances');
  const [opened, { open, close }] = useDisclosure(false);

  // Correct API endpoint is /api/alliances/wars endpoint (which handles GET at index)
  // I created /api/alliances/wars/index.ts so endpoint is /api/alliances/wars
  const { data: wars, error } = useSWR(
    `/api/alliances/wars?allianceId=${alliance.id}`,
    fetcher,
  );

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="lg">
        <Title order={3}>{t('war.activeWars', 'Active Conflicts')}</Title>
        <Button color="red" onClick={open}>
          {t('war.declareWar', 'Declare War')}
        </Button>
      </Group>

      {!wars && !error ? (
        <Loader />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('war.attacker', 'Attacker')}</Table.Th>
              <Table.Th>{t('war.defender', 'Defender')}</Table.Th>
              <Table.Th>{t('war.status', 'Status')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {wars && wars.length > 0 ? (
              wars.map((war: any) => (
                <Table.Tr key={war.id}>
                  <Table.Td>{war.attacker_alliance.name}</Table.Td>
                  <Table.Td>
                    {war.defender_alliance?.name ||
                      war.defender_user?.display_name ||
                      'Unknown'}
                  </Table.Td>
                  <Table.Td>
                    <Text
                      c={war.status === 'ACTIVE' ? 'red' : 'orange'}
                      fw={700}
                    >
                      {war.status}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={3} align="center">
                  <Text c="dimmed">No active wars</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <DeclareWarModal
        opened={opened}
        onClose={close}
        allianceId={alliance.id}
      />
    </Paper>
  );
};
