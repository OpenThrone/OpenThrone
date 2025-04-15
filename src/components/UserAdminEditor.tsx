import React, { useState, useEffect } from 'react';
import {
  Tabs,
  Button,
  Group,
  TextInput,
  NumberInput,
  Select,
  Loader,
  Stack,
  Text,
  Grid,
  Badge,
  Paper,
  ActionIcon,
  Divider
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PermissionType } from '@prisma/client';
import { faSync, faSave, faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

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
}

interface UserAdminEditorProps {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const UserAdminEditor: React.FC<UserAdminEditorProps> = ({ userId, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>('profile');
  const [error, setError] = useState<string | null>(null);

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
        console.error('Error fetching user data:', err);
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
      console.error('Error updating user:', err);
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

  // Profile tab update handlers
  const updateProfile = (field: keyof UserProfile, value: string) => {
    if (!userData) return;
    setUserData({
      ...userData,
      profile: {
        ...userData.profile,
        [field]: value
      }
    });
  };

  // Stats tab update handlers
  const updateStat = (field: keyof UserStats, value: number) => {
    if (!userData) return;
    setUserData({
      ...userData,
      stats: {
        ...userData.stats,
        [field]: value
      }
    });
  };

  // Army tab handlers
  const updateUnit = (unitId: string, field: 'quantity' | 'level', value: number) => {
    if (!userData) return;
    const updatedUnits = userData.army.units.map(unit => 
      unit.id === unitId ? { ...unit, [field]: value } : unit
    );
    setUserData({
      ...userData,
      army: {
        ...userData.army,
        units: updatedUnits
      }
    });
  };

  // Items tab handlers
  const updateItem = (itemId: string, field: 'quantity' | 'level', value: number) => {
    if (!userData) return;
    const updatedItems = userData.items.items.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    );
    setUserData({
      ...userData,
      items: {
        ...userData.items,
        items: updatedItems
      }
    });
  };

  // Permissions tab handlers
  const togglePermission = (permission: PermissionType) => {
    if (!userData) return;
    const currentPermissions = userData.permissions.permissions;
    let newPermissions: PermissionType[];
    
    if (currentPermissions.includes(permission)) {
      newPermissions = currentPermissions.filter(p => p !== permission);
    } else {
      newPermissions = [...currentPermissions, permission];
    }
    
    setUserData({
      ...userData,
      permissions: {
        ...userData.permissions,
        permissions: newPermissions
      }
    });
  };

  if (loading) {
    return (
      <Stack align="center" justify="center" h={400}>
        <Loader size="xl" />
        <Text size="sm">Loading user data...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack align="center" justify="center" h={400}>
        <Text color="red" size="lg">{error}</Text>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </Stack>
    );
  }

  if (!userData) {
    return (
      <Text>No user data available</Text>
    );
  }

  return (
    <Stack>
      <Group justify="space-between" mb="md">
        <Text size="xl" fw={700}>Editing User: {userData.profile.username}</Text>
        <Group>
          <Button 
            leftSection={<FontAwesomeIcon icon={faSync} size="sm" />} 
            variant="outline" 
            onClick={() => window.location.reload()}
          >
            Refresh
          </Button>
          <Button 
            leftSection={<FontAwesomeIcon icon={faSave} size="sm" />} 
            onClick={handleSave} 
            loading={saving} 
            color="blue"
          >
            Save Changes
          </Button>
        </Group>
      </Group>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="profile">Profile</Tabs.Tab>
          <Tabs.Tab value="stats">Stats & Resources</Tabs.Tab>
          <Tabs.Tab value="army">Army</Tabs.Tab>
          <Tabs.Tab value="items">Items</Tabs.Tab>
          <Tabs.Tab value="permissions">Permissions</Tabs.Tab>
        </Tabs.List>

        {/* Profile Tab */}
        <Tabs.Panel value="profile" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <TextInput 
                label="Username" 
                value={userData.profile.username || ''} 
                onChange={(e) => updateProfile('username', e.target.value)}
                mb="md"
              />
              <TextInput 
                label="Email" 
                value={userData.profile.email || ''} 
                onChange={(e) => updateProfile('email', e.target.value)}
                mb="md"
              />
              <Select
                label="Status"
                value={userData.profile.status}
                onChange={(value) => updateProfile('status', value || 'ACTIVE')}
                data={[
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'VACATION', label: 'Vacation' },
                  { value: 'SUSPENDED', label: 'Suspended' },
                  { value: 'BANNED', label: 'Banned' },
                  { value: 'CLOSED', label: 'Closed' }
                ]}
                mb="md"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder p="md" radius="md">
                <Text size="sm" fw={500} mb="xs">User Information</Text>
                <Text size="sm"><b>User ID:</b> {userData.profile.id}</Text>
                <Text size="sm"><b>Join Date:</b> {userData.profile.joinDate ? new Date(userData.profile.joinDate).toLocaleString() : 'N/A'}</Text>
                <Text size="sm"><b>Last Active:</b> {userData.profile.lastActive ? new Date(userData.profile.lastActive).toLocaleString() : 'N/A'}</Text>
                <Text size="sm"><b>Alliance:</b> {userData.profile.alliance || 'None'}</Text>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* Stats & Resources Tab */}
        <Tabs.Panel value="stats" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder p="md" radius="md" mb="md">
                <Text size="lg" fw={500} mb="xs">Resources</Text>
                <Grid>
                  <Grid.Col span={6}>
                    <NumberInput
                      label="Gold"
                      value={userData.stats.gold.toString()}
                      onChange={(value) => updateStat('gold', Number(value) || 0)}
                      min={0}
                      mb="md"
                    />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberInput
                      label="Gold In Bank"
                      value={userData.stats.goldInBank.toString()}
                      onChange={(value) => updateStat('goldInBank', Number(value) || 0)}
                      min={0}
                      mb="md"
                    />
                  </Grid.Col>
                </Grid>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder p="md" radius="md" mb="md">
                <Text size="lg" fw={500} mb="xs">Progress</Text>
                <Grid>           
                  <Grid.Col span={6}>
                    <NumberInput
                      label="Experience"
                      value={userData.stats.experience}
                      onChange={(value) => updateStat('experience', Number(value) || 0)}
                      min={0}
                      mb="md"
                    />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberInput
                      label="Level"
                      value={userData.stats.level}
                      onChange={(value) => updateStat('level', Number(value) || 1)}
                      min={1}
                      mb="md"
                    />
                  </Grid.Col>
                </Grid>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* Army Tab */}
        <Tabs.Panel value="army" pt="md">
          <Paper withBorder p="md" radius="md">
            <Text size="lg" fw={500} mb="md">Units</Text>
            {userData.army.units.length === 0 ? (
              <Text color="dimmed" ta="center" py="xl">No units found</Text>
            ) : (
              userData.army.units.map((unit) => (
                <Grid key={unit.id} mb="sm">
                  <Grid.Col span={4}>
                    <Text>{unit.name}</Text>
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Group>
                      <Text size="sm">Quantity:</Text>
                      <ActionIcon 
                        size="sm" 
                        variant="subtle" 
                        onClick={() => updateUnit(unit.id, 'quantity', Math.max(0, unit.quantity - 1))}
                      >
                        <FontAwesomeIcon icon={faMinus} size="xs" />
                      </ActionIcon>
                      <NumberInput
                        value={unit.quantity}
                        onChange={(value) => updateUnit(unit.id, 'quantity', Number(value) || 0)}
                        min={0}
                        size="xs"
                        w={70}
                        hideControls
                      />
                      <ActionIcon 
                        size="sm" 
                        variant="subtle" 
                        onClick={() => updateUnit(unit.id, 'quantity', unit.quantity + 1)}
                      >
                        <FontAwesomeIcon icon={faPlus} size="xs" />
                      </ActionIcon>
                    </Group>
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Group>
                      <Text size="sm">Level:</Text>
                      <ActionIcon 
                        size="sm" 
                        variant="subtle" 
                        onClick={() => updateUnit(unit.id, 'level', Math.max(1, unit.level - 1))}
                      >
                        <FontAwesomeIcon icon={faMinus} size="xs" />
                      </ActionIcon>
                      <NumberInput
                        value={unit.level}
                        onChange={(value) => updateUnit(unit.id, 'level', Number(value) || 1)}
                        min={1}
                        size="xs"
                        w={70}
                        hideControls
                      />
                      <ActionIcon 
                        size="sm" 
                        variant="subtle" 
                        onClick={() => updateUnit(unit.id, 'level', unit.level + 1)}
                      >
                        <FontAwesomeIcon icon={faPlus} size="xs" />
                      </ActionIcon>
                    </Group>
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <Divider my="xs" />
                  </Grid.Col>
                </Grid>
              ))
            )}
          </Paper>
        </Tabs.Panel>

        {/* Items Tab */}
        <Tabs.Panel value="items" pt="md">
          <Paper withBorder p="md" radius="md">
            <Text size="lg" fw={500} mb="md">Items</Text>
            {userData.items.items.length === 0 ? (
              <Text color="dimmed" ta="center" py="xl">No items found</Text>
            ) : (
              userData.items.items.map((item) => (
                <Grid key={item.id} mb="sm">
                  <Grid.Col span={4}>
                    <Text>{item.name}</Text>
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Group>
                      <Text size="sm">Quantity:</Text>
                      <ActionIcon 
                        size="sm" 
                        variant="subtle" 
                        onClick={() => updateItem(item.id, 'quantity', Math.max(0, item.quantity - 1))}
                      >
                        <FontAwesomeIcon icon={faMinus} size="xs" />
                      </ActionIcon>
                      <NumberInput
                        value={item.quantity}
                        onChange={(value) => updateItem(item.id, 'quantity', Number(value) || 0)}
                        min={0}
                        size="xs"
                        w={70}
                        hideControls
                      />
                      <ActionIcon 
                        size="sm" 
                        variant="subtle" 
                        onClick={() => updateItem(item.id, 'quantity', item.quantity + 1)}
                      >
                        <FontAwesomeIcon icon={faPlus} size="xs" />
                      </ActionIcon>
                    </Group>
                  </Grid.Col>
                  {item.level !== undefined && (
                    <Grid.Col span={4}>
                      <Group>
                        <Text size="sm">Level:</Text>
                        <ActionIcon 
                          size="sm" 
                          variant="subtle" 
                          onClick={() => updateItem(item.id, 'level', Math.max(1, (item.level || 1) - 1))}
                        >
                          <FontAwesomeIcon icon={faMinus} size="xs" />
                        </ActionIcon>
                        <NumberInput
                          value={item.level || 1}
                          onChange={(value) => updateItem(item.id, 'level', Number(value) || 1)}
                          min={1}
                          size="xs"
                          w={70}
                          hideControls
                        />
                        <ActionIcon 
                          size="sm" 
                          variant="subtle" 
                          onClick={() => updateItem(item.id, 'level', (item.level || 1) + 1)}
                        >
                          <FontAwesomeIcon icon={faPlus} size="xs" />
                        </ActionIcon>
                      </Group>
                    </Grid.Col>
                  )}
                  <Grid.Col span={12}>
                    <Divider my="xs" />
                  </Grid.Col>
                </Grid>
              ))
            )}
          </Paper>
        </Tabs.Panel>

        {/* Permissions Tab */}
        <Tabs.Panel value="permissions" pt="md">
          <Paper withBorder p="md" radius="md">
            <Text size="lg" fw={500} mb="md">User Permissions</Text>
            <Grid>
              {Object.values(PermissionType).map((permission) => (
                <Grid.Col key={permission} span={6}>
                  <Group>
                    <Button
                      variant={userData.permissions.permissions.includes(permission) ? "filled" : "outline"}
                      size="sm"
                      onClick={() => togglePermission(permission)}
                      fullWidth
                    >
                      {userData.permissions.permissions.includes(permission) ? 'Remove' : 'Grant'} {permission}
                    </Button>
                  </Group>
                </Grid.Col>
              ))}
            </Grid>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

export default UserAdminEditor;