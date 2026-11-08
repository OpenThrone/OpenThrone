import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Grid,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useState } from 'react';

import AbuseSignalsPanel from '@/components/admin/AbuseSignalsPanel';
import PlayerForcesPanel from '@/components/admin/PlayerForcesPanel';
import PlayerSupporterPanel from '@/components/admin/PlayerSupporterPanel';
import PlayerUpgradesPanel from '@/components/admin/PlayerUpgradesPanel';
import PrivacyRequestsPanelLive from '@/components/admin/PrivacyRequestsPanelLive';
import UserOperations, {
  AdminUserExport,
} from '@/components/admin/UserOperations';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { EconomyUpgrades, Fortifications, HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { PermissionType } from '@/lib/prisma-browser-exports';
import type { StaffRole } from '@/lib/prisma-exports';
import { alertService } from '@/services/Alert.service';
import { AppConfig } from '@/utils/AppConfig';
import { logError } from '@/utils/logger';
import { STAFF_ROLE_LABELS } from '@/utils/permissions';

// Matches the server's Postgres INT cap for quantities and counters.
const INT_MAX = 2147483647;
const RACES = ['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'];
const CLASSES = ['FIGHTER', 'CLERIC', 'ASSASSIN', 'THIEF'];
const MAX_FORT_LEVEL = Math.max(...Fortifications.map((f) => f.level));
const MAX_HOUSE_LEVEL = Math.max(...Object.keys(HouseUpgrades).map(Number));
const MAX_ECONOMY_LEVEL = EconomyUpgrades.length - 1;
const BIO_MAX_LENGTH = 2000;

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

interface UserGameplay {
  fortLevel: number;
  fortHitpoints: number;
  stamina: number;
  maxStamina: number;
  attackTurns: number;
  houseLevel: number;
  economyLevel: number;
  race: string;
  class: string;
  locale: string;
  bio: string;
  veteranTitle: string | null;
  veteranSince: string | null;
}

interface UserDerived {
  offense: number;
  defense: number;
  spy: number;
  sentry: number;
}

interface UserRecord {
  rank: number;
  lastActive: string | null;
  createdAt: string | null;
  currentEraId: number | null;
  eraJoinedAt: string | null;
  protectionForfeitedEraId: number | null;
  alliances: { allianceId: number; name: string; role: string | null }[];
  statusHistory: {
    id: number;
    status: string;
    startDate: string;
    endDate: string | null;
    reason: string | null;
    adminName: string | null;
  }[];
}

interface UserData {
  profile: UserProfile;
  gameplay: UserGameplay;
  derived: UserDerived;
  record: UserRecord;
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

const safeInteger = (
  value: number | string | null,
  fallback: number,
  max = INT_MAX,
) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? Math.min(parsed, max)
    : fallback;
};

type PatchValue = string | number | null;

/**
 * Builds the PUT body from what the admin actually changed, plus the loaded
 * value of each changed field as `expected`, so the server can refuse the
 * edit if the player changed in the meantime. Returns null when nothing changed.
 */
export function buildUserPatch(loaded: UserData, edited: UserData) {
  const fields: Record<string, PatchValue> = {};
  const profile: Record<string, string> = {};
  const stats: Record<string, string | number> = {};
  const gameplay: Record<string, string | number | null> = {};
  const track = <T extends string | number | null>(
    target: Record<string, T>,
    key: string,
    before: T,
    after: T,
  ) => {
    if (before === after) return;
    target[key] = after;
    fields[key] = before;
  };
  track(profile, 'username', loaded.profile.username, edited.profile.username);
  track(profile, 'email', loaded.profile.email, edited.profile.email);
  track(stats, 'gold', loaded.stats.gold, edited.stats.gold);
  track(stats, 'goldInBank', loaded.stats.goldInBank, edited.stats.goldInBank);
  track(stats, 'experience', loaded.stats.experience, edited.stats.experience);
  for (const key of Object.keys(edited.gameplay) as (keyof UserGameplay)[]) {
    track(gameplay, key, loaded.gameplay[key], edited.gameplay[key]);
  }
  // A fort level change can clamp hitpoints server-side; guard the loaded HP.
  if ('fortLevel' in gameplay && !('fortHitpoints' in fields))
    fields.fortHitpoints = loaded.gameplay.fortHitpoints;
  const changedRows = <R extends { id: string; quantity: number }>(
    before: R[],
    after: R[],
  ) => {
    const rows = after.filter(
      (row) => before.find((b) => b.id === row.id)?.quantity !== row.quantity,
    );
    const expected = Object.fromEntries(
      rows.map((row) => [
        row.id,
        before.find((b) => b.id === row.id)?.quantity ?? 0,
      ]),
    );
    return { rows, expected };
  };
  const units = changedRows(loaded.army.units, edited.army.units);
  const items = changedRows(loaded.items.items, edited.items.items);
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value) => b.includes(value));
  const permissionsChanged = !sameSet(
    loaded.permissions.permissions,
    edited.permissions.permissions,
  );
  const rolesChanged = !sameSet(
    loaded.staffRoles.roles,
    edited.staffRoles.roles,
  );

  if (
    Object.keys(fields).length === 0 &&
    units.rows.length === 0 &&
    items.rows.length === 0 &&
    !permissionsChanged &&
    !rolesChanged
  )
    return null;

  return {
    profile,
    stats,
    ...(Object.keys(gameplay).length > 0 ? { gameplay } : {}),
    army: { units: units.rows },
    items: { items: items.rows },
    ...(permissionsChanged ? { permissions: edited.permissions } : {}),
    ...(rolesChanged ? { staffRoles: edited.staffRoles } : {}),
    expected: {
      eraId: loaded.record.currentEraId,
      fields,
      units: units.expected,
      items: items.expected,
      ...(permissionsChanged
        ? { permissions: loaded.permissions.permissions }
        : {}),
      ...(rolesChanged ? { staffRoles: loaded.staffRoles.roles } : {}),
    },
  };
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : '—';

