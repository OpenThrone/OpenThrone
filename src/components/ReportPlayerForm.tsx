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
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { searchPlayersByName } from '@/components/alliance/playerSearch';
import { ReportCategory } from '@/lib/prisma-browser-exports';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

interface ReportPlayerFormProps {
  /** Player being reported; when set the player field is fixed. */
  presetUserId?: number | null;
  presetUsername?: string | null;
  onDone: () => void;
  onCancel: () => void;
}

/** Report form shared by the /report page and the profile report modal. */
export const ReportPlayerForm = ({
  presetUserId = null,
  presetUsername = null,
  onDone,
  onCancel,
}: ReportPlayerFormProps) => {
  const { t } = useTranslation('common');
  const [selectedUser, setSelectedUser] = useState<string>(
    presetUserId ? (presetUsername ?? `#${presetUserId}`) : '',
  );
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    presetUserId ?? null,
  );
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
      const matches = await searchPlayersByName(searchTerm);
      return matches.map((match) => ({
        value: match.displayName,
        label: match.displayName,
        image: match.avatarSrc,
        id: match.id,
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

  // The selected id follows the name: a search match, the player passed in
  // the link (?username=&userId=), or nothing. Both effects used to run in the
  // same commit and this one cleared the prefilled id, so Submit stayed off.
  useEffect(() => {
    const matched = usersData.find((u) => u.value === selectedUser);
    if (matched) {
      setSelectedUserId(matched.id);
    } else if (
      presetUserId &&
      selectedUser === (presetUsername ?? `#${presetUserId}`)
    ) {
      setSelectedUserId(presetUserId);
    } else {
      setSelectedUserId(null);
    }
  }, [selectedUser, usersData, presetUserId, presetUsername]);

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

      onDone();
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
        disabled={!!presetUserId}
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
          onClick={onCancel}
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
  );
};
