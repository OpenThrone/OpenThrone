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
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import {
  PermissionType,
  ReportCategory,
  ReportPriority,
  ReportStatus,
} from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

const ReportsQueuePage = () => {
  const { t } = useTranslation('moderation-admin');
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
      title={t('reportsPageTitle')}
      permission={PermissionType.REVIEW_REPORTS}
    >
      <Stack gap="md">
        <GameCard title={t('reportsFilters')}>
          <Group grow>
            <Select
              label={t('colStatus')}
              placeholder={t('allStatuses')}
              data={[
                { value: '', label: t('reportsAll') },
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
              label={t('reportsColCategory')}
              placeholder={t('reportsAllCategories')}
              data={[
                { value: '', label: t('reportsAll') },
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
              label={t('reportsColPriority')}
              placeholder={t('reportsAllPriorities')}
              data={[
                { value: '', label: t('reportsAll') },
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

        <GameCard title={t('reportsListTitle', { count: total })}>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : reports.length === 0 ? (
            <Text py="xl" ta="center" c="dimmed">
              {t('reportsEmpty')}
            </Text>
          ) : (
            <Stack gap="md">
              <Table.ScrollContainer minWidth={800}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('colId')}</Table.Th>
                      <Table.Th>{t('reportsColReporter')}</Table.Th>
                      <Table.Th>{t('reportsColReportedUser')}</Table.Th>
                      <Table.Th>{t('reportsColCategory')}</Table.Th>
                      <Table.Th>{t('reportsColPriority')}</Table.Th>
                      <Table.Th>{t('colStatus')}</Table.Th>
                      <Table.Th>{t('reportsColAssignedTo')}</Table.Th>
                      <Table.Th>{t('reportsColCreatedAt')}</Table.Th>
                      <Table.Th>{t('colAction')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {reports.map((report) => (
                      <Table.Tr key={report.id}>
                        <Table.Td>{report.id}</Table.Td>
                        <Table.Td>
                          {report.reporter?.display_name || t('reportsSystem')}
                        </Table.Td>
                        <Table.Td>
                          {report.reportedUser?.display_name ||
                            t('notAvailable')}
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
                          {report.assignedTo?.display_name ||
                            t('reportsUnassigned')}
                        </Table.Td>
                        <Table.Td>
                          {new Date(report.createdAt).toLocaleString()}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            component={Link}
                            href={`/home/moderation/reports/${report.id}`}
                            size="xs"
                            variant="default"
                            aria-label={t('reportsViewAria', { id: report.id })}
                          >
                            {t('reportsView')}
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

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
        'moderation-admin',
      ])),
    },
  };
};

export default ReportsQueuePage;
