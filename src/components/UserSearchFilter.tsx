import { Button, Group, Select, TextInput } from '@mantine/core';
import React, { useState } from 'react';

interface UserSearchFilterProps {
  onSearch: (filters: Record<string, string>) => void;
}

const UserSearchFilter: React.FC<UserSearchFilterProps> = ({ onSearch }) => {
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handleSearch = () => {
    const filters = {
      ...(userId && { id: userId }),
      ...(username && { username }),
      ...(email && { email }),
      ...(status && { status }),
    };
    onSearch(filters);
  };

  return (
    <Group align="end" grow>
      <TextInput
        label="User ID"
        placeholder="Enter ID"
        value={userId}
        onChange={(event) => setUserId(event.currentTarget.value)}
      />
      <TextInput
        label="Username"
        placeholder="Enter Username"
        value={username}
        onChange={(event) => setUsername(event.currentTarget.value)}
      />
      <TextInput
        label="Email"
        placeholder="Enter Email"
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <Select
        label="Status"
        placeholder="Any"
        value={status}
        onChange={setStatus}
        data={['ACTIVE', 'VACATION', 'SUSPENDED', 'BANNED', 'CLOSED']}
        clearable
      />
      <Button onClick={handleSearch}>Search</Button>
    </Group>
  );
};

export default UserSearchFilter;
