import { useState, useEffect } from "react";
import { alertService } from "@/services";
import { getLevelFromXP } from "@/utils/utilities";
import { Group, Avatar, Text, Card, Autocomplete, Button, Select, Badge, Stack } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { PermissionType } from "@prisma/client";
import Error from "next/error";

const GrantUserForm = () => {
  const [grantUser, setGrantUser] = useState("");
  const [grantLevel, setGrantLevel] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isUserValid, setIsUserValid] = useState(false);

  const fetchUsers = async (searchTerm) => {
    if (!searchTerm.trim()) return [];
    setLoading(true);

    try {
      const response = await fetch('/api/general/searchUsers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: searchTerm }),
      });

      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

      return data.map(user => ({
        value: user.display_name,
        label: user.display_name,
        image: user.avatar,
        class: user.class,
        race: user.race,
        experience: getLevelFromXP(user.experience),
        id: user.id,
        permissions: user.permissions
      }));
    } catch (error) {
      console.error("Failed to fetch users:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useDebouncedCallback(async (query) => {
    if (!query.trim()) return setUsersData([]);

    try {
      const users = await fetchUsers(query);
      setUsersData(users);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  }, 300);

  useEffect(() => {
    handleSearch(grantUser);
  }, [grantUser, handleSearch]);

  useEffect(() => {
    const selectedUser = usersData.find((user) => user.label === grantUser);
    if (selectedUser) {
      setGrantLevel(selectedUser.permissions.map((perm) => perm.type) || []); // Ensures array
      setIsUserValid(true);
    } else {
      setGrantLevel([]);
      setIsUserValid(false);
    }
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
      setGrantLevel([]);
    } else {
      alertService.error(data.error);
    }
  };

  const handlePermissionToggle = (permType) => {
    setGrantLevel((current) =>
      current.includes(permType) ? current.filter((p) => p !== permType) : [...current, permType]
    );
  };

  const renderAutocompleteOption = ({ option }) => (
    <Group gap="sm">
      <Avatar src={option.image} size={50} radius="xl" />
      <div>
        <Text size="sm" weight="bold">{option.label}</Text>
        <Text size="xs" opacity={0.5}>
          Experience Level: {option.experience} | Race: {option.race} | Class: {option.class}
        </Text>
        <Group spacing="xs" mt="xs">
          Permissions:
          {option.permissions.length > 0 ? (
            option.permissions.map((perm) => (
              <Badge
                key={perm.id}
                size="xs"
                color={perm.type === "ADMINISTRATOR" ? "red" : "blue"}
                variant="filled"
                mr="xs"
                onClick={() => handlePermissionToggle(perm.type)}
                style={{ cursor: "pointer" }}
              >
                {perm.type === "ADMINISTRATOR" ? "Administrator" : "Moderator"}
              </Badge>
            ))
          ) : (
            <Badge size="xs" color="gray" variant="filled">
              User
            </Badge>
          )}
        </Group>
      </div>
    </Group>
  );

  return (
    <Card shadow="sm" padding="lg" style={{ backgroundColor: "#1A1B1E" }}>
      <Stack spacing="md">
        <Card.Section>
          <div style={{ padding: "16px" }}> {/* Add padding here */}
            <Text size="xl" weight="bold">User Information</Text>
            <Autocomplete
              value={grantUser}
              onChange={setGrantUser}
              data={usersData}
              placeholder="Type to search for a user..."
              nothingFound="No users found"
              maxDropdownHeight={300}
              renderOption={renderAutocompleteOption}
              onSearchChange={handleSearch}
              limit={5}
              loading={loading}
            />
          </div>
        </Card.Section>

        <Card.Section mt="md">
          <div style={{ padding: "16px" }}> {/* Add padding here */}
            <Text size="xl" weight="bold">Modify Permissions</Text>
            <Group spacing="xs" mt="sm">
              {isUserValid ? (
                Array.isArray(grantLevel) && grantLevel.length > 0 ? (
                  grantLevel.map((perm) => (
                    <Badge
                      key={perm}
                      size="xs"
                      color={perm === "ADMINISTRATOR" ? "red" : "blue"}
                      variant="filled"
                      mr="xs"
                      onClick={() => handlePermissionToggle(perm)}
                      style={{ cursor: "pointer" }}
                    >
                      {perm === "ADMINISTRATOR" ? "Administrator" : "Moderator"}
                    </Badge>
                  ))
                ) : (
                  <Badge size="xs" color="gray" variant="filled">
                    User
                  </Badge>
                )
              ) : (
                <Badge size="xs" color="gray" variant="filled">
                  Not a valid user
                </Badge>
              )}
            </Group>

            <Select
              data={Object.keys(PermissionType).map((permType) => ({ value: permType, label: permType }))}
              value={grantLevel}
              onChange={(values) => setGrantLevel(values || [])} // Ensure it's always an array
              multiple
              placeholder="Add or remove permissions"
              mt="md"
              disabled={!isUserValid}
            />


            <Button
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
              onClick={grantUserPermission}
              mt="sm"
              disabled={!isUserValid} // Disable if user is not valid
            >
              Save
            </Button>
          </div>
        </Card.Section>
      </Stack>
    </Card>
  );
};

export default GrantUserForm;
