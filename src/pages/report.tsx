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
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { ReportCategory } from '@/lib/prisma-browser-exports';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

const ReportPage = () => {
  const router = useRouter();
  const { t } = useTranslation('common');
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
        `/api/general/searchUsers?name=${encodeURIComponent(searchTerm.trim())}`,
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

  // The selected id follows the name: a search match, the player passed in
  // the link (?username=&userId=), or nothing. Both effects used to run in the
  // same commit and this one cleared the prefilled id, so Submit stayed off.
  useEffect(() => {
    const matched = usersData.find((u) => u.value === selectedUser);
    if (matched) {
      setSelectedUserId(matched.id);
    } else if (queryUsername && queryUserId && selectedUser === queryUsername) {
      setSelectedUserId(Number(queryUserId));
    } else {
      setSelectedUserId(null);
    }
  }, [selectedUser, usersData, queryUsername, queryUserId]);

  const handleSubmit = async () => {
    if (!selectedUserId) {
      alertService.notify('error', t('report.selectUser'), {
        title: t('report.errorTitle'),
      });
      return;
    }
    if (!category) {
      alertService.notify('error', t('report.selectCategory'), {
        title: t('report.errorTitle'),
      });
      return;
    }
    if (description.length < 10) {
      alertService.notify('error', t('report.descriptionTooShort'), {
        title: t('report.errorTitle'),
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

      alertService.notify('success', t('report.submitted'), {
        title: t('report.successTitle'),
      });

      router.push('/home/overview');
    } catch (error) {
      logError('Failed to submit report:', error);
      alertService.notify('error', t('report.submitFailed'), {
        title: t('report.errorTitle'),
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
    <MainArea title={t('report.title')}>
      <GameCard title={t('report.formTitle')}>
        <Stack gap="md">
          <Autocomplete
            label={t('report.reportedUser')}
            placeholder={t('report.searchUsers')}
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
            label={t('report.category')}
            placeholder={t('report.categoryPlaceholder')}
            data={Object.values(ReportCategory).map((cat) => ({
              value: cat,
              label: t(`report.categories.${cat}`),
            }))}
            value={category}
            onChange={setCategory}
          />

          <TextInput
            label={t('report.subject')}
            placeholder={t('report.subjectPlaceholder')}
            value={subject}
            onChange={(e) => setSubject(e.currentTarget.value)}
          />

          <Textarea
            label={t('report.description')}
            placeholder={t('report.descriptionPlaceholder')}
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
              {t('report.cancel')}
            </Button>
            <Button
              color="red"
              onClick={handleSubmit}
              loading={submitting}
              disabled={!selectedUserId || !category || description.length < 10}
            >
              {t('report.submit')}
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
