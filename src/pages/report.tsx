import {
  Autocomplete,
  Avatar,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { ReportCategory } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

const ReportPage = () => {
  const router = useRouter();
  const { userId: queryUserId, username: queryUsername } = router.query;

  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [usersData, setUsersData] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchUsers = async (searchTerm: string) => {
    if (!searchTerm.trim()) return [];
    setSearchLoading(true);
    try {
      const response = await fetch(
        `/api/general/searchUsers?name=${searchTerm}`,
      );
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      return data.map((user: any) => ({
        value: user.display_name,
        label: user.display_name,
        image: user.avatar,
        id: user.id,
      }));
    } catch (error) {
      logError('Failed to fetch users:', error);
      return [];
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearch = useDebouncedCallback(async (query) => {
    if (!query.trim()) {
      setUsersData([]);
      return;
    }
    setSearchLoading(true);
    const users = await fetchUsers(query);
    setUsersData(users);
    setSearchLoading(false);
  }, 300);

  useEffect(() => {
    if (queryUsername && queryUserId) {
      setSelectedUser(queryUsername as string);
      setSelectedUserId(Number(queryUserId));
    }
  }, [queryUsername, queryUserId]);

  useEffect(() => {
    const matched = usersData.find((u) => u.value === selectedUser);
    if (matched) {
      setSelectedUserId(matched.id);
    } else if (selectedUser !== queryUsername) {
      setSelectedUserId(null);
    }
  }, [selectedUser, usersData, queryUsername]);

  const handleSubmit = async () => {
    if (!selectedUserId) {
      notifications.show({
        title: 'Error',
        message: 'Please select a valid user to report.',
        color: 'red',
      });
      return;
    }
    if (!category) {
      notifications.show({
        title: 'Error',
        message: 'Please select a category.',
        color: 'red',
      });
      return;
    }
    if (description.length < 10) {
      notifications.show({
        title: 'Error',
        message: 'Description must be at least 10 characters.',
        color: 'red',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/reports/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedUserId: selectedUserId,
          category,
          subject: subject || undefined,
          description,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit report');
      }

      notifications.show({
        title: 'Success',
        message: 'Your report has been successfully submitted.',
        color: 'green',
      });

      router.push('/home/overview');
    } catch (error) {
      logError('Failed to submit report:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to submit report. Please try again later.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderAutocompleteOption = ({ option }: { option: any }) => (
    <Group>
      <Avatar src={option.image} size="sm" radius="xl" />
      <div>
        <Text size="sm">{option.label}</Text>
        <Text size="xs" opacity={0.5}>
          ID: {option.id}
        </Text>
      </div>
    </Group>
  );

  return (
    <MainArea title="File a Report">
      <GameCard title="Report Form">
        <Stack gap="md">
          <Autocomplete
            label="Reported User"
            placeholder="Type to search users..."
            value={selectedUser}
            onChange={(val) => {
              setSelectedUser(val);
              handleSearch(val);
            }}
            data={usersData}
            renderOption={renderAutocompleteOption}
            limit={5}
            rightSection={searchLoading ? <Loader size="xs" /> : null}
            disabled={!!queryUsername}
          />

          <Select
            label="Category"
            placeholder="Select reason for report"
            data={Object.values(ReportCategory).map((cat) => ({
              value: cat,
              label: cat.replace('_', ' '),
            }))}
            value={category}
            onChange={setCategory}
          />

          <TextInput
            label="Subject (Optional)"
            placeholder="Brief summary of the issue"
            value={subject}
            onChange={(e) => setSubject(e.currentTarget.value)}
          />

          <Textarea
            label="Description"
            placeholder="Please describe the incident in detail (min 10 characters)"
            minRows={4}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />

          <Group justify="flex-end" mt="md">
            <Button
              variant="outline"
              color="gray"
              onClick={() => router.back()}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleSubmit}
              loading={submitting}
              disabled={!selectedUserId || !category || description.length < 10}
            >
              Submit Report
            </Button>
          </Group>
        </Stack>
      </GameCard>
    </MainArea>
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

export default ReportPage;
