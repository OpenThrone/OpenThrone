import React, { useState } from 'react';
import { TextInput, Button, Group, Box, Select } from '@mantine/core';

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
    <Box mb="md">
      <Group align="end">
        <TextInput
          label="User ID"
          placeholder="Enter User ID"
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
          placeholder="Select Status"
          value={status}
          onChange={setStatus}
          data={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'VACATION', label: 'Vacation' },
            { value: 'SUSPENDED', label: 'Suspended' },
            { value: 'BANNED', label: 'Banned' },
            { value: 'CLOSED', label: 'Closed' }
          ]}
          clearable
        />
        <Button onClick={handleSearch}>Search</Button>
      </Group>
    </Box>
  );
};

export default UserSearchFilter;