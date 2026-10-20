import {
  faArrowDown,
  faArrowUp,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useState } from 'react';

import {
  allianceRequest,
  getAllianceStanding,
} from '@/components/alliance/allianceStanding';
import { ConfirmActionModal } from '@/components/alliance/ConfirmActionModal';
import type { AlliancePermissionKey } from '@/constants/alliancePermissions';
import {
  ALLIANCE_PERMISSION_KEYS,
  ALLIANCE_PERMISSION_LABELS,
  DEFAULT_ALLIANCE_ROLE_NAME,
} from '@/constants/alliancePermissions';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo, AllianceRole } from '@/services/Alliance.service';

interface AllianceRanksProps {
  alliance: AllianceInfo;
  viewerId: number | null;
  onUpdate?: () => void;
}

interface DraftRank {
  id: number;
  name: string;
  rankOrder: number;
  permissions: Partial<Record<AlliancePermissionKey, boolean>>;
}

const toDraft = (roles: AllianceRole[]): DraftRank[] =>
  roles.map((role) => ({
    id: role.id,
    name: role.name,
    rankOrder: role.rank_order,
    permissions: { ...((role.permissions ?? {}) as DraftRank['permissions']) },
  }));

/** Rank editor: order, names and the permission grid (edit_ranks). */
export const AllianceRanks = ({
  alliance,
  viewerId,
  onUpdate,
}: AllianceRanksProps) => {
  const { t } = useTranslation('alliances');
  const standing = getAllianceStanding(alliance, viewerId);
  const roles = useMemo(
    () => alliance.alliance_roles ?? [],
    [alliance.alliance_roles],
  );
  const [draft, setDraft] = useState<DraftRank[]>(() => toDraft(roles));
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<DraftRank | null>(null);

  // SWR refetches every 30s; only reset unsaved edits when the ranks changed.
  const rolesKey = JSON.stringify(roles);
  useEffect(() => {
    setDraft(toDraft(JSON.parse(rolesKey) as AllianceRole[]));
  }, [rolesKey]);

  const memberCounts = useMemo(() => {
    const counts = new Map<number, number>();
    alliance.members?.forEach((member) =>
      counts.set(member.role_id, (counts.get(member.role_id) ?? 0) + 1),
    );
    return counts;
  }, [alliance.members]);

  const label = (key: AlliancePermissionKey) =>
    t(
      ALLIANCE_PERMISSION_LABELS[key].key,
      ALLIANCE_PERMISSION_LABELS[key].fallback,
    );

  // A rank is editable only when it sits below the viewer's own rank.
  const editable = (rank: DraftRank) => standing.outranks(rank.rankOrder);
  const isDefault = (rank: DraftRank) =>
    rank.name === DEFAULT_ALLIANCE_ROLE_NAME &&
    roles.find((role) => role.id === rank.id)?.name ===
      DEFAULT_ALLIANCE_ROLE_NAME;

  const update = (id: number, patch: Partial<DraftRank>) =>
    setDraft((ranks) =>
      ranks.map((rank) => (rank.id === id ? { ...rank, ...patch } : rank)),
    );

  const move = (index: number, delta: number) =>
    setDraft((ranks) => {
      const next = [...ranks];
      const [rank] = next.splice(index, 1);
      next.splice(index + delta, 0, rank);
      return next;
    });

  const canMove = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return false;
    const rank = draft[index];
    const other = draft[target];
    return (
      editable(rank) && editable(other) && !isDefault(rank) && !isDefault(other)
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const rank of draft) {
        const original = roles.find((role) => role.id === rank.id);
        if (!original || !editable(rank)) continue;
        const originalPerms = (original.permissions ?? {}) as Record<
          string,
          boolean
        >;
        const permsChanged = ALLIANCE_PERMISSION_KEYS.some(
          (key) => !!originalPerms[key] !== !!rank.permissions[key],
        );
        const nameChanged = rank.name.trim() !== original.name;
        if (!permsChanged && !nameChanged) continue;
        await allianceRequest(
          '/api/alliances/roles',
          {
            allianceId: alliance.id,
            roleId: rank.id,
            ...(nameChanged ? { name: rank.name.trim() } : {}),
            ...(permsChanged
              ? {
                  permissions: Object.fromEntries(
                    ALLIANCE_PERMISSION_KEYS.map((key) => [
                      key,
                      !!rank.permissions[key],
                    ]),
                  ),
                }
              : {}),
          },
          'PATCH',
        );
      }
      const orderChanged = draft.some((rank, i) => roles[i]?.id !== rank.id);
      if (orderChanged) {
        await allianceRequest('/api/alliances/roles/reorder', {
          allianceId: alliance.id,
          roleIds: draft.map((rank) => rank.id),
        });
      }
      alertService.success(t('ranks.saved', 'Ranks saved'));
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setSaving(false);
      onUpdate?.();
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await allianceRequest('/api/alliances/roles', {
        allianceId: alliance.id,
        name: newName.trim(),
        permissions: {},
      });
      setNewName('');
      alertService.success(t('ranks.added', 'Rank added'));
      onUpdate?.();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await allianceRequest(
        '/api/alliances/roles',
        { allianceId: alliance.id, roleId: deleting.id },
        'DELETE',
      );
      setDeleting(null);
      alertService.success(t('ranks.deleted', 'Rank deleted'));
      onUpdate?.();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <div>
          <Title order={4}>{t('ranks.title', 'Ranks')}</Title>
          <Text size="sm" c="dimmed">
            {t(
              'ranks.help',
              'Higher ranks are listed first. You can only edit ranks below your own and grant permissions you hold.',
            )}
          </Text>
        </div>

        <ScrollArea type="auto">
          <Table verticalSpacing="xs" withColumnBorders miw={1250}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('ranks.order', 'Order')}</Table.Th>
                <Table.Th miw={180}>{t('ranks.name', 'Rank')}</Table.Th>
                {ALLIANCE_PERMISSION_KEYS.map((key) => (
                  <Table.Th key={key} ta="center">
                    <Text size="xs" fw={600}>
                      {label(key)}
                    </Text>
                  </Table.Th>
                ))}
                <Table.Th>
                  <Text component="span" className="sr-only">
                    {t('ranks.delete', 'Delete rank')}
                  </Text>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td />
                <Table.Td>
                  <Badge color="yellow" variant="light">
                    {t('index.allianceLeader', 'Alliance Leader')}
                  </Badge>
                </Table.Td>
                {ALLIANCE_PERMISSION_KEYS.map((key) => (
                  <Table.Td key={key} ta="center">
                    <Checkbox
                      checked
                      disabled
                      readOnly
                      aria-label={label(key)}
                      styles={{ body: { justifyContent: 'center' } }}
                    />
                  </Table.Td>
                ))}
                <Table.Td />
              </Table.Tr>
              {draft.map((rank, index) => {
                const canEdit = editable(rank);
                const members = memberCounts.get(rank.id) ?? 0;
                return (
                  <Table.Tr key={rank.id}>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          disabled={!canMove(index, -1) || saving}
                          onClick={() => move(index, -1)}
                          aria-label={t('ranks.moveUp', 'Move rank up')}
                        >
                          <FontAwesomeIcon icon={faArrowUp} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          disabled={!canMove(index, 1) || saving}
                          onClick={() => move(index, 1)}
                          aria-label={t('ranks.moveDown', 'Move rank down')}
                        >
                          <FontAwesomeIcon icon={faArrowDown} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        size="xs"
                        miw={160}
                        value={rank.name}
                        maxLength={50}
                        disabled={!canEdit || isDefault(rank) || saving}
                        aria-label={t('ranks.name', 'Rank')}
                        onChange={(event) =>
                          update(rank.id, { name: event.currentTarget.value })
                        }
                      />
                    </Table.Td>
                    {ALLIANCE_PERMISSION_KEYS.map((key) => (
                      <Table.Td key={key} ta="center">
                        <Checkbox
                          checked={!!rank.permissions[key]}
                          disabled={
                            !canEdit ||
                            saving ||
                            (!standing.can(key) && !rank.permissions[key])
                          }
                          aria-label={`${rank.name}: ${label(key)}`}
                          styles={{ body: { justifyContent: 'center' } }}
                          onChange={(event) =>
                            update(rank.id, {
                              permissions: {
                                ...rank.permissions,
                                [key]: event.currentTarget.checked,
                              },
                            })
                          }
                        />
                      </Table.Td>
                    ))}
                    <Table.Td>
                      {canEdit && !isDefault(rank) && (
                        <Tooltip
                          label={
                            members > 0
                              ? t(
                                  'ranks.inUse',
                                  'Move its members to another rank first',
                                )
                              : t('ranks.delete', 'Delete rank')
                          }
                        >
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            disabled={members > 0 || saving}
                            onClick={() => setDeleting(rank)}
                            aria-label={t('ranks.delete', 'Delete rank')}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Group justify="space-between" align="flex-end">
          <Group align="flex-end" gap="xs">
            <TextInput
              label={t('ranks.newRank', 'New rank')}
              value={newName}
              maxLength={50}
              onChange={(event) => setNewName(event.currentTarget.value)}
            />
            <Button
              variant="light"
              onClick={handleAdd}
              disabled={!newName.trim()}
              loading={saving}
            >
              {t('ranks.add', 'Add rank')}
            </Button>
          </Group>
          <Button onClick={handleSave} loading={saving}>
            {t('settings.save', 'Save Changes')}
          </Button>
        </Group>
      </Stack>

      <ConfirmActionModal
        opened={deleting !== null}
        title={t('ranks.delete', 'Delete rank')}
        message={t('ranks.deleteConfirm', 'Delete the rank "{{name}}"?', {
          name: deleting?.name ?? '',
        })}
        confirmLabel={t('ranks.delete', 'Delete rank')}
        loading={saving}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </Paper>
  );
};
