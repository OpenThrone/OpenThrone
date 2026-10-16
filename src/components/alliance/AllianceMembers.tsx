import { Avatar, Badge, Group, Table, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import type { AllianceInfo } from '@/services/Alliance.service';

interface AllianceMembersProps {
  alliance: AllianceInfo;
}

/** Alliance members. */
export const AllianceMembers = ({ alliance }: AllianceMembersProps) => {
  const { t } = useTranslation('alliances');

  // Check visibility logic (handled by backend usually, but good to reinforce UI)
  // If backend filters `members` array based on visibility, we just render what we have.
  // Assuming page logic passed full alliance object if viewer has permission.

  if (!alliance.members || alliance.members.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {t('members.noMembers', 'No members to display.')}
      </Text>
    );
  }

  const rows = alliance.members.map((member) => (
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
          {member.role.name}
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
    </Table.Tr>
  ));

  return (
    <Table verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('members.name', 'Name')}</Table.Th>
          <Table.Th>{t('members.role', 'Role')}</Table.Th>
          <Table.Th>{t('members.raceClass', 'Race / Class')}</Table.Th>
          <Table.Th>{t('members.lastActive', 'Last Active')}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
};
