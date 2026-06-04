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
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';

interface AllianceSettingsProps {
  alliance: AllianceInfo;
  onUpdate?: () => void; // Callback to reload main data
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export const AllianceSettings = ({
  alliance,
  onUpdate,
}: AllianceSettingsProps) => {
  const { t } = useTranslation('alliances');
  const [loading, setLoading] = useState(false);

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
      motto: (val) => (val && val.length > 255 ? 'Too long' : null),
      comments: (val) => (val && val.length > 1000 ? 'Too long' : null),
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
          ...values,
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
    `/api/alliances/requests?allianceId=${alliance.id}`,
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
        t(`settings.${action}Success`, `${action}ed successfully`),
      );
      reloadRequests();
      if (action === 'accept' && onUpdate) onUpdate(); // Refresh member count
    } catch (error: any) {
      alertService.error(error.message);
    }
  };

  return (
    <Stack gap="lg">
      {/* Join Requests Section */}
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
                      {req.user.race}
                    </Badge>
                    <Badge variant="outline" size="sm" ml="xs">
                      {req.user.class}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      Lvl {req.user.level}
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

      {/* General Settings Section */}
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
            <Group grow>
              <Select
                label={t('create.joinMode', 'Join Mode')}
                data={[
                  { value: 'OPEN', label: 'Open' },
                  { value: 'REQUEST_TO_JOIN', label: 'Request to Join' },
                  { value: 'INVITE_ONLY', label: 'Invite Only' },
                ]}
                {...form.getInputProps('join_mode')}
              />
              <Select
                label={t('create.rosterVisibility', 'Roster Visibility')}
                data={[
                  { value: 'PUBLIC', label: 'Public' },
                  { value: 'MEMBERS_ONLY', label: 'Members Only' },
                ]}
                {...form.getInputProps('roster_visibility')}
              />
            </Group>
            <Button type="submit" mt="md" loading={loading}>
              {t('settings.save', 'Save Changes')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
};
