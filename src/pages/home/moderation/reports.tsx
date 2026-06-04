import {
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import {
  PermissionType,
  ReportCategory,
  ReportPriority,
  ReportStatus,
} from '@prisma/client';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

const ReportsQueuePage = () => {
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

  const limit = 15;

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (priorityFilter) params.append('priority', priorityFilter);

      const response = await fetch(`/api/reports?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch reports');
      const data = await response.json();
      setReports(data.reports || []);
      setTotal(data.total || 0);
    } catch (error) {
      logError('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [page, statusFilter, categoryFilter, priorityFilter]);

  const getPriorityColor = (prio: ReportPriority) => {
    switch (prio) {
      case ReportPriority.LOW:
        return 'gray';
      case ReportPriority.NORMAL:
        return 'blue';
      case ReportPriority.HIGH:
        return 'orange';
      case ReportPriority.URGENT:
        return 'red';
      default:
        return 'blue';
    }
  };

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case ReportStatus.OPEN:
        return 'red';
      case ReportStatus.TRIAGED:
        return 'orange';
      case ReportStatus.IN_REVIEW:
        return 'yellow';
      case ReportStatus.RESOLVED:
        return 'green';
      case ReportStatus.DISMISSED:
        return 'gray';
      case ReportStatus.ESCALATED:
        return 'violet';
      default:
        return 'blue';
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout
      title="Moderation: Report Queue"
      permission={PermissionType.REVIEW_REPORTS}
    >
      <Stack gap="md">
        <GameCard title="Filters">
          <Group grow>
            <Select
              label="Status"
              placeholder="All Statuses"
              data={[
                { value: '', label: 'All' },
                ...Object.values(ReportStatus).map((status) => ({
                  value: status,
                  label: status,
                })),
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
            />

            <Select
              label="Category"
              placeholder="All Categories"
              data={[
                { value: '', label: 'All' },
                ...Object.values(ReportCategory).map((cat) => ({
                  value: cat,
                  label: cat.replace('_', ' '),
                })),
              ]}
              value={categoryFilter}
              onChange={setCategoryFilter}
              clearable
            />

            <Select
              label="Priority"
              placeholder="All Priorities"
              data={[
                { value: '', label: 'All' },
                ...Object.values(ReportPriority).map((prio) => ({
                  value: prio,
                  label: prio,
                })),
              ]}
              value={priorityFilter}
              onChange={setPriorityFilter}
              clearable
            />
          </Group>
        </GameCard>

        <GameCard title={`Reports (${total})`}>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : reports.length === 0 ? (
            <Text py="xl" ta="center" c="dimmed">
              No reports found matching your criteria.
            </Text>
          ) : (
            <Stack gap="md">
              <Table.ScrollContainer minWidth={800}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Reporter</Table.Th>
                      <Table.Th>Reported User</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th>Priority</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Assigned To</Table.Th>
                      <Table.Th>Created At</Table.Th>
                      <Table.Th>Action</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {reports.map((report) => (
                      <Table.Tr key={report.id}>
                        <Table.Td>{report.id}</Table.Td>
                        <Table.Td>
                          {report.reporter?.display_name || 'System'}
                        </Table.Td>
                        <Table.Td>
                          {report.reportedUser?.display_name || 'N/A'}
                        </Table.Td>
                        <Table.Td>{report.category.replace('_', ' ')}</Table.Td>
                        <Table.Td>
                          <Badge color={getPriorityColor(report.priority)}>
                            {report.priority}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={getStatusColor(report.status)}>
                            {report.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {report.assignedTo?.display_name || 'Unassigned'}
                        </Table.Td>
                        <Table.Td>
                          {new Date(report.createdAt).toLocaleString()}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            component={Link}
                            href={`/home/moderation/reports/${report.id}`}
                            size="xs"
                            variant="outline"
                          >
                            View
                          </Button>
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

export default ReportsQueuePage;
