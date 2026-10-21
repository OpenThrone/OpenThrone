import {
  Button,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

const AuditLogsPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState<number>(1);
  const [actionSearch, setActionSearch] = useState<string>('');
  const [userIdFilter, setUserIdFilter] = useState<string>('');
  const [targetUserIdFilter, setTargetUserIdFilter] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState({
    action: '',
    userId: '',
    targetUserId: '',
  });

  const limit = 20;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      if (appliedFilters.action) params.append('action', appliedFilters.action);
      if (appliedFilters.userId) params.append('userId', appliedFilters.userId);
      if (appliedFilters.targetUserId)
        params.append('targetUserId', appliedFilters.targetUserId);

      const response = await fetch(
        `/api/admin/system/audit-logs?${params.toString()}`,
      );
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setError(false);
    } catch (error) {
      logError('Failed to load audit logs:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, appliedFilters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedFilters({
      action: actionSearch.trim(),
      userId: userIdFilter.trim(),
      targetUserId: targetUserIdFilter.trim(),
    });
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout
      title="System Administration: Audit Logs"
      permission={PermissionType.VIEW_AUDIT_LOGS}
    >
      <Stack gap="md">
        <GameCard title="Filters">
          <form onSubmit={handleSearch}>
            <Group align="flex-end" grow>
              <TextInput
                label="Action Search"
                placeholder="Filter by action name"
                value={actionSearch}
                onChange={(e) => setActionSearch(e.currentTarget.value)}
              />
              <TextInput
                label="User ID"
                placeholder="Filter by actor ID"
                value={userIdFilter}
                onChange={(e) => setUserIdFilter(e.currentTarget.value)}
              />
              <TextInput
                label="Target User ID"
                placeholder="Filter by target ID"
                value={targetUserIdFilter}
                onChange={(e) => setTargetUserIdFilter(e.currentTarget.value)}
              />
              <Button type="submit">Apply Filters</Button>
            </Group>
          </form>
        </GameCard>

        <GameCard title={`Audit Logs (${total})`}>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : error ? (
            <Group justify="center" py="xl">
              <Text c="red" role="alert">
                Audit logs could not be loaded.
              </Text>
              <Button variant="default" onClick={fetchLogs}>
                Retry
              </Button>
            </Group>
          ) : logs.length === 0 ? (
            <Text py="xl" ta="center" c="dimmed">
              No audit logs found.
            </Text>
          ) : (
            <Stack gap="md">
              <AdminDataTable size="wide" ariaLabel="Audit logs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>User</Table.Th>
                    <Table.Th>Action</Table.Th>
                    <Table.Th>IP Address</Table.Th>
                    <Table.Th>Target User ID</Table.Th>
                    <Table.Th>Entity Type / ID</Table.Th>
                    <Table.Th>Timestamp</Table.Th>
                    <Table.Th>Details</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {logs.map((log) => (
                    <Table.Tr key={log.id}>
                      <Table.Td>{log.id}</Table.Td>
                      <Table.Td>
                        {log.user?.display_name || 'System'} (ID: {log.userId})
                      </Table.Td>
                      <Table.Td fw={700}>{log.action}</Table.Td>
                      <Table.Td>{log.ip || 'N/A'}</Table.Td>
                      <Table.Td>{log.targetUserId || 'N/A'}</Table.Td>
                      <Table.Td>
                        {log.entityType
                          ? `${log.entityType} (${log.entityId})`
                          : 'N/A'}
                      </Table.Td>
                      <Table.Td>
                        {new Date(log.timestamp).toLocaleString()}
                      </Table.Td>
                      <Table.Td
                        style={{ maxWidth: '300px', wordBreak: 'break-all' }}
                      >
                        {log.details ? JSON.stringify(log.details) : 'None'}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AdminDataTable>

              {totalPages > 1 && (
                <Group justify="center" mt="md">
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
        'admin-content',
      ])),
    },
  };
};

export default AuditLogsPage;
