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
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

const AuditLogsPage = () => {
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [actionSearch, setActionSearch] = useState<string>('');
  const [userIdFilter, setUserIdFilter] = useState<string>('');
  const [targetUserIdFilter, setTargetUserIdFilter] = useState<string>('');

  const limit = 20;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      if (actionSearch) params.append('action', actionSearch);
      if (userIdFilter) params.append('userId', userIdFilter);
      if (targetUserIdFilter) params.append('targetUserId', targetUserIdFilter);

      const response = await fetch(
        `/api/admin/system/audit-logs?${params.toString()}`,
      );
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (error) {
      logError('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
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
          ) : logs.length === 0 ? (
            <Text py="xl" ta="center" c="dimmed">
              No audit logs found.
            </Text>
          ) : (
            <Stack gap="md">
              <Table.ScrollContainer minWidth={800}>
                <Table striped highlightOnHover>
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
                          {log.user?.display_name || 'System'} (ID: {log.userId}
                          )
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
                </Table>
              </Table.ScrollContainer>

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
      ])),
    },
  };
};

export default AuditLogsPage;
