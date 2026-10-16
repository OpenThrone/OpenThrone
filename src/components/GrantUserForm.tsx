import {
  Alert,
  Autocomplete,
  Avatar,
  Button,
  Group,
  Loader,
  MultiSelect,
  Stack,
  Text,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PermissionType } from '@/lib/prisma-browser-exports';

interface SearchUser {
  value: string;
  label: string;
  image?: string | null;
  id: number;
  permissions: string[];
}

const GrantUserForm = () => {
  const { t } = useTranslation('admin-users');
  const [selectedName, setSelectedName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((candidate) => candidate.label === selectedName),
    [selectedName, users],
  );

  const fetchUsers = useCallback(
    async (query: string) => {
      if (!query.trim()) return [];
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/general/searchUsers?name=${encodeURIComponent(query.trim())}`,
        );
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error(t('errors.search'));
        return Array.isArray(payload)
          ? (payload.map((candidate) => ({
              value: candidate.display_name,
              label: candidate.display_name,
              image: candidate.avatar,
              id: candidate.id,
              permissions: Array.isArray(candidate.permissions)
                ? candidate.permissions.map(
                    (permission: { type?: string } | string) =>
                      typeof permission === 'string'
                        ? permission
                        : (permission.type ?? ''),
                  )
                : [],
            })) as SearchUser[])
          : [];
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t('errors.search'),
        );
        return [];
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const debouncedSearch = useDebouncedCallback(async (query: string) => {
    setUsers(await fetchUsers(query));
  }, 300);

  useEffect(() => {
    if (selectedName.trim()) debouncedSearch(selectedName);
    else setUsers([]);
  }, [debouncedSearch, selectedName]);

  useEffect(() => {
    setSelectedPermissions(selectedUser?.permissions ?? []);
  }, [selectedUser]);

  const grantPermissions = async () => {
    if (!selectedUser || pending) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      for (const permission of selectedPermissions) {
        const response = await fetch('/api/admin/grantPermission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: selectedUser.label, permission }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || t('errors.grant'));
      }
      setSuccess(
        t('messages.permissionsSaved', { username: selectedUser.label }),
      );
      setSelectedName('');
      setSelectedPermissions([]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('errors.grant'),
      );
    } finally {
      setPending(false);
    }
  };

  const renderOption = ({ option }: { option: { value: string } }) => {
    const found = users.find((candidate) => candidate.value === option.value);
    return (
      <Group wrap="nowrap">
        <Avatar src={found?.image} size="md" radius="xl" />
        <div>
          <Text size="sm">{option.value}</Text>
          {found && (
            <Text size="xs" c="dimmed">
              {t('fields.accountId')}: {found.id}
            </Text>
          )}
        </div>
      </Group>
    );
  };

  return (
    <Stack gap="sm">
      <Autocomplete
        label={t('grant.userSearch')}
        value={selectedName}
        onChange={setSelectedName}
        data={users.map((candidate) => ({
          value: candidate.value,
          label: candidate.label,
        }))}
        placeholder={t('grant.searchPlaceholder')}
        renderOption={renderOption}
        limit={8}
        rightSection={loading ? <Loader size="xs" /> : null}
        rightSectionPointerEvents="none"
      />
      <MultiSelect
        label={t('grant.permissions')}
        description={t('grant.permissionsHelp')}
        data={Object.values(PermissionType)}
        value={selectedPermissions}
        onChange={setSelectedPermissions}
        disabled={!selectedUser || pending}
        placeholder={t('grant.permissionsPlaceholder')}
        searchable
        clearable
      />
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {success && (
        <Alert color="green" role="status">
          {success}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button
          onClick={grantPermissions}
          loading={pending}
          disabled={!selectedUser || pending}
        >
          {t('actions.savePermissions')}
        </Button>
      </Group>
    </Stack>
  );
};

export default GrantUserForm;
