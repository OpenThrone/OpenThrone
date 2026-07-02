import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Badge,
  Button,
  Grid,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import React, { useEffect, useState } from 'react';

import { PermissionType } from '@/lib/prisma-browser-exports';
import type { StaffRole } from '@/lib/prisma-exports';
import { logError } from '@/utils/logger';
import { STAFF_ROLE_LABELS } from '@/utils/permissions';

import { GameCard } from './game/GameCard';

const STAFF_ROLES: StaffRole[] = [
  'ADMINISTRATOR',
  'MODERATOR',
  'COMMUNITY_MANAGER',
  'GAME_MASTER',
];

// Define interfaces for the different sections of user data
interface UserProfile {
  id: string;
  username: string;
  email: string;
  status: string;
  lastActive?: string;
  joinDate?: string;
  alliance?: string;
}

interface UserStats {
  gold: number | bigint | string;
  goldInBank: number | bigint | string;
  experience: number;
  level: number;
}

interface UserArmy {
  units: Array<{
    id: string;
    name: string;
    quantity: number;
    level: number;
  }>;
}

interface UserItems {
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    level?: number;
  }>;
}

interface UserPermissions {
  permissions: PermissionType[];
}

interface UserData {
  profile: UserProfile;
  stats: UserStats;
  army: UserArmy;
  items: UserItems;
  permissions: UserPermissions;
  staffRoles?: { roles: StaffRole[] };
}

