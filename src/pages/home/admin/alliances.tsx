import {
  Button,
  Group,
  Loader,
  Pagination,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PermissionType } from '@prisma/client';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import PermissionCheck from '@/components/PermissionCheck';
import { logError } from '@/utils/logger';

const AllianceAdminPage = () => {
  const [alliances, setAlliances] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dissolvingId, setDissolvingId] = useState<number | null>(null);

  const limit = 20;

  const fetchAlliances = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      if (search) params.append('search', search);
      const res = await fetch(`/api/admin/game/alliances?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAlliances(data.alliances || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      logError('Failed to load alliances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlliances();
  }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchAlliances();
  };

  const handleDissolve = async (id: number) => {
    if (!confirm('Are you sure? This will permanently delete the alliance.'))
      return;
    setDissolvingId(id);
    try {
      const res = await fetch(`/api/admin/game/alliances?allianceId=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        notifications.show({
          title: 'Dissolved',
          message: 'Alliance dissolved.',
          color: 'green',
        });
        fetchAlliances();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed.',
        color: 'red',
      });
    } finally {
      setDissolvingId(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <PermissionCheck permissions={['MANAGE_ALLIANCES']}>
      <MainArea title="Game: Alliance Administration">
        <Stack gap="md">
          <GameCard title="Search">
            <Group>
              <TextInput
                placeholder="Search by alliance name"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button onClick={handleSearch}>Search</Button>
            </Group>
          </GameCard>

          <GameCard title={`Alliances (${total})`}>
            {loading ? (
              <Group justify="center" py="xl">
                <Loader />
              </Group>
            ) : (
              <Stack gap="md">
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Leader</Table.Th>
                      <Table.Th>Members</Table.Th>
                      <Table.Th>Created</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {alliances.map((a) => (
                      <Table.Tr key={a.id}>
                        <Table.Td>{a.id}</Table.Td>
                        <Table.Td fw={700}>{a.name}</Table.Td>
                        <Table.Td>
                          {a.leader?.display_name || '—'} (ID: {a.leader_id})
                        </Table.Td>
                        <Table.Td>{a._count?.members ?? '—'}</Table.Td>
                        <Table.Td>
                          {a.created_at
                            ? new Date(a.created_at).toLocaleDateString()
                            : '—'}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            color="red"
                            variant="outline"
                            onClick={() => handleDissolve(a.id)}
                            loading={dissolvingId === a.id}
                          >
                            Dissolve
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                {totalPages > 1 && (
                  <Group justify="center">
                    <Pagination
                      value={page}
                      onChange={setPage}
                      total={totalPages}
                    />
                  </Group>
                )}
              </Stack>
            )}
          </GameCard>
        </Stack>
      </MainArea>
    </PermissionCheck>
  );
};

export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
      ])),
    },
  };
};

export default AllianceAdminPage;
