import { Button, Group, Select, TextInput } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';

interface UserSearchFilterProps {
  onSearch: (filters: Record<string, string>) => void;
}

const UserSearchFilter: React.FC<UserSearchFilterProps> = ({ onSearch }) => {
  const { t } = useTranslation('admin-users');
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handleSearch = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const filters = {
      ...(userId && { id: userId }),
      ...(username && { username }),
      ...(email && { email }),
      ...(status && { status }),
    };
    onSearch(filters);
  };

  return (
    <form onSubmit={handleSearch}>
      <Group align="end" grow>
        <TextInput
          label={t('filters.userId')}
          placeholder={t('filters.userIdPlaceholder')}
          value={userId}
          inputMode="numeric"
          maxLength={16}
          onChange={(event) => setUserId(event.currentTarget.value)}
        />
        <TextInput
          label={t('filters.username')}
          placeholder={t('filters.usernamePlaceholder')}
          value={username}
          maxLength={100}
          onChange={(event) => setUsername(event.currentTarget.value)}
        />
        <TextInput
          label={t('filters.email')}
          placeholder={t('filters.emailPlaceholder')}
          value={email}
          maxLength={254}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
        <Select
          label={t('filters.status')}
          placeholder={t('filters.anyStatus')}
          value={status}
          onChange={setStatus}
          data={[
            'ACTIVE',
            'IDLE',
            'INACTIVE',
            'VACATION',
            'SUSPENDED',
            'BANNED',
            'CLOSED',
          ].map((value) => ({ value, label: t(`filters.statuses.${value}`) }))}
          clearable
        />
        <Button type="submit">{t('filters.search')}</Button>
      </Group>
    </form>
  );
};

export default UserSearchFilter;
