import {
  Alert,
  Button,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  TextInput,
} from '@mantine/core';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

const AllianceAdminPage = () => {
  const { t } = useTranslation('admin-game');
  const [alliances, setAlliances] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dissolvingId, setDissolvingId] = useState<number | null>(null);
  const [dissolveTarget, setDissolveTarget] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  const limit = 20;

  const fetchAlliances = async (pageNumber = page, searchTerm = search) => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((pageNumber - 1) * limit).toString(),
      });
      if (searchTerm) params.append('search', searchTerm);
      const res = await fetch(`/api/admin/game/alliances?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlliances(data.alliances || []);
      setTotal(data.total || 0);
    } catch (err) {
      logError('Failed to load alliances:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlliances();
  }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchAlliances(1, search);
  };

  const handleDissolve = async (id: number) => {
    setDissolvingId(id);
    try {
      const res = await fetch(`/api/admin/game/alliances?allianceId=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        alertService.notify('success', 'Alliance dissolved.', {
          title: 'Dissolved',
        });
        fetchAlliances();
      } else {
        alertService.notify('error', t('dissolveError'), {
          title: t('alliancesTitle'),
        });
      }
    } catch {
      alertService.notify('error', t('dissolveError'), {
        title: t('alliancesTitle'),
      });
    } finally {
      setDissolvingId(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout title={t('alliancesTitle')} permissions={['MANAGE_ALLIANCES']}>
      <Stack gap="md">
        <GameCard title="Search">
          <Group>
            <TextInput
              placeholder={t('searchAlliance')}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button onClick={handleSearch}>{t('search')}</Button>
          </Group>
        </GameCard>

        <GameCard title={t('allianceCount', { count: total })}>
          {loadError && (
            <Alert color="red" title={t('allianceLoadError')} mb="md">
              <Button
                variant="default"
                size="xs"
                onClick={() => fetchAlliances()}
              >
                {t('retryLoad')}
              </Button>
            </Alert>
          )}
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : (
            <Stack gap="md">
              <AdminDataTable ariaLabel={t('allianceCount', { count: total })}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>{t('leader')}</Table.Th>
                    <Table.Th>{t('members')}</Table.Th>
                    <Table.Th>{t('created')}</Table.Th>
                    <Table.Th>{t('actions')}</Table.Th>
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
                          onClick={() => setDissolveTarget(a.id)}
                          loading={dissolvingId === a.id}
                        >
                          {t('dissolve')}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AdminDataTable>
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
      <ConfirmationModal
        isOpen={dissolveTarget !== null}
        onClose={() => setDissolveTarget(null)}
        onConfirm={() => {
          if (dissolveTarget !== null) handleDissolve(dissolveTarget);
          setDissolveTarget(null);
        }}
        title="Dissolve alliance"
        message={t('dissolveConfirm')}
        confirmText={t('dissolve')}
        cancelText={t('cancel')}
        isLoading={dissolvingId !== null}
        type="destructive"
      />
    </AdminLayout>
  );
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
        'admin-game',
      ])),
    },
  };
};

export default AllianceAdminPage;