interface UserAdminEditorProps {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const UserAdminEditor: React.FC<UserAdminEditorProps> = ({
  userId,
  onClose: _onClose,
  onSaved,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState<string>('');
  const [addingNote, setAddingNote] = useState<boolean>(false);
  const theme = useMantineTheme();
  const coerceNumber = (value: number | string | null) =>
    typeof value === 'number' ? value : Number(value || 0);

  const fetchNotes = async () => {
    if (!userId) return;
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/admin/moderation/users/${userId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(Array.isArray(data) ? data : []);
      }
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [userId]);

  const handleAddNote = async () => {
    if (!newNote.trim() || !userId) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/admin/moderation/users/${userId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote, visibility: 'STAFF' }),
      });
      if (res.ok) {
        setNewNote('');
        fetchNotes();
        notifications.show({
          title: 'Note Added',
          message: 'Moderator note added successfully.',
          color: 'green',
        });
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to add note.',
        color: 'red',
      });
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/admin/moderation/users/${userId}/notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      if (res.ok) {
        fetchNotes();
        notifications.show({
          title: 'Note Removed',
          message: 'Moderator note deleted.',
          color: 'green',
        });
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete note.',
        color: 'red',
      });
    }
  };

  // Fetch user data when userId changes
  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/users/${userId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }

        const data = await response.json();
        setUserData(data);
      } catch (err) {
        logError('Error fetching user data:', err);
        setError('Failed to load user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchUserData();
    }
  }, [userId]);

  const handleSave = async () => {
    if (!userData) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update user: ${response.statusText}`);
      }

      notifications.show({
        title: 'Success',
        message: 'User updated successfully',
        color: 'green',
      });

      onSaved(); // Refresh the user list
    } catch (err) {
      logError('Error updating user:', err);
      setError('Failed to update user data. Please try again.');

      notifications.show({
        title: 'Error',
        message: 'Failed to update user',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (field: keyof UserProfile, value: string) => {
    if (!userData) return;
    setUserData({
      ...userData,
      profile: { ...userData.profile, [field]: value },
    });
  };

  const updateStat = (
    field: keyof UserStats,
    value: number | string | null,
  ) => {
    if (!userData) return;
    setUserData({
      ...userData,
      stats: { ...userData.stats, [field]: coerceNumber(value) },
    });
  };

  const updateUnit = (
    unitId: string,
    field: 'quantity' | 'level',
    value: number | string | null,
  ) => {
    if (!userData) return;
    const updatedUnits = userData.army.units.map((unit) =>
      unit.id === unitId ? { ...unit, [field]: coerceNumber(value) } : unit,
    );
    setUserData({
      ...userData,
      army: { ...userData.army, units: updatedUnits },
    });
  };

  const updateItem = (
    itemId: string,
    field: 'quantity' | 'level',
    value: number | string | null,
  ) => {
    if (!userData) return;
    const updatedItems = userData.items.items.map((item) =>
      item.id === itemId ? { ...item, [field]: coerceNumber(value) } : item,
    );
    setUserData({
      ...userData,
      items: { ...userData.items, items: updatedItems },
    });
  };

  const togglePermission = (permission: PermissionType) => {
    if (!userData) return;
    const currentPermissions = userData.permissions.permissions;
    const newPermissions = currentPermissions.includes(permission)
      ? currentPermissions.filter((p) => p !== permission)
      : [...currentPermissions, permission];
    setUserData({
      ...userData,
      permissions: { ...userData.permissions, permissions: newPermissions },
    });
  };

  const toggleStaffRole = (role: StaffRole) => {
    if (!userData) return;
    const currentRoles = userData.staffRoles?.roles ?? [];
    const newRoles = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    setUserData({
      ...userData,
      staffRoles: { roles: newRoles },
    });
  };

  if (loading) return <Loader />;
  if (error) return <Text color="red">{error}</Text>;
  if (!userData) return <Text>No user data available.</Text>;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Editing: {userData.profile.username}</Title>
        <Button onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </Group>

      <Tabs
        defaultValue="profile"
        styles={{
          tab: {
            backgroundColor: theme.colors.dark[6],
            color: theme.colors.gray[5],
            '&:focus-visible': {
              outline: `2px solid ${theme.colors.blue[5]}`,
              outlineOffset: 2,
            },
            '&[data-active]': {
              backgroundColor: theme.colors.blue[8],
              color: theme.white,
            },
          },
          panel: {
            backgroundColor: theme.colors.dark[7],
            padding: theme.spacing.md,
          },
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="profile">Profile</Tabs.Tab>
          <Tabs.Tab value="stats">Stats & Resources</Tabs.Tab>
          <Tabs.Tab value="army">Army</Tabs.Tab>
          <Tabs.Tab value="items">Items</Tabs.Tab>
          <Tabs.Tab value="staffRoles">Staff Roles</Tabs.Tab>
          <Tabs.Tab value="permissions">Permissions</Tabs.Tab>
          <Tabs.Tab value="notes">Notes</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="profile" pt="md">
          <Grid>
            <Grid.Col span={6}>
              <GameCard title="User Details">
                <TextInput
                  label="Username"
                  value={userData.profile.username}
                  onChange={(e) => updateProfile('username', e.target.value)}
                />
                <TextInput
                  label="Email"
                  value={userData.profile.email}
                  onChange={(e) => updateProfile('email', e.target.value)}
                  mt="sm"
                />
                <Select
                  label="Status"
                  value={userData.profile.status}
                  onChange={(value) =>
                    updateProfile('status', value || 'ACTIVE')
                  }
                  data={['ACTIVE', 'VACATION', 'SUSPENDED', 'BANNED', 'CLOSED']}
                  mt="sm"
                />
              </GameCard>
            </Grid.Col>
            <Grid.Col span={6}>
              <GameCard title="Info">
                <Text>ID: {userData.profile.id}</Text>
                <Text>
                  Joined:{' '}
                  {new Date(userData.profile.joinDate).toLocaleDateString()}
                </Text>
                <Text>
                  Last Active:{' '}
                  {new Date(userData.profile.lastActive).toLocaleString()}
                </Text>
                <Text>Alliance: {userData.profile.alliance || 'None'}</Text>
              </GameCard>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="stats" pt="md">
          <Grid>
            <Grid.Col span={6}>
              <GameCard title="Resources">
                <NumberInput
                  label="Gold"
                  value={Number(userData.stats.gold)}
                  onChange={(val) => updateStat('gold', val)}
                />
                <NumberInput
                  label="Gold In Bank"
                  value={Number(userData.stats.goldInBank)}
                  onChange={(val) => updateStat('goldInBank', val)}
                  mt="sm"
                />
              </GameCard>
            </Grid.Col>
            <Grid.Col span={6}>
              <GameCard title="Progress">
                <NumberInput
                  label="Experience"
                  value={userData.stats.experience}
                  onChange={(val) => updateStat('experience', val)}
                />
                <NumberInput
                  label="Level"
                  value={userData.stats.level}
                  onChange={(val) => updateStat('level', val)}
                  mt="sm"
                />
              </GameCard>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="army" pt="md">
          <GameCard title="Units">
            {userData.army.units.map((unit) => (
              <Group key={unit.id} justify="space-between" mb="xs">
                <Text>
                  {unit.name} (Lvl {unit.level})
                </Text>
                <Group>
                  <ActionIcon
                    onClick={() =>
                      updateUnit(unit.id, 'quantity', unit.quantity - 1)
                    }
                  >
                    <FontAwesomeIcon icon={faMinus} />
                  </ActionIcon>
                  <NumberInput
                    value={unit.quantity}
                    onChange={(val) => updateUnit(unit.id, 'quantity', val)}
                    hideControls
                    width={80}
                  />
                  <ActionIcon
                    onClick={() =>
                      updateUnit(unit.id, 'quantity', unit.quantity + 1)
                    }
                  >
                    <FontAwesomeIcon icon={faPlus} />
                  </ActionIcon>
                </Group>
              </Group>
            ))}
          </GameCard>
        </Tabs.Panel>
        <Tabs.Panel value="items" pt="md">
          <GameCard title="Items">
            {userData.items.items.map((item) => (
              <Group key={item.id} justify="space-between" mb="xs">
                <Text>
                  {item.name} {item.level && `(Lvl ${item.level})`}
                </Text>
                <Group>
                  <ActionIcon
                    onClick={() =>
                      updateItem(item.id, 'quantity', item.quantity - 1)
                    }
                  >
                    <FontAwesomeIcon icon={faMinus} />
                  </ActionIcon>
                  <NumberInput
                    value={item.quantity}
                    onChange={(val) => updateItem(item.id, 'quantity', val)}
                    hideControls
                    width={80}
                  />
                  <ActionIcon
                    onClick={() =>
                      updateItem(item.id, 'quantity', item.quantity + 1)
                    }
                  >
                    <FontAwesomeIcon icon={faPlus} />
                  </ActionIcon>
                </Group>
              </Group>
            ))}
          </GameCard>
        </Tabs.Panel>
        <Tabs.Panel value="staffRoles" pt="md">
          <GameCard title="Staff Roles">
            <Group>
              {STAFF_ROLES.map((role) => (
                <Button
                  key={role}
                  onClick={() => toggleStaffRole(role)}
                  variant={
                    userData.staffRoles?.roles.includes(role)
                      ? 'filled'
                      : 'outline'
                  }
                >
                  {STAFF_ROLE_LABELS[role]}
                </Button>
              ))}
            </Group>
          </GameCard>
        </Tabs.Panel>
        <Tabs.Panel value="permissions" pt="md">
          <GameCard title="Permissions">
            <Group>
              {Object.values(PermissionType).map((p) => (
                <Button
                  key={p}
                  onClick={() => togglePermission(p)}
                  variant={
                    userData.permissions.permissions.includes(p)
                      ? 'filled'
                      : 'outline'
                  }
                >
                  {p}
                </Button>
              ))}
            </Group>
          </GameCard>
        </Tabs.Panel>

        <Tabs.Panel value="notes" pt="md">
          <GameCard title="Add Note">
            <Stack gap="sm">
              <Textarea
                placeholder="Add internal note about this user..."
                value={newNote}
                onChange={(e) => setNewNote(e.currentTarget.value)}
                minRows={3}
              />
              <Group justify="flex-end">
                <Button
                  size="xs"
                  onClick={handleAddNote}
                  loading={addingNote}
                  disabled={!newNote.trim()}
                >
                  Add Note
                </Button>
              </Group>
            </Stack>
          </GameCard>

          <GameCard title={`Notes (${notes.length})`} mt="md">
            {notesLoading ? (
              <Group justify="center" py="md">
                <Loader size="sm" />
              </Group>
            ) : notes.length === 0 ? (
              <Text c="dimmed" ta="center" py="md">
                No moderator notes for this user.
              </Text>
            ) : (
              <Stack gap="sm">
                {notes.map((note) => (
                  <Paper key={note.id} withBorder p="sm">
                    <Group justify="space-between" mb="xs">
                      <div>
                        <Text size="sm" fw={700}>
                          {note.author?.display_name || 'Unknown'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {new Date(note.createdAt).toLocaleString()}
                          {note.isPinned && (
                            <Badge ml="xs" size="xs" color="yellow">
                              Pinned
                            </Badge>
                          )}
                        </Text>
                      </div>
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        <FontAwesomeIcon icon={faMinus} />
                      </ActionIcon>
                    </Group>
                    <Text style={{ whiteSpace: 'pre-wrap' }}>{note.note}</Text>
                  </Paper>
                ))}
              </Stack>
            )}
          </GameCard>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

export default UserAdminEditor;
