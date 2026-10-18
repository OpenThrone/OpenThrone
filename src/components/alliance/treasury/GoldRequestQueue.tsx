import {
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import { GameCard } from '@/components/game/GameCard';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { toLocale } from '@/utils/numberFormatting';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'yellow',
  APPROVED: 'green',
  DECLINED: 'red',
  CANCELLED: 'gray',
};

interface GoldRequestQueueProps {
  allianceId: number;
  /** Called after a decision so the treasury balance and history refresh. */
  onChanged: () => void;
  /** Bump to refetch after a new request is created. */
  refreshKey: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('load failed');
  return res.json();
};

/** Pending/decided gold requests: managers decide, members cancel their own. */
export const GoldRequestQueue = ({
  allianceId,
  onChanged,
  refreshKey,
}: GoldRequestQueueProps) => {
  const { t } = useTranslation('allianceTreasury');
  const { user, forceUpdate } = useUser();
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data, error, mutate } = useSWR(
    [`/api/alliances/bank/requests/list?allianceId=${allianceId}`, refreshKey],
    ([url]) => fetcher(url),
  );

  const act = async (
    requestId: number,
    action: 'approve' | 'decline' | 'cancel',
  ) => {
    setBusyId(requestId);
    try {
      if (action === 'cancel') {
        await allianceRequest('/api/alliances/bank/requests/cancel', {
          allianceId,
          requestId,
        });
        alertService.success(t('cancelled'));
      } else {
        await allianceRequest('/api/alliances/bank/requests/decide', {
          allianceId,
          requestId,
          decision: action,
        });
        alertService.success(t(action === 'approve' ? 'approved' : 'declined'));
      }
      await mutate();
      forceUpdate();
      onChanged();
    } catch (err: any) {
      alertService.error(err.message);
      await mutate();
    } finally {
      setBusyId(null);
    }
  };

  const requests: any[] = data?.requests ?? [];

  return (
    <GameCard title={t('queueTitle')}>
      {error ? (
        <Text c="red" role="alert">
          {t('loadError')}
        </Text>
      ) : !data ? (
        <Center p="md">
          <Loader />
        </Center>
      ) : requests.length === 0 ? (
        <Text c="dimmed">{t('queueEmpty')}</Text>
      ) : (
        <Table.ScrollContainer minWidth={480}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('queueMember')}</Table.Th>
                <Table.Th>{t('amount')}</Table.Th>
                <Table.Th>{t('queueReason')}</Table.Th>
                <Table.Th>{t('queueStatus')}</Table.Th>
                <Table.Th>{t('queueActions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {requests.map((request) => {
                const pending = request.status === 'PENDING';
                const own = request.requester_id === user?.id;
                return (
                  <Table.Tr key={request.id}>
                    <Table.Td>{request.requester?.display_name}</Table.Td>
                    <Table.Td>{toLocale(request.amount)}</Table.Td>
                    <Table.Td>{request.reason ?? ''}</Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={STATUS_COLORS[request.status] ?? 'gray'}
                      >
                        {t(`status.${request.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {pending && (
                        <Group gap="xs" wrap="nowrap">
                          {data.canManage && (
                            <>
                              <Button
                                size="compact-xs"
                                color="green"
                                loading={busyId === request.id}
                                onClick={() => act(request.id, 'approve')}
                              >
                                {t('approve')}
                              </Button>
                              <Button
                                size="compact-xs"
                                color="red"
                                variant="light"
                                disabled={busyId === request.id}
                                onClick={() => act(request.id, 'decline')}
                              >
                                {t('decline')}
                              </Button>
                            </>
                          )}
                          {own && (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              disabled={busyId === request.id}
                              onClick={() => act(request.id, 'cancel')}
                            >
                              {t('cancel')}
                            </Button>
                          )}
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </GameCard>
  );
};
