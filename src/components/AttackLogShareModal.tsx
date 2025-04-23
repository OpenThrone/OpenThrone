import React, { useState, useEffect } from 'react';
import { Modal, Button, Table, ScrollArea, Loader, Text, Group, Pagination, Alert } from '@mantine/core';
import { useUser } from '@/context/users';
import { formatDate } from '@/utils/utilities';
import { Log } from '@/types/typings';
import { logError } from '@/utils/logger';

interface AttackLogShareModalProps {
  opened: boolean;
  onClose: () => void;
  onShare: (logId: number) => void;
}

const ROWS_PER_PAGE = 5;

const AttackLogShareModal: React.FC<AttackLogShareModalProps> = ({ opened, onClose, onShare }) => {
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
      
      // Debug user
      console.log('Current user:', user);
      
      // Fetch user's attack logs
      fetch(`/api/attack/logs?limit=${ROWS_PER_PAGE}&page=${activePage - 1}`)
        .then(res => {
          if (!res.ok) {
            throw new Error('Failed to fetch attack logs');
          }
          return res.json();
        })
        .then(data => {
          console.log('API response:', data); // Log the entire response
          if (data.data && Array.isArray(data.data)) {
            setAttackLogs(data.data);
            setTotalPages(Math.ceil(data.total / ROWS_PER_PAGE));
          } else {
            logError('Unexpected data format:', data);
            throw new Error('Invalid data format');
          }
        })
        .catch(err => {
          logError("Error fetching attack logs:", err);
          setError(err.message || 'Could not load logs.');
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
  }, [opened, user?.id, activePage, user]); // Re-fetch when page changes

  const handleShareClick = (logId: number) => {
    onShare(logId);
    onClose();
  };

  // Debug attackLogs
  useEffect(() => {
    console.log('Attack logs state:', attackLogs);
  }, [attackLogs]);

  const rows = attackLogs.map((log) => {
    const isAttacker = Number(log.attacker_id) === Number(user?.id);
    
    // Format the battle description in "Attacker attacked Defender" style
    let battleDescription: string;
    const attackerName = isAttacker ? 'You' : (log.attackerPlayer?.display_name || 'Unknown Player');
    const defenderName = !isAttacker ? 'You' : (log.defenderPlayer?.display_name || 'Unknown Player');
    
    battleDescription = `${attackerName} attacked ${defenderName}`;
    
    // Determine outcome
    const outcome = Number(log.winner) === Number(user?.id) ? 'Victory' : 'Defeat';

    return (
      <Table.Tr key={log.id}>
        <Table.Td>{battleDescription}</Table.Td>
        <Table.Td>{formatDate(log.timestamp)}</Table.Td>
        <Table.Td c={outcome === 'Victory' ? 'green' : 'red'}>{outcome}</Table.Td>
        <Table.Td>
          <Button size="xs" onClick={() => handleShareClick(log.id)}>Share</Button>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Share Attack Log" size="lg">
      {loading && (
        <Group justify="center" p="xl">
          <Loader size="md" />
        </Group>
      )}
      
      {error && <Alert color="red" title="Error">{error}</Alert>}
      
      {!loading && !error && attackLogs.length === 0 && (
        <Text ta="center" p="md">No recent attack logs found.</Text>
      )}
      
      {!loading && !error && attackLogs.length > 0 && (
        <>
          <ScrollArea h={300}>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Battle</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Outcome</Table.Th>
                  <Table.Th>Action</Table.Th>
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
        <Button variant="default" onClick={onClose}>Cancel</Button>
      </Group>
    </Modal>
  );
};

export default AttackLogShareModal;