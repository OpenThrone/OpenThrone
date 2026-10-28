import { faUsers } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Avatar,
  Badge,
  Button,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';

import type { FrontendRoom } from '@/types/typings';

import styles from './ChatThemed.module.css';

interface ChatMembersPopoverProps {
  participants: FrontendRoom['participants'];
  currentUserId?: number;
}

/** Viewing the roster is available to all members; moderation stays separate. */
export default function ChatMembersPopover({
  participants,
  currentUserId,
}: ChatMembersPopoverProps) {
  const { t } = useTranslation('messaging');
  return (
    <Popover width={300} position="bottom-end" withArrow shadow="md" trapFocus>
      <Popover.Target>
        <Button
          variant="subtle"
          size="compact-sm"
          className={styles.membersButton}
          leftSection={<FontAwesomeIcon icon={faUsers} />}
        >
          {t('conversation.members', { count: participants.length })}
        </Button>
      </Popover.Target>
      <Popover.Dropdown className={styles.roster}>
        <Text className={styles.panelTitle} mb="sm">
          {t('members.roster')}
        </Text>
        <ScrollArea.Autosize mah={300} type="auto">
          <Stack gap="sm">
            {participants.map((participant) => (
              <Group key={participant.id} gap="sm" wrap="nowrap">
                <Avatar src={participant.avatar} size={36} radius="xl">
                  {participant.display_name?.charAt(0).toUpperCase() || '?'}
                </Avatar>
                <div className={styles.roomContent}>
                  <Text size="sm" fw={600} truncate>
                    {participant.display_name}{' '}
                    {participant.id === currentUserId
                      ? t('members.youSuffix')
                      : ''}
                  </Text>
                  <Text size="xs" c="var(--ot-muted)">
                    {participant.is_online
                      ? t('conversation.online')
                      : t('conversation.offline')}
                  </Text>
                </div>
                {participant.role === 'ADMIN' && (
                  <Badge size="xs" variant="light" color="yellow">
                    {t('members.roles.ADMIN')}
                  </Badge>
                )}
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
