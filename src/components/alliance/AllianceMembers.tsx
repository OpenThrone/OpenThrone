import { faEllipsisVertical } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Avatar,
  Badge,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import {
  allianceRequest,
  getAllianceStanding,
} from '@/components/alliance/allianceStanding';
import { ConfirmActionModal } from '@/components/alliance/ConfirmActionModal';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo, AllianceMember } from '@/services/Alliance.service';

interface AllianceMembersProps {
  alliance: AllianceInfo;
  viewerId?: number | null;
  onUpdate?: () => void;
}

type PendingAction = {
  type: 'kick' | 'leader' | 'rank';
  member: AllianceMember;
};

/** Alliance members, with rank, kick and leadership actions for officers. */
export const AllianceMembers = ({
  alliance,
  viewerId = null,
  onUpdate,
}: AllianceMembersProps) => {
  const { t } = useTranslation('alliances');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);
  const standing = getAllianceStanding(alliance, viewerId);
  const roles = alliance.alliance_roles ?? [];
  const assignableRoles = roles.filter((role) =>
    standing.outranks(role.rank_order),
  );

  const actionsFor = (member: AllianceMember) => {
    const isSelf = member.user_id === viewerId;
    const isLeaderRow = member.user_id === alliance.leader_id;
    const outranked = !isLeaderRow && standing.outranks(member.role.rank_order);
    return {
      rank:
        standing.can('grant_access') &&
        assignableRoles.length > 0 &&
        !isLeaderRow &&
        (standing.isLeader ? true : !isSelf && outranked),
      kick: standing.can('kick_member') && !isSelf && outranked,
      leader: standing.isLeader && !isSelf,
    };
  };

  const run = async (
    url: string,
    body: Record<string, unknown>,
    ok: string,
  ) => {
    setLoading(true);
    try {
      await allianceRequest(url, body);
      alertService.success(ok);
      setPending(null);
      onUpdate?.();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // The server omits `members` for non-members when the roster is
  // MEMBERS_ONLY (ALL-08); render what we were given.
  if (!alliance.members && alliance.roster_visibility !== 'PUBLIC') {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {t(
          'members.rosterHidden',
          'This alliance shares its roster with members only.',
        )}
      </Text>
    );
  }

  if (!alliance.members || alliance.members.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {t('members.noMembers', 'No members to display.')}
      </Text>
    );
  }

  const showActions = alliance.members.some((member) => {
    const actions = actionsFor(member);
    return actions.rank || actions.kick || actions.leader;
  });

  const rows = alliance.members.map((member) => {
    const actions = actionsFor(member);
    const hasActions = actions.rank || actions.kick || actions.leader;
    return (
      <Table.Tr key={member.id}>
        <Table.Td>
          <Group gap="sm">
            <Avatar src={member.user.avatar} size={30} radius={30} />
            <Link
              href={`/user/${member.user.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Text fz="sm" fw={500}>
                {member.user.display_name}
              </Text>
            </Link>
          </Group>
        </Table.Td>
        <Table.Td>
          <Badge
            color={member.role.name === 'Leader' ? 'yellow' : 'blue'}
            variant="light"
          >
            {member.user_id === alliance.leader_id
              ? t('index.allianceLeader', 'Alliance Leader')
              : member.role.name}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Text fz="sm">
            {member.user.race} / {member.user.class}
          </Text>
        </Table.Td>
        <Table.Td>
          <Text fz="sm" c="dimmed">
            {member.user.last_active
              ? new Date(member.user.last_active).toLocaleDateString()
              : '-'}
          </Text>
        </Table.Td>
        {showActions && (
          <Table.Td align="right">
            {hasActions && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t('manage.memberActions', 'Member actions')}
                  >
                    <FontAwesomeIcon icon={faEllipsisVertical} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {actions.rank && (
                    <Menu.Item
                      onClick={() => setPending({ type: 'rank', member })}
                    >
                      {t('manage.changeRank', 'Change rank')}
                    </Menu.Item>
                  )}
                  {actions.leader && (
                    <Menu.Item
                      onClick={() => setPending({ type: 'leader', member })}
                    >
                      {t('manage.makeLeader', 'Make leader')}
                    </Menu.Item>
                  )}
                  {actions.kick && (
                    <Menu.Item
                      color="red"
                      onClick={() => setPending({ type: 'kick', member })}
                    >
                      {t('index.kickMember', 'Kick Member')}
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Table.Td>
        )}
      </Table.Tr>
    );
  });

  const pendingName = pending?.member.user.display_name ?? '';

  return (
    <>
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('members.name', 'Name')}</Table.Th>
            <Table.Th>{t('members.role', 'Role')}</Table.Th>
            <Table.Th>{t('members.raceClass', 'Race / Class')}</Table.Th>
            <Table.Th>{t('members.lastActive', 'Last Active')}</Table.Th>
            {showActions && (
              <Table.Th>
                <Text component="span" className="sr-only">
                  {t('manage.memberActions', 'Member actions')}
                </Text>
              </Table.Th>
            )}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>

      <Modal
        opened={pending?.type === 'rank'}
        onClose={() => setPending(null)}
        title={t('manage.changeRankFor', 'Change rank for {{name}}', {
          name: pendingName,
        })}
        centered
      >
        <Stack>
          <Select
            label={t('members.role', 'Role')}
            data={assignableRoles.map((role) => ({
              value: String(role.id),
              label: role.name,
            }))}
            value={pending?.member ? String(pending.member.role_id) : null}
            disabled={loading}
            allowDeselect={false}
            onChange={(value) => {
              if (!value || !pending) return;
              run(
                '/api/alliances/members/role',
                {
                  allianceId: alliance.id,
                  userId: pending.member.user_id,
                  roleId: Number(value),
                },
                t('manage.rankChanged', 'Rank updated'),
              );
            }}
          />
        </Stack>
      </Modal>

      <ConfirmActionModal
        opened={pending?.type === 'kick'}
        title={t('index.kickMember', 'Kick Member')}
        message={t('manage.kickConfirm', 'Remove {{name}} from the alliance?', {
          name: pendingName,
        })}
        confirmLabel={t('index.kickMember', 'Kick Member')}
        loading={loading}
        onClose={() => setPending(null)}
        onConfirm={() =>
          pending &&
          run(
            '/api/alliances/members/kick',
            { allianceId: alliance.id, userId: pending.member.user_id },
            t('index.kickSuccess', 'Member kicked successfully!'),
          )
        }
      />

      <ConfirmActionModal
        opened={pending?.type === 'leader'}
        title={t('manage.makeLeader', 'Make leader')}
        message={t(
          'manage.makeLeaderConfirm',
          'Hand leadership to {{name}}? You will keep your current rank and lose all leader rights.',
          { name: pendingName },
        )}
        confirmLabel={t('manage.makeLeader', 'Make leader')}
        loading={loading}
        onClose={() => setPending(null)}
        onConfirm={() =>
          pending &&
          run(
            '/api/alliances/transfer-leadership',
            { allianceId: alliance.id, newLeaderId: pending.member.user_id },
            t('manage.leaderChanged', 'Leadership transferred'),
          )
        }
      />
    </>
  );
};
