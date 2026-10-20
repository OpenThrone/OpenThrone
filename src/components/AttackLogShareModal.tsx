import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  ScrollArea,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import { useUser } from '@/context/users';
import type { Log } from '@/types/typings';
import { logDebug, logError } from '@/utils/logger';

interface AttackLogShareModalProps {
  opened: boolean;
  onClose: () => void;
  onShare: (logId: number) => void;
}

const ROWS_PER_PAGE = 5;

const AttackLogShareModal: React.FC<AttackLogShareModalProps> = ({
  opened,
  onClose,
  onShare,
}) => {
  const { t, i18n } = useTranslation('messaging');
  const { user } = useUser();
  const [attackLogs, setAttackLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    if (opened && user?.id) {
      setLoading(true);
      setError(null);

      // Fetch user's attack logs
      fetch(`/api/attack/logs?limit=${ROWS_PER_PAGE}&page=${activePage - 1}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to fetch attack logs');
          }
          return res.json();
        })
        .then((data) => {
          logDebug('API response:', data);
          if (data.data && Array.isArray(data.data)) {
            setAttackLogs(data.data);
            setTotalPages(Math.ceil(data.total / ROWS_PER_PAGE));
          } else {
            logError('Unexpected data format:', data);
            throw new Error('Invalid data format');
          }
        })
        .catch((err) => {
          logError('Error fetching attack logs:', err);
          setError(t('share.loadFailed'));
          setAttackLogs([]);
          setTotalPages(0);
        })
        .finally(() => setLoading(false));
    } else {
      // Reset when modal is closed or user is not available
      setAttackLogs([]);
      setLoading(false);
      setError(null);
      setPage(1);
      setTotalPages(0);
    }
  }, [opened, user?.id, activePage, t]); // Re-fetch when page changes

  const handleShareClick = (logId: number) => {
    onShare(logId);
    onClose();
  };

  const rows = attackLogs.map((log) => {
    const isAttacker = Number(log.attacker_id) === Number(user?.id);

    // Format the battle description in "Attacker attacked Defender" style
    const attackerName = isAttacker
      ? t('message.you')
      : log.attackerPlayer?.display_name || t('share.unknownPlayer');
    const defenderName = !isAttacker
      ? t('message.you')
      : log.defenderPlayer?.display_name || t('share.unknownPlayer');

    const battleDescription = t('share.attacked', {
      attacker: attackerName,
      defender: defenderName,
    });

    // Determine outcome
    const isVictory = Number(log.winner) === Number(user?.id);

    return (
      <Table.Tr key={log.id}>
        <Table.Td>{battleDescription}</Table.Td>
        <Table.Td>
          {new Date(log.timestamp).toLocaleString(i18n.language, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </Table.Td>
        <Table.Td c={isVictory ? 'green' : 'red'}>
          {isVictory ? t('share.victory') : t('share.defeat')}
        </Table.Td>
        <Table.Td>
          <Button size="xs" onClick={() => handleShareClick(log.id)}>
            {t('share.share')}
          </Button>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Modal opened={opened} onClose={onClose} title={t('share.title')} size="lg">
      {loading && (
        <Group justify="center" p="xl">
          <Loader size="md" />
        </Group>
      )}

      {error && (
        <Alert color="red" title={t('share.error')} role="alert">
          {error}
        </Alert>
      )}

      {!loading && !error && attackLogs.length === 0 && (
        <Text ta="center" p="md">
          {t('share.empty')}
        </Text>
      )}

      {!loading && !error && attackLogs.length > 0 && (
        <>
          <ScrollArea h={300}>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('share.battle')}</Table.Th>
                  <Table.Th>{t('share.date')}</Table.Th>
                  <Table.Th>{t('share.outcome')}</Table.Th>
                  <Table.Th>{t('share.action')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          </ScrollArea>

          {totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination
                total={totalPages}
                value={activePage}
                onChange={setPage}
                siblings={1}
              />
            </Group>
          )}
        </>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t('share.cancel')}
        </Button>
      </Group>
    </Modal>
  );
};

export default AttackLogShareModal;
