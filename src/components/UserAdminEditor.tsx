import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useState } from 'react';

import UserOperations, {
  AdminUserExport,
} from '@/components/admin/UserOperations';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import type { StaffRole } from '@/lib/prisma-exports';
import { logError } from '@/utils/logger';
import { STAFF_ROLE_LABELS } from '@/utils/permissions';

const STAFF_ROLES: StaffRole[] = [
  'ADMINISTRATOR',
  'MODERATOR',
  'COMMUNITY_MANAGER',
  'GAME_MASTER',
];

interface UserProfile {
  id: string;
  username: string;
  email: string;
  status: string;
}

interface UserStats {
  gold: string;
  goldInBank: string;
  experience: number;
  level: number;
}

interface UserUnit {
  id: string;
  type: string;
  name: string;
  quantity: number;
  level: number;
  isMercenary: boolean;
}

interface UserItem {
  id: string;
  type: string;
  usage: string;
  name: string;
  quantity: number;
  level: number;
}

interface UserData {
  profile: UserProfile;
  stats: UserStats;
  army: { units: UserUnit[] };
  items: { items: UserItem[] };
  permissions: { permissions: PermissionType[] };
  staffRoles: { roles: StaffRole[] };
}

interface ModeratorNote {
  id: number;
  note: string;
  createdAt: string;
  isPinned?: boolean;
  author?: { display_name?: string };
}

interface UserAdminEditorProps {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
  isAdministrator: boolean;
}