const UserAdminEditor: React.FC<UserAdminEditorProps> = ({
  userId,
  onClose,
  onSaved,
  isAdministrator,
}) => {
  const { t } = useTranslation('admin-users');
  const { user: viewer } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  // Snapshot as loaded; saves send only the diff against it.
  const [loadedData, setLoadedData] = useState<UserData | null>(null);
  const [staleEdit, setStaleEdit] = useState(false);
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
      setLoadedData(payload);
      setStaleEdit(false);
    } catch (requestError) {
      logError('Failed to load admin user details', requestError);
      setError(
        requestError instanceof Error ? requestError.message : t('errors.load'),
      );
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  // Status lives outside the editable record; refresh only it so unsaved
  // edits on other tabs survive an account action.
  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
      );
      if (!response.ok) return;
      const payload = (await response.json()) as UserData;
      const merge = (current: UserData | null) =>
        current
          ? {
              ...current,
              profile: { ...current.profile, status: payload.profile.status },
              record: {
                ...current.record,
                statusHistory: payload.record.statusHistory,
              },
            }
          : current;
      setUserData(merge);
      setLoadedData(merge);
    } catch (requestError) {
      logError('Failed to refresh admin user status', requestError);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
    loadNotes();
  }, [loadNotes, loadUser]);

  const saveUser = async () => {
    if (!isAdministrator || !userData || !loadedData || saving) return;
    const patch = buildUserPatch(loadedData, userData);
    if (!patch) {
      alertService.notify(
        'info',
        t('messages.noChanges', { defaultValue: 'No changes to save' }),
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409 && payload.code === 'STALE') {
        setStaleEdit(true);
        throw new Error(
          t('errors.stale', {
            defaultValue:
              'This player changed since you opened the editor. Reload to see current values. Your edits were not saved.',
          }),
        );
      }
      if (!response.ok) throw new Error(payload.error || t('errors.save'));
      alertService.notify('success', t('messages.saved'), {
        title: t('messages.savedTitle'),
      });
      onSaved();
      await loadUser();
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

  const updateGameplay = <K extends keyof UserGameplay>(
    field: K,
    value: UserGameplay[K],
  ) => {
    if (!userData) return;
    setUserData({
      ...userData,
      gameplay: { ...userData.gameplay, [field]: value },
    });
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
  const canViewAbuseSignals = Boolean(
    viewer?.permissions?.some(
      (permission) => permission.type === 'VIEW_CHEAT_SIGNALS',
    ),
  );
  const canManageStatus =
    isAdministrator ||
    Boolean(
      viewer?.permissions?.some(
        (permission) => permission.type === 'MANAGE_ACCOUNT_STATUS',
      ),
    );
  const gp = userData.gameplay;
  const rec = userData.record;
  const fortMaxHp = (level: number) =>
    Fortifications.find((f) => f.level === level)?.hitpoints ?? 0;
  const visibleTabs = [
    'profile',
    'stats',
    'army',
    'items',
    'upgrades',
    'supporter',
    'forces',
    ...(canViewAbuseSignals ? ['signals'] : []),
    'notes',
    'operations',
    ...(isAdministrator ? ['staffRoles', 'permissions', 'privacy'] : []),
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
          {staleEdit && (
            <Button mt="sm" variant="default" onClick={loadUser}>
              {t('actions.reload', { defaultValue: 'Reload player' })}
            </Button>
          )}
        </Alert>
      )}
      <Tabs value={safeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List aria-label={t('editor.tabs')}>
          {visibleTabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab}>
              {tab === 'supporter'
                ? t('admin-supporters:title')
                : t(`tabs.${tab}`)}
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
                <Select
                  label={t('fields.veteranTitle', {
                    defaultValue: 'Veteran title',
                  })}
                  data={[
                    {
                      value: '',
                      label: t('fields.veteranTitleNone', {
                        defaultValue: 'None',
                      }),
                    },
                    {
                      value: 'ERA1_TESTER',
                      label: t('fields.veteranTitleERA1_TESTER', {
                        defaultValue: 'Era 1 Tester',
                      }),
                    },
                  ]}
                  value={gp.veteranTitle ?? ''}
                  readOnly={isReadOnly}
                  onChange={(value) =>
                    setUserData({
                      ...userData,
                      gameplay: {
                        ...gp,
                        veteranTitle: value || null,
                        // Clearing the title clears its date too.
                        veteranSince: value ? gp.veteranSince : null,
                      },
                    })
                  }
                  mt="sm"
                />
                <TextInput
                  label={t('fields.veteranSince', {
                    defaultValue: 'Veteran since (original join date)',
                  })}
                  description={t('fields.veteranSinceHelp', {
                    defaultValue:
                      'ISO date-time, not in the future; cleared when the title is None.',
                  })}
                  placeholder="2026-01-31T12:00:00.000Z"
                  value={gp.veteranSince ?? ''}
                  readOnly={isReadOnly}
                  onChange={(event) =>
                    updateGameplay(
                      'veteranSince',
                      event.currentTarget.value || null,
                    )
                  }
                  mt="sm"
                />
              </GameCard>
            </Grid.Col>
            <Grid.Col span={12}>
              <GameCard
                title={t('sections.record', { defaultValue: 'Account record' })}
              >
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
                  {[
                    [t('fields.rank', { defaultValue: 'Rank' }), rec.rank],
                    [
                      t('fields.lastActive', { defaultValue: 'Last active' }),
                      formatDate(rec.lastActive),
                    ],
                    [
                      t('fields.createdAt', { defaultValue: 'Joined' }),
                      formatDate(rec.createdAt),
                    ],
                    [
                      t('fields.currentEra', { defaultValue: 'Current era' }),
                      rec.currentEraId ?? '—',
                    ],
                    [
                      t('fields.eraJoinedAt', {
                        defaultValue: 'Era joined (protection start)',
                      }),
                      formatDate(rec.eraJoinedAt),
                    ],
                    [
                      t('fields.protectionForfeited', {
                        defaultValue: 'Protection forfeited in era',
                      }),
                      rec.protectionForfeitedEraId ?? '—',
                    ],
                  ].map(([label, value]) => (
                    <Text key={String(label)} size="sm">
                      <Text span c="dimmed">
                        {label}:
                      </Text>{' '}
                      {value}
                    </Text>
                  ))}
                </SimpleGrid>
                <Title order={5} mt="md">
                  {t('sections.alliances', { defaultValue: 'Alliances' })}
                </Title>
                {rec.alliances.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {t('states.noAlliances', { defaultValue: 'No alliance' })}
                  </Text>
                ) : (
                  <Group gap="xs" mt="xs">
                    {rec.alliances.map((alliance) => (
                      <Badge key={alliance.allianceId} variant="light">
                        {alliance.name}
                        {alliance.role ? ` · ${alliance.role}` : ''}
                      </Badge>
                    ))}
                  </Group>
                )}
                <Title order={5} mt="md">
                  {t('sections.statusHistory', {
                    defaultValue: 'Status history',
                  })}
                </Title>
                {rec.statusHistory.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {t('states.noStatusHistory', {
                      defaultValue: 'No status changes',
                    })}
                  </Text>
                ) : (
                  <Table.ScrollContainer minWidth={560}>
                    <Table striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t('fields.status')}</Table.Th>
                          <Table.Th>
                            {t('fields.start', { defaultValue: 'Start' })}
                          </Table.Th>
                          <Table.Th>
                            {t('fields.end', { defaultValue: 'End' })}
                          </Table.Th>
                          <Table.Th>
                            {t('fields.reason', { defaultValue: 'Reason' })}
                          </Table.Th>
                          <Table.Th>
                            {t('fields.byAdmin', { defaultValue: 'By' })}
                          </Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {rec.statusHistory.map((entry) => (
                          <Table.Tr key={entry.id}>
                            <Table.Td>{entry.status}</Table.Td>
                            <Table.Td>{formatDate(entry.startDate)}</Table.Td>
                            <Table.Td>{formatDate(entry.endDate)}</Table.Td>
                            <Table.Td style={{ overflowWrap: 'anywhere' }}>
                              {entry.reason ?? '—'}
                            </Table.Td>
                            <Table.Td>{entry.adminName ?? '—'}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                )}
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
                  max={INT_MAX}
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
            <Grid.Col span={{ base: 12, md: 6 }}>
              <GameCard
                title={t('sections.gameplay', { defaultValue: 'Kingdom' })}
              >
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <NumberInput
                    label={t('fields.fortLevel', {
                      defaultValue: 'Fort level',
                    })}
                    value={gp.fortLevel}
                    min={1}
                    max={MAX_FORT_LEVEL}
                    allowDecimal={false}
                    readOnly={isReadOnly}
                    onChange={(value) => {
                      const level = Math.max(
                        1,
                        safeInteger(value, gp.fortLevel, MAX_FORT_LEVEL),
                      );
                      setUserData({
                        ...userData,
                        gameplay: {
                          ...gp,
                          fortLevel: level,
                          fortHitpoints: Math.min(
                            gp.fortHitpoints,
                            fortMaxHp(level),
                          ),
                        },
                      });
                    }}
                  />
                  <NumberInput
                    label={t('fields.fortHitpoints', {
                      defaultValue: 'Fort hitpoints',
                    })}
                    description={`${t('fields.max', { defaultValue: 'Max' })} ${fortMaxHp(gp.fortLevel)}`}
                    value={gp.fortHitpoints}
                    min={0}
                    max={fortMaxHp(gp.fortLevel)}
                    allowDecimal={false}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateGameplay(
                        'fortHitpoints',
                        safeInteger(
                          value,
                          gp.fortHitpoints,
                          fortMaxHp(gp.fortLevel),
                        ),
                      )
                    }
                  />
                  <NumberInput
                    label={t('fields.stamina', { defaultValue: 'Stamina' })}
                    value={gp.stamina}
                    min={0}
                    max={gp.maxStamina}
                    allowDecimal={false}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateGameplay(
                        'stamina',
                        safeInteger(value, gp.stamina, gp.maxStamina),
                      )
                    }
                  />
                  <NumberInput
                    label={t('fields.maxStamina', {
                      defaultValue: 'Max stamina',
                    })}
                    value={gp.maxStamina}
                    min={1}
                    max={INT_MAX}
                    allowDecimal={false}
                    readOnly={isReadOnly}
                    onChange={(value) => {
                      const max = Math.max(
                        1,
                        safeInteger(value, gp.maxStamina),
                      );
                      setUserData({
                        ...userData,
                        gameplay: {
                          ...gp,
                          maxStamina: max,
                          stamina: Math.min(gp.stamina, max),
                        },
                      });
                    }}
                  />
                  <NumberInput
                    label={t('fields.attackTurns', {
                      defaultValue: 'Attack turns',
                    })}
                    value={gp.attackTurns}
                    min={0}
                    max={INT_MAX}
                    allowDecimal={false}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateGameplay(
                        'attackTurns',
                        safeInteger(value, gp.attackTurns),
                      )
                    }
                  />
                  <NumberInput
                    label={t('fields.houseLevel', {
                      defaultValue: 'House level',
                    })}
                    value={gp.houseLevel}
                    min={0}
                    max={MAX_HOUSE_LEVEL}
                    allowDecimal={false}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateGameplay(
                        'houseLevel',
                        safeInteger(value, gp.houseLevel, MAX_HOUSE_LEVEL),
                      )
                    }
                  />
                  <NumberInput
                    label={t('fields.economyLevel', {
                      defaultValue: 'Economy level',
                    })}
                    value={gp.economyLevel}
                    min={0}
                    max={MAX_ECONOMY_LEVEL}
                    allowDecimal={false}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      updateGameplay(
                        'economyLevel',
                        safeInteger(value, gp.economyLevel, MAX_ECONOMY_LEVEL),
                      )
                    }
                  />
                  <Select
                    label={t('fields.race', { defaultValue: 'Race' })}
                    data={RACES}
                    value={gp.race}
                    allowDeselect={false}
                    readOnly={isReadOnly}
                    onChange={(value) => value && updateGameplay('race', value)}
                  />
                  <Select
                    label={t('fields.class', { defaultValue: 'Class' })}
                    data={CLASSES}
                    value={gp.class}
                    allowDeselect={false}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      value && updateGameplay('class', value)
                    }
                  />
                  <Select
                    label={t('fields.locale', { defaultValue: 'Locale' })}
                    data={[...AppConfig.locales]}
                    value={gp.locale}
                    allowDeselect={false}
                    readOnly={isReadOnly}
                    onChange={(value) =>
                      value && updateGameplay('locale', value)
                    }
                  />
                </SimpleGrid>
                <Textarea
                  label={t('fields.bio', { defaultValue: 'Bio' })}
                  value={gp.bio}
                  maxLength={BIO_MAX_LENGTH}
                  minRows={3}
                  autosize
                  readOnly={isReadOnly}
                  onChange={(event) =>
                    updateGameplay('bio', event.currentTarget.value)
                  }
                  mt="sm"
                />
              </GameCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <GameCard
                title={t('sections.derived', {
                  defaultValue: 'Derived strength',
                })}
              >
                <SimpleGrid cols={2}>
                  {(['offense', 'defense', 'spy', 'sentry'] as const).map(
                    (stat) => (
                      <NumberInput
                        key={stat}
                        label={t(`fields.${stat}`, {
                          defaultValue:
                            stat.charAt(0).toUpperCase() + stat.slice(1),
                        })}
                        value={userData.derived[stat]}
                        readOnly
                        hideControls
                        thousandSeparator=","
                      />
                    ),
                  )}
                </SimpleGrid>
                <Text size="xs" c="dimmed" mt="xs">
                  {t('fields.derivedHelp', {
                    defaultValue:
                      'Recalculated on save when units, items, fort, experience, race or class change.',
                  })}
                </Text>
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
                {userData.army.units.map((unit) => {
                  // Mercenary rows are owned by their contract (server enforces).
                  const locked = isReadOnly || unit.isMercenary;
                  const lockLabel = t('fields.mercenaryLocked', {
                    defaultValue: 'Managed by mercenary contract',
                  });
                  return (
                    <Group key={unit.id} justify="space-between" wrap="nowrap">
                      <Text style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {unit.name} · {t('fields.level')} {unit.level}
                        {unit.isMercenary ? ` · ${t('fields.mercenary')}` : ''}
                      </Text>
                      <Tooltip
                        label={lockLabel}
                        disabled={!unit.isMercenary}
                        withinPortal
                      >
                        <Group gap="xs" wrap="nowrap">
                          <ActionIcon
                            aria-label={t('actions.decreaseQuantity', {
                              name: unit.name,
                            })}
                            disabled={locked || unit.quantity <= 0}
                            onClick={() =>
                              updateQuantity(
                                'units',
                                unit.id,
                                unit.quantity - 1,
                              )
                            }
                          >
                            <FontAwesomeIcon icon={faMinus} />
                          </ActionIcon>
                          <NumberInput
                            aria-label={t('fields.quantityFor', {
                              name: unit.name,
                            })}
                            description={
                              unit.isMercenary ? lockLabel : undefined
                            }
                            value={unit.quantity}
                            min={0}
                            max={INT_MAX}
                            allowDecimal={false}
                            hideControls
                            w={96}
                            readOnly={locked}
                            disabled={unit.isMercenary}
                            onChange={(value) =>
                              updateQuantity('units', unit.id, value)
                            }
                          />
                          <ActionIcon
                            aria-label={t('actions.increaseQuantity', {
                              name: unit.name,
                            })}
                            disabled={locked || unit.quantity >= INT_MAX}
                            onClick={() =>
                              updateQuantity(
                                'units',
                                unit.id,
                                unit.quantity + 1,
                              )
                            }
                          >
                            <FontAwesomeIcon icon={faPlus} />
                          </ActionIcon>
                        </Group>
                      </Tooltip>
                    </Group>
                  );
                })}
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
                        max={INT_MAX}
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
                        disabled={isReadOnly || item.quantity >= INT_MAX}
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
        <Tabs.Panel value="upgrades" pt="md">
          <PlayerUpgradesPanel
            userId={Number(userId)}
            readOnly={!isAdministrator}
          />
        </Tabs.Panel>
        <Tabs.Panel value="supporter" pt="md">
          <PlayerSupporterPanel userId={Number(userId)} />
        </Tabs.Panel>
        <Tabs.Panel value="forces" pt="md">
          <PlayerForcesPanel userId={Number(userId)} />
        </Tabs.Panel>
        {canViewAbuseSignals && (
          <Tabs.Panel value="signals" pt="md">
            <Stack gap="sm">
              <AbuseSignalsPanel userId={Number(userId)} compact />
              <Anchor
                component={Link}
                href={`/home/admin/cheat-signals?userId=${userId}`}
                size="sm"
              >
                {t('tabs.signalsOpenFull')}
              </Anchor>
            </Stack>
          </Tabs.Panel>
        )}
        {isAdministrator && (
          <Tabs.Panel value="privacy" pt="md">
            <PrivacyRequestsPanelLive userId={Number(userId)} />
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
              canManageStatus={canManageStatus}
              currentStatus={userData.profile.status}
              onStatusChanged={refreshStatus}
            />
            {isAdministrator && (
              <GameCard title={t('sections.export')}>
                <AdminUserExport userId={userId} />
              </GameCard>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
      <ConfirmationModal
        isOpen={noteDeleteTarget !== null}
        onClose={() => !deletingNote && setNoteDeleteTarget(null)}
        onConfirm={removeNote}
        title={t('notes.deleteTitle')}
        message={t('notes.deleteConfirm')}
        type="destructive"
        confirmText={t('actions.deleteNote')}
        isLoading={deletingNote}
      />
    </Stack>
  );
};

export default UserAdminEditor;
