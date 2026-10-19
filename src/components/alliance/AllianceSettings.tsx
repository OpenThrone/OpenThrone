import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { AllianceInvitePanel } from '@/components/alliance/AllianceInvites';
import { classLabel, raceLabel } from '@/components/alliance/allianceLabels';
import { allianceRequest } from '@/components/alliance/allianceStanding';
import { ConfirmActionModal } from '@/components/alliance/ConfirmActionModal';
import { TreasurySettingsCard } from '@/components/alliance/treasury/TreasurySettingsCard';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';
import { toLocale } from '@/utils/numberFormatting';

interface AllianceSettingsProps {
  alliance: AllianceInfo;
  onUpdate?: () => void; // Callback to reload main data
  isLeader?: boolean;
  /** Rank may accept or reject join requests (invite_member). */
  canManageRequests?: boolean;
  /** Rank may edit the public profile (edit_profile). */
  canEditProfile?: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/** Alliance settings. */
export const AllianceSettings = ({
  alliance,
  onUpdate,
  isLeader = false,
  canManageRequests = false,
  canEditProfile = false,
}: AllianceSettingsProps) => {
  const canManage = isLeader || canManageRequests;
  const canEdit = isLeader || canEditProfile;
  const { t } = useTranslation('alliances');
  const { user } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [exitAction, setExitAction] = useState<'leave' | 'disband' | null>(
    null,
  );
  const [exiting, setExiting] = useState(false);

  const handleExit = async () => {
    if (!exitAction) return;
    setExiting(true);
    try {
      if (exitAction === 'leave') {
        await allianceRequest('/api/alliances/leave', {
          allianceId: alliance.id,
        });
        alertService.success(
          t('index.leaveSuccess', 'You have left the alliance'),
        );
      } else {
        await allianceRequest('/api/alliances/disband', {
          allianceId: alliance.id,
          confirmName: alliance.name,
        });
        alertService.success(
          t('manage.disbanded', 'The alliance is disbanded'),
        );
      }
      setExitAction(null);
      await router.push('/alliances');
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setExiting(false);
    }
  };

  // Settings Form
  const form = useForm({
    initialValues: {
      motto: alliance.motto || '',
      comments: alliance.comments || '',
      avatar: alliance.avatar || '',
      // Map enum values carefully. If backend gave string, it works.
      join_mode: (alliance as any).join_mode || 'OPEN',
      roster_visibility: (alliance as any).roster_visibility || 'PUBLIC',
    },
    validate: {
      motto: (val) =>
        val && val.length > 255 ? t('create.mottoTooLong') : null,
      comments: (val) =>
        val && val.length > 1000 ? t('create.commentsTooLong') : null,
    },
  });

  const handleUpdate = async (values: typeof form.values) => {
    setLoading(true);
    try {
      const res = await fetch('/api/alliances/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allianceId: alliance.id,
          // Join mode and roster visibility are the leader's call.
          ...(isLeader
            ? values
            : { motto: values.motto, comments: values.comments }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alertService.success(
        t('settings.updateSuccess', 'Settings updated successfully'),
      );
      if (onUpdate) onUpdate();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Join Requests
  const { data: requests, mutate: reloadRequests } = useSWR(
    canManage ? `/api/alliances/requests?allianceId=${alliance.id}` : null,
    fetcher,
  );

  const handleRequest = async (
    requestId: number,
    action: 'accept' | 'reject',
  ) => {
    try {
      const res = await fetch(`/api/alliances/requests/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alertService.success(
        action === 'accept'
          ? t('settings.acceptSuccess', 'Join request accepted')
          : t('settings.rejectSuccess', 'Join request rejected'),
      );
      reloadRequests();
      if (action === 'accept' && onUpdate) onUpdate(); // Refresh member count
    } catch (error: any) {
      alertService.error(error.message);
    }
  };

  return (
    <Stack gap="lg">
      {canManage && <AllianceInvitePanel allianceId={alliance.id} />}

      {/* Join Requests Section */}
      {canManage && (
        <Paper p="md" radius="md" withBorder>
          <Title order={4} mb="md">
            {t('settings.requestsTitle', 'Join Requests')}
          </Title>
          {!requests ? (
            <Loader size="sm" />
          ) : !Array.isArray(requests) || requests.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t('settings.noRequests', 'No pending requests')}
            </Text>
          ) : (
            <Table>
              <Table.Tbody>
                {requests.map((req: any) => (
                  <Table.Tr key={req.id}>
                    <Table.Td>
                      <Group gap="sm">
                        {/* Avatar if we had it in join request include, but we only selected user... */}
                        {/* <Avatar size="sm" /> */}
                        <Text size="sm" fw={500}>
                          {req.user.display_name}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="outline" size="sm">
                        {raceLabel(t, req.user.race)}
                      </Badge>
                      <Badge variant="outline" size="sm" ml="xs">
                        {classLabel(t, req.user.class)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {t('settings.level', 'Lvl {{level}}', {
                          level: toLocale(req.user.level ?? 0, user?.locale),
                        })}
                      </Text>
                    </Table.Td>
                    <Table.Td align="right">
                      <Group gap="xs" justify="flex-end">
                        <ActionIcon
                          color="green"
                          variant="subtle"
                          onClick={() => handleRequest(req.id, 'accept')}
                          title={t('settings.accept', 'Accept')}
                        >
                          <FontAwesomeIcon icon={faCheck} />
                        </ActionIcon>
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => handleRequest(req.id, 'reject')}
                          title={t('settings.reject', 'Reject')}
                        >
                          <FontAwesomeIcon icon={faXmark} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      )}

      {/* General Settings Section */}
      {canEdit && (
        <Paper p="md" radius="md" withBorder>
          <Title order={4} mb="md">
            {t('settings.generalTitle', 'General Settings')}
          </Title>
          <form onSubmit={form.onSubmit(handleUpdate)}>
            <Stack gap="sm">
              <Group grow>
                <TextInput
                  label={t('create.motto', 'Motto')}
                  {...form.getInputProps('motto')}
                />
              </Group>
              <Textarea
                label={t('create.comments', 'Description')}
                minRows={3}
                {...form.getInputProps('comments')}
              />
              {isLeader && (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select
                    label={t('create.joinMode', 'Join Mode')}
                    data={[
                      {
                        value: 'OPEN',
                        label: t('create.joinModeOpen', 'Open'),
                      },
                      {
                        value: 'REQUEST_TO_JOIN',
                        label: t('create.joinModeRequest', 'Request to Join'),
                      },
                      {
                        value: 'INVITE_ONLY',
                        label: t('create.joinModeInvite', 'Invite Only'),
                      },
                    ]}
                    {...form.getInputProps('join_mode')}
                  />
                  <Select
                    label={t('create.rosterVisibility', 'Roster Visibility')}
                    data={[
                      {
                        value: 'PUBLIC',
                        label: t('create.rosterPublic', 'Public'),
                      },
                      {
                        value: 'MEMBERS_ONLY',
                        label: t('create.rosterMembersOnly', 'Members Only'),
                      },
                    ]}
                    {...form.getInputProps('roster_visibility')}
                  />
                </SimpleGrid>
              )}
              <Button type="submit" mt="md" loading={loading}>
                {t('settings.save', 'Save Changes')}
              </Button>
            </Stack>
          </form>
        </Paper>
      )}

      {isLeader && (
        <TreasurySettingsCard alliance={alliance} onUpdate={onUpdate} />
      )}

      <Paper p="md" radius="md" withBorder>
        <Title order={4} mb="xs">
          {isLeader
            ? t('manage.disbandTitle', 'Disband Alliance')
            : t('index.leaveAlliance', 'Leave Alliance')}
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          {isLeader
            ? t(
                'manage.disbandHelp',
                'Disbanding removes every member, rank and chat room. Any treasury is split evenly among the members (remainder to you), open loans are written off, and no war may be in progress. To step down instead, make another member leader from the Members tab.',
              )
            : t(
                'manage.leaveHelp',
                'You will lose access to the treasury, the war room and alliance chat.',
              )}
        </Text>
        <Button
          color="red"
          variant="light"
          onClick={() => setExitAction(isLeader ? 'disband' : 'leave')}
        >
          {isLeader
            ? t('manage.disbandTitle', 'Disband Alliance')
            : t('index.leaveAlliance', 'Leave Alliance')}
        </Button>
      </Paper>

      <ConfirmActionModal
        opened={exitAction === 'leave'}
        title={t('index.leaveAlliance', 'Leave Alliance')}
        message={t(
          'index.leaveConfirm',
          'Are you sure you want to leave this alliance?',
        )}
        confirmLabel={t('index.leaveAlliance', 'Leave Alliance')}
        loading={exiting}
        onClose={() => setExitAction(null)}
        onConfirm={handleExit}
      />
      <ConfirmActionModal
        opened={exitAction === 'disband'}
        title={t('manage.disbandTitle', 'Disband Alliance')}
        message={t(
          'manage.disbandConfirm',
          'This cannot be undone. Every member is removed from {{name}}, the treasury is split evenly among them and open loans are written off.',
          { name: alliance.name },
        )}
        confirmLabel={t('manage.disbandTitle', 'Disband Alliance')}
        requiredText={alliance.name}
        loading={exiting}
        onClose={() => setExitAction(null)}
        onConfirm={handleExit}
      />
    </Stack>
  );
};