const safeInteger = (value: number | string | null, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const UserAdminEditor: React.FC<UserAdminEditorProps> = ({
  userId,
  onClose,
  onSaved,
  isAdministrator,
}) => {
  const { t } = useTranslation('admin-users');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<ModeratorNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [notePending, setNotePending] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [noteDeleteTarget, setNoteDeleteTarget] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>('profile');

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    setNotesError(null);
    try {
      const response = await fetch(
        `/api/admin/moderation/users/${encodeURIComponent(userId)}/notes`,
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t('errors.notesLoad'));
      setNotes(Array.isArray(payload) ? payload : []);
    } catch (requestError) {
      setNotesError(
        requestError instanceof Error
          ? requestError.message
          : t('errors.notesLoad'),
      );
    } finally {
      setNotesLoading(false);
    }
  }, [t, userId]);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t('errors.load'));
      setUserData(payload);
    } catch (requestError) {
      logError('Failed to load admin user details', requestError);
      setError(
        requestError instanceof Error ? requestError.message : t('errors.load'),
      );
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => {
    loadUser();
    loadNotes();
  }, [loadNotes, loadUser]);

  const saveUser = async () => {
    if (!isAdministrator || !userData || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t('errors.save'));
      notifications.show({
        title: t('messages.savedTitle'),
        message: t('messages.saved'),
        color: 'green',
      });
      onSaved();
    } catch (requestError) {
      logError('Failed to save admin user details', requestError);
      setError(
        requestError instanceof Error ? requestError.message : t('errors.save'),
      );
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    const note = newNote.trim();
    if (!note || notePending) return;
    setNotePending(true);
    setNotesError(null);
    try {
      const response = await fetch(
        `/api/admin/moderation/users/${encodeURIComponent(userId)}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note, visibility: 'STAFF' }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t('errors.noteSave'));
      setNewNote('');
      await loadNotes();
    } catch (requestError) {
      setNotesError(
        requestError instanceof Error
          ? requestError.message
          : t('errors.noteSave'),
      );
    } finally {
      setNotePending(false);
    }
  };

  const updateQuantity = (
    collection: 'units' | 'items',
    id: string,
    value: number | string | null,
  ) => {
    if (!userData) return;
    const current =
      collection === 'units' ? userData.army.units : userData.items.items;
    const updated = current.map((entry) =>
      entry.id === id
        ? { ...entry, quantity: safeInteger(value, entry.quantity) }
        : entry,
    );
    setUserData(
      collection === 'units'
        ? { ...userData, army: { units: updated as UserUnit[] } }
        : { ...userData, items: { items: updated as UserItem[] } },
    );
  };

  const updateMoney = (field: 'gold' | 'goldInBank', value: string) => {
    if (!userData || !/^\d*$/.test(value)) return;
    setUserData({ ...userData, stats: { ...userData.stats, [field]: value } });
  };

  const toggleRole = (role: StaffRole) => {
    if (!isAdministrator || !userData) return;
    const roles = userData.staffRoles.roles.includes(role)
      ? userData.staffRoles.roles.filter((current) => current !== role)
      : [...userData.staffRoles.roles, role];
    setUserData({ ...userData, staffRoles: { roles } });
  };

  const togglePermission = (permission: PermissionType) => {
    if (!isAdministrator || !userData) return;
    const permissions = userData.permissions.permissions.includes(permission)
      ? userData.permissions.permissions.filter(
          (current) => current !== permission,
        )
      : [...userData.permissions.permissions, permission];
    setUserData({ ...userData, permissions: { permissions } });
  };

  const removeNote = async () => {
    const noteId = noteDeleteTarget;
    if (noteId === null || deletingNote) return;
    setNoteDeleteTarget(null);
    setDeletingNote(true);
    setNotesError(null);
    try {
      const response = await fetch(
        `/api/admin/moderation/users/${encodeURIComponent(userId)}/notes`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteId }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error || t('errors.noteDelete'));
      await loadNotes();
    } catch (requestError) {
      setNotesError(
        requestError instanceof Error
          ? requestError.message
          : t('errors.noteDelete'),
      );
    } finally {
      setDeletingNote(false);
    }
  };

  if (loading) return <Text role="status">{t('states.loading')}</Text>;
  if (error && !userData)
    return (
      <Stack>
        <Alert color="red" role="alert" title={t('errors.title')}>
          {error}
        </Alert>
        <Button onClick={loadUser}>{t('actions.retry')}</Button>
      </Stack>
    );
  if (!userData) return <Text>{t('states.unavailable')}</Text>;

  const isReadOnly = !isAdministrator;
  const visibleTabs = [
    'profile',
    'stats',
    'army',
    'items',
    'notes',
    'operations',
    ...(isAdministrator ? ['staffRoles', 'permissions'] : []),
  ];
  const safeTab =
    activeTab && visibleTabs.includes(activeTab) ? activeTab : 'profile';

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Title order={3} style={{ overflowWrap: 'anywhere' }}>
            {t('editor.title', { username: userData.profile.username })}
          </Title>
          <Text size="sm" c="dimmed">
            {t('editor.id', { id: userData.profile.id })}
          </Text>
        </div>
        <Group>
          <Button variant="default" onClick={onClose}>
            {t('actions.close')}
          </Button>
          {isAdministrator && (
            <Button onClick={saveUser} loading={saving} disabled={saving}>
              {t('actions.save')}
            </Button>
          )}
        </Group>
      </Group>
      {error && (
        <Alert color="red" role="alert" title={t('errors.title')}>
          {error}
        </Alert>
      )}
      <Tabs value={safeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List aria-label={t('editor.tabs')}>
          {visibleTabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab}>
              {t(`tabs.${tab}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="profile" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <GameCard title={t('sections.profile')}>
                <TextInput
                  label={t('fields.username')}
                  value={userData.profile.username}
                  readOnly={isReadOnly}
                  onChange={(event) =>
                    setUserData({
                      ...userData,
                      profile: {
                        ...userData.profile,
                        username: event.currentTarget.value,
                      },
                    })
                  }
                />
                <TextInput
                  label={t('fields.email')}
                  value={userData.profile.email}
                  readOnly={isReadOnly}
                  onChange={(event) =>
                    setUserData({
                      ...userData,
                      profile: {
                        ...userData.profile,
                        email: event.currentTarget.value,
                      },
                    })
                  }
                  mt="sm"
                />
                <TextInput
                  label={t('fields.status')}
                  value={userData.profile.status}
                  readOnly
                  mt="sm"
                />
                <Text size="xs" c="dimmed" mt="xs">
                  {t('fields.statusHelp')}
                </Text>
              </GameCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <GameCard title={t('sections.account')}>
                <Text>
                  {t('fields.accountId')}: {userData.profile.id}
                </Text>
                <Badge mt="sm">{userData.profile.status}</Badge>
              </GameCard>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
        <Tabs.Panel value="stats" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <GameCard title={t('sections.resources')}>
                <TextInput
                  label={t('fields.gold')}
                  inputMode="numeric"
                  value={userData.stats.gold}
                  readOnly={isReadOnly}
                  onChange={(event) =>
                    updateMoney('gold', event.currentTarget.value)
                  }
                />
                <TextInput
                  label={t('fields.goldInBank')}
                  inputMode="numeric"
                  value={userData.stats.goldInBank}
                  readOnly={isReadOnly}
                  onChange={(event) =>
                    updateMoney('goldInBank', event.currentTarget.value)
                  }
                  mt="sm"
                />
              </GameCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <GameCard title={t('sections.progress')}>
                <NumberInput
                  label={t('fields.experience')}
                  value={userData.stats.experience}
                  min={0}
                  max={Number.MAX_SAFE_INTEGER}
                  allowDecimal={false}
                  readOnly={isReadOnly}
                  onChange={(value) =>
                    setUserData({
                      ...userData,
                      stats: {
                        ...userData.stats,
                        experience: safeInteger(
                          value,
                          userData.stats.experience,
                        ),
                      },
                    })
                  }
                />
                <NumberInput
                  label={t('fields.level')}
                  value={userData.stats.level}
                  readOnly
                  description={t('fields.levelHelp')}
                  mt="sm"
                />
              </GameCard>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
        <Tabs.Panel value="army" pt="md">
          <GameCard title={t('sections.army')}>
            {userData.army.units.length === 0 ? (
              <Text c="dimmed">{t('states.noUnits')}</Text>
            ) : (
              <Stack gap="xs">
                {userData.army.units.map((unit) => (
                  <Group key={unit.id} justify="space-between" wrap="nowrap">
                    <Text style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {unit.name} · {t('fields.level')} {unit.level}
                      {unit.isMercenary ? ` · ${t('fields.mercenary')}` : ''}
                    </Text>
                    <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        aria-label={t('actions.decreaseQuantity', {
                          name: unit.name,
                        })}
                        disabled={isReadOnly || unit.quantity <= 0}
                        onClick={() =>
                          updateQuantity('units', unit.id, unit.quantity - 1)
                        }
                      >
                        <FontAwesomeIcon icon={faMinus} />
                      </ActionIcon>
                      <NumberInput
                        aria-label={t('fields.quantityFor', {
                          name: unit.name,
                        })}
                        value={unit.quantity}
                        min={0}
                        max={Number.MAX_SAFE_INTEGER}
                        allowDecimal={false}
                        hideControls
                        w={96}
                        readOnly={isReadOnly}
                        onChange={(value) =>
                          updateQuantity('units', unit.id, value)
                        }
                      />
                      <ActionIcon
                        aria-label={t('actions.increaseQuantity', {
                          name: unit.name,
                        })}
                        disabled={
                          isReadOnly || unit.quantity >= Number.MAX_SAFE_INTEGER
                        }
                        onClick={() =>
                          updateQuantity('units', unit.id, unit.quantity + 1)
                        }
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              </Stack>
            )}
          </GameCard>
        </Tabs.Panel>
        <Tabs.Panel value="items" pt="md">
          <GameCard title={t('sections.items')}>
            {userData.items.items.length === 0 ? (
              <Text c="dimmed">{t('states.noItems')}</Text>
            ) : (
              <Stack gap="xs">
                {userData.items.items.map((item) => (
                  <Group key={item.id} justify="space-between" wrap="nowrap">
                    <Text style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {item.name} · {item.usage} · {t('fields.level')}{' '}
                      {item.level}
                    </Text>
                    <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        aria-label={t('actions.decreaseQuantity', {
                          name: item.name,
                        })}
                        disabled={isReadOnly || item.quantity <= 0}
                        onClick={() =>
                          updateQuantity('items', item.id, item.quantity - 1)
                        }
                      >
                        <FontAwesomeIcon icon={faMinus} />
                      </ActionIcon>
                      <NumberInput
                        aria-label={t('fields.quantityFor', {
                          name: item.name,
                        })}
                        value={item.quantity}
                        min={0}
                        max={Number.MAX_SAFE_INTEGER}
                        allowDecimal={false}
                        hideControls
                        w={96}
                        readOnly={isReadOnly}
                        onChange={(value) =>
                          updateQuantity('items', item.id, value)
                        }
                      />
                      <ActionIcon
                        aria-label={t('actions.increaseQuantity', {
                          name: item.name,
                        })}
                        disabled={
                          isReadOnly || item.quantity >= Number.MAX_SAFE_INTEGER
                        }
                        onClick={() =>
                          updateQuantity('items', item.id, item.quantity + 1)
                        }
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              </Stack>
            )}
          </GameCard>
        </Tabs.Panel>
        {isAdministrator && (
          <Tabs.Panel value="staffRoles" pt="md">
            <GameCard title={t('sections.staffRoles')}>
              <Group wrap="wrap">
                {STAFF_ROLES.map((role) => (
                  <Button
                    key={role}
                    aria-pressed={userData.staffRoles.roles.includes(role)}
                    variant={
                      userData.staffRoles.roles.includes(role)
                        ? 'filled'
                        : 'default'
                    }
                    onClick={() => toggleRole(role)}
                  >
                    {STAFF_ROLE_LABELS[role]}
                  </Button>
                ))}
              </Group>
            </GameCard>
          </Tabs.Panel>
        )}
        {isAdministrator && (
          <Tabs.Panel value="permissions" pt="md">
            <GameCard title={t('sections.permissions')}>
              <Group wrap="wrap">
                {Object.values(PermissionType).map((permission) => (
                  <Button
                    key={permission}
                    aria-pressed={userData.permissions.permissions.includes(
                      permission,
                    )}
                    variant={
                      userData.permissions.permissions.includes(permission)
                        ? 'filled'
                        : 'default'
                    }
                    onClick={() => togglePermission(permission)}
                  >
                    {permission}
                  </Button>
                ))}
              </Group>
            </GameCard>
          </Tabs.Panel>
        )}
        <Tabs.Panel value="notes" pt="md">
          <GameCard title={t('sections.addNote')}>
            <Stack gap="sm">
              <Textarea
                label={t('fields.note')}
                value={newNote}
                onChange={(event) => setNewNote(event.currentTarget.value)}
                maxLength={2000}
                minRows={3}
                autosize
              />
              {notesError && (
                <Alert role="alert" color="red" title={t('errors.title')}>
                  {notesError}
                </Alert>
              )}
              <Group justify="flex-end">
                <Button
                  onClick={addNote}
                  loading={notePending}
                  disabled={!newNote.trim() || notePending}
                >
                  {t('actions.addNote')}
                </Button>
              </Group>
            </Stack>
          </GameCard>
          <GameCard title={t('sections.notes')} mt="md">
            {notesLoading ? (
              <Text role="status">{t('states.loading')}</Text>
            ) : notes.length === 0 ? (
              <Text c="dimmed">{t('states.noNotes')}</Text>
            ) : (
              <Stack gap="sm">
                {notes.map((note) => (
                  <Paper key={note.id} withBorder p="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text fw={700}>
                          {note.author?.display_name ||
                            t('fields.unknownAuthor')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {new Date(note.createdAt).toLocaleString()}
                          {note.isPinned ? ` · ${t('fields.pinned')}` : ''}
                        </Text>
                      </div>
                      <ActionIcon
                        aria-label={t('actions.deleteNote')}
                        color="red"
                        variant="subtle"
                        onClick={() => setNoteDeleteTarget(note.id)}
                      >
                        <FontAwesomeIcon icon={faMinus} />
                      </ActionIcon>
                    </Group>
                    <Text
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {note.note}
                    </Text>
                  </Paper>
                ))}
              </Stack>
            )}
            {notesError && (
              <Button mt="sm" variant="default" onClick={loadNotes}>
                {t('actions.retry')}
              </Button>
            )}
          </GameCard>
        </Tabs.Panel>
        <Tabs.Panel value="operations" pt="md">
          <Stack>
            <UserOperations
              userId={userId}
              onSaved={onSaved}
              isAdministrator={isAdministrator}
            />
            {isAdministrator && (
              <GameCard title={t('sections.export')}>
                <AdminUserExport userId={userId} />
              </GameCard>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={noteDeleteTarget !== null}
        onClose={() => setNoteDeleteTarget(null)}
        title={t('notes.deleteTitle')}
        centered
      >
        <Stack>
          <Text>{t('notes.deleteConfirm')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setNoteDeleteTarget(null)}>
              {t('actions.close')}
            </Button>
            <Button color="red" onClick={removeNote} loading={deletingNote}>
              {t('actions.deleteNote')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default UserAdminEditor;
