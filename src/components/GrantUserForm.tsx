import { useState, useEffect } from "react";
import { alertService } from "@/services/Alert.service";
import { getLevelFromXP } from "@/utils/utilities";
import { Group, Avatar, Text, Autocomplete, Button, MultiSelect, Badge, Stack, Loader } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { PermissionType } from "@prisma/client";

const GrantUserForm = () => {
  const [grantUser, setGrantUser] = useState<string>("");
  const [grantLevel, setGrantLevel] = useState<string[]>([]);
  const [usersData, setUsersData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isUserValid, setIsUserValid] = useState<boolean>(false);

  const fetchUsers = async (searchTerm) => {
    if (!searchTerm.trim()) return [];
    setLoading(true);
    try {
      const response = await fetch(`/api/general/searchUsers?name=${searchTerm}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      return data.map(user => ({
        value: user.display_name,
        label: user.display_name,
        image: user.avatar,
        id: user.id,
        permissions: user.permissions,
      }));
    } catch (error) {
      console.error("Failed to fetch users:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useDebouncedCallback(async (query) => {
    if (!query.trim()) {
      setUsersData([]);
      return;
    }
    const users = await fetchUsers(query);
    setUsersData(users);
  }, 300);

  useEffect(() => { handleSearch(grantUser); }, [grantUser, handleSearch]);

  useEffect(() => {
    const selectedUser = usersData.find((user) => user.label === grantUser);
    setIsUserValid(!!selectedUser);
    setGrantLevel(selectedUser ? selectedUser.permissions.map((p) => p.type) : []);
  }, [grantUser, usersData]);

  const grantUserPermission = async () => {
    const response = await fetch('/api/admin/grantPermission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: grantUser, permissions: grantLevel }),
    });
    const data = await response.json();
    if (response.ok) {
      alertService.success(`Successfully updated permissions for ${grantUser}`);
      setGrantUser("");
    } else {
      alertService.error(data.error);
    }
  };
  
  const renderAutocompleteOption = ({ option }: { option: any }) => (
    <Group>
      <Avatar src={option.image} size="lg" radius="xl" />
      <div>
        <Text size="sm">{option.label}</Text>
        <Text size="xs" opacity={0.5}>ID: {option.id}</Text>
      </div>
    </Group>
  );

  return (
    <Stack>
      <Autocomplete
        label="User Search"
        value={grantUser}
        onChange={setGrantUser}
        data={usersData}
        placeholder="Type to search..."
        renderOption={renderAutocompleteOption}
        limit={5}
        rightSection={loading ? <Loader size="xs" /> : null}
        rightSectionPointerEvents="none"
      />
      <MultiSelect
        label="Permissions"
        data={Object.keys(PermissionType)}
        value={grantLevel}
        onChange={setGrantLevel}
        disabled={!isUserValid}
        placeholder="Select permissions"
      />
      <Button onClick={grantUserPermission} disabled={!isUserValid}>
        Save Permissions
      </Button>
    </Stack>
  );
};

export default GrantUserForm;
