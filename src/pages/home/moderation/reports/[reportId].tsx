import {
  Alert,
  Badge,
  Button,
  Grid,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Timeline,
} from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import {
  PermissionType,
  ReportPriority,
  ReportResolution,
  ReportStatus,
} from '@/lib/prisma-browser-exports';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

const ReportDetailsPage = () => {
  const router = useRouter();
  const { t } = useTranslation('moderation-admin');
  const { reportId } = router.query;

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadStatus, setLoadStatus] = useState<number | null>(null);
  const [assigning, setAssigning] = useState<boolean>(false);
  const [resolving, setResolving] = useState<boolean>(false);
  const [addingAction, setAddingAction] = useState<boolean>(false);

  const [resolution, setResolution] = useState<string | null>(null);
  const [resolutionSummary, setResolutionSummary] = useState<string>('');
  const [actionType, setActionType] = useState<string | null>(null);
  const [actionBody, setActionBody] = useState<string>('');
  const [newStatus, setNewStatus] = useState<string | null>(null);
  const [newPriority, setNewPriority] = useState<string | null>(null);

  const fetchReportDetails = async () => {
    if (!router.isReady) return;
    if (!reportId) {
      setLoading(false);
      setLoadStatus(400);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/${reportId}`);
      if (!response.ok) {
        setLoadStatus(response.status);
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setReport(data);
      setLoadStatus(null);
    } catch (error) {
      logError('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportDetails();
  }, [reportId]);

  const handleAssign = async () => {
    setAssigning(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error('Failed to assign report');
      alertService.notify('success', 'Report assigned to you.', {
        title: 'Success',
      });
      fetchReportDetails();
    } catch (error) {
      logError('Failed to assign:', error);
      alertService.notify('error', 'Failed to assign report.', {
        title: 'Error',
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleResolve = async () => {
    if (!resolution) {
      alertService.notify('error', 'Please select a resolution.', {
        title: 'Error',
      });
      return;
    }
    setResolving(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution,
          resolutionSummary: resolutionSummary || undefined,
        }),
      });
      if (!response.ok) throw new Error('Failed to resolve report');
      alertService.notify('success', 'Report resolved successfully.', {
        title: 'Success',
      });
      fetchReportDetails();
    } catch (error) {
      logError('Failed to resolve:', error);
      alertService.notify('error', 'Failed to resolve report.', {
        title: 'Error',
      });
    } finally {
      setResolving(false);
    }
  };

  const handleAddAction = async () => {
    if (!actionType) {
      alertService.notify('error', 'Please select an action type.', {
        title: 'Error',
      });
      return;
    }
    setAddingAction(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: actionType,
          body: actionBody || undefined,
          toStatus: actionType === 'STATUS_CHANGED' ? newStatus : undefined,
          toPriority:
            actionType === 'PRIORITY_CHANGED' ? newPriority : undefined,
        }),
      });
      if (!response.ok) throw new Error('Failed to add action');
      alertService.notify('success', 'Action updated successfully.', {
        title: 'Success',
      });
      setActionBody('');
      setActionType(null);
      setNewStatus(null);
      setNewPriority(null);
      fetchReportDetails();
    } catch (error) {
      logError('Failed to update action:', error);
      alertService.notify('error', 'Failed to update action.', {
        title: 'Error',
      });
    } finally {
      setAddingAction(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout
        title="Report Details"
        permission={PermissionType.REVIEW_REPORTS}
      >
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </AdminLayout>
    );
  }

  if (!report) {
    return (
      <AdminLayout
        title="Report Details"
        permission={PermissionType.REVIEW_REPORTS}
      >
        <Stack align="center" py="xl">
          <Alert
            color={
              loadStatus === 403 ? 'red' : loadStatus === 404 ? 'yellow' : 'red'
            }
            role="alert"
          >
            {loadStatus === 403
              ? t('reportForbidden')
              : loadStatus === 404
                ? t('reportNotFound')
                : loadStatus
                  ? t('reportLoadFailed')
                  : t('reportUnavailable')}
          </Alert>
          {loadStatus !== 404 && (
            <Button onClick={fetchReportDetails}>{t('retry')}</Button>
          )}
        </Stack>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={`Report Details #${report.id}`}
      permission={PermissionType.REVIEW_REPORTS}
    >
      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            <GameCard title="Information">
              <Grid>
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed">
                    Reporter:
                  </Text>
                  <Text fw={700}>
                    {report.reporter?.display_name || 'System'} (ID:{' '}
                    {report.reporterUserId})
                  </Text>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed">
                    Reported User:
                  </Text>
                  <Text fw={700}>
                    {report.reportedUser?.display_name || 'N/A'} (ID:{' '}
                    {report.reportedUserId})
                  </Text>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed">
                    Category:
                  </Text>
                  <Text fw={700}>{report.category.replace('_', ' ')}</Text>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed">
                    Priority:
                  </Text>
                  <Badge>{report.priority}</Badge>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed">
                    Status:
                  </Text>
                  <Badge>{report.status}</Badge>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text size="sm" c="dimmed">
                    Assigned To:
                  </Text>
                  <Text fw={700}>
                    {report.assignedTo?.display_name || 'Unassigned'}
                  </Text>
                </Grid.Col>
              </Grid>
            </GameCard>

            <GameCard title="Description">
              {report.subject && (
                <Text size="lg" fw={700} mb="xs">
                  {report.subject}
                </Text>
              )}
              <Text style={{ whiteSpace: 'pre-wrap' }}>
                {report.description}
              </Text>
            </GameCard>

            {report.chatMessage && (
              <GameCard title="Linked Chat Message">
                <Text size="sm" c="dimmed">
                  Sent at:{' '}
                  {new Date(report.chatMessage.sentAt).toLocaleString()}
                </Text>
                <Paper p="xs" mt="xs" withBorder>
                  <Text>{report.chatMessage.content}</Text>
                </Paper>
              </GameCard>
            )}

            <GameCard title="Actions Timeline">
              <Timeline
                active={(report.actions || []).length - 1}
                bulletSize={24}
                lineWidth={2}
              >
                {(report.actions || []).map((act: any) => (
                  <Timeline.Item key={act.id} title={act.type}>
                    <Text size="sm">
                      By {act.actor?.display_name || 'System'} at{' '}
                      {new Date(act.createdAt).toLocaleString()}
                    </Text>
                    {act.body && (
                      <Text size="xs" c="dimmed" mt="xs">
                        {act.body}
                      </Text>
                    )}
                  </Timeline.Item>
                ))}
              </Timeline>
            </GameCard>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            {!report.assignedToUserId && (
              <Button fullWidth onClick={handleAssign} loading={assigning}>
                Claim / Self-Assign
              </Button>
            )}

            {report.status !== 'RESOLVED' && (
              <GameCard title="Resolve Report">
                <Stack gap="sm">
                  <Select
                    label="Resolution"
                    placeholder="Select Resolution"
                    data={Object.values(ReportResolution).map((r) => ({
                      value: r,
                      label: r.replace('_', ' '),
                    }))}
                    value={resolution}
                    onChange={setResolution}
                  />
                  <Textarea
                    label="Resolution Summary"
                    placeholder="Summary details of resolution"
                    value={resolutionSummary}
                    onChange={(e) =>
                      setResolutionSummary(e.currentTarget.value)
                    }
                  />
                  <Button
                    color="green"
                    fullWidth
                    onClick={handleResolve}
                    loading={resolving}
                  >
                    Resolve Report
                  </Button>
                </Stack>
              </GameCard>
            )}

            {report.status !== 'RESOLVED' && (
              <GameCard title="Manage Status & Priority">
                <Stack gap="sm">
                  <Select
                    label="Action"
                    placeholder="Choose Action"
                    data={[
                      { value: 'NOTE_ADDED', label: 'Add Note' },
                      { value: 'STATUS_CHANGED', label: 'Change Status' },
                      { value: 'PRIORITY_CHANGED', label: 'Change Priority' },
                    ]}
                    value={actionType}
                    onChange={setActionType}
                  />

                  {actionType === 'STATUS_CHANGED' && (
                    <Select
                      label="New Status"
                      placeholder="Choose Status"
                      data={Object.values(ReportStatus).map((s) => ({
                        value: s,
                        label: s,
                      }))}
                      value={newStatus}
                      onChange={setNewStatus}
                    />
                  )}

                  {actionType === 'PRIORITY_CHANGED' && (
                    <Select
                      label="New Priority"
                      placeholder="Choose Priority"
                      data={Object.values(ReportPriority).map((p) => ({
                        value: p,
                        label: p,
                      }))}
                      value={newPriority}
                      onChange={setNewPriority}
                    />
                  )}

                  <Textarea
                    label="Body"
                    placeholder="Details/note context..."
                    value={actionBody}
                    onChange={(e) => setActionBody(e.currentTarget.value)}
                  />

                  <Button
                    fullWidth
                    onClick={handleAddAction}
                    loading={addingAction}
                  >
                    Update Action
                  </Button>
                </Stack>
              </GameCard>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
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

export default ReportDetailsPage;
