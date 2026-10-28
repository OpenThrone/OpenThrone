import { faArrowRight, faComments } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Avatar, Box, Group, Menu, ScrollArea, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import { formatLastMessageTime } from '@/utils/timefunctions';

import styles from './ChatThemed.module.css';

interface ChatNotification {
  id: number;
  senderName: string;
  content: string;
  timestamp: string;
  chatRoomId: number;
}

export default function ChatNotificationItems({
  messages,
  onRoomSelect,
}: {
  messages: ChatNotification[];
  onRoomSelect: (roomId: number) => void;
}) {
  const { t } = useTranslation('common');
  return (
    <>
      <Menu.Label className={styles.notificationHeading}>
        {t('interface.recentUnreadMessages')}
      </Menu.Label>
      {messages.length === 0 ? (
        <Box className={styles.notificationEmpty}>
          <FontAwesomeIcon icon={faComments} size="lg" />
          <Text size="sm" fw={500} mt="xs">
            {t('interface.noUnreadMessages')}
          </Text>
        </Box>
      ) : (
        <ScrollArea.Autosize mah={300} type="auto">
          {[...messages]
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            )
            .slice(0, 10)
            .map((message) => (
              <Menu.Item
                key={message.id}
                component={Link}
                href={`/messaging?roomId=${message.chatRoomId}`}
                onClick={() => onRoomSelect(message.chatRoomId)}
                className={styles.notificationItem}
              >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Avatar size={36} radius="xl">
                    {message.senderName?.charAt(0).toUpperCase() || '?'}
                  </Avatar>
                  <div className={styles.roomContent}>
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                      <Text size="sm" fw={600} truncate>
                        {message.senderName}
                      </Text>
                      <Text
                        size="xs"
                        c="var(--ot-muted)"
                        style={{ flexShrink: 0 }}
                      >
                        {formatLastMessageTime(message.timestamp)}
                      </Text>
                    </Group>
                    <Text size="xs" c="var(--ot-muted)" lineClamp={2}>
                      {message.content}
                    </Text>
                  </div>
                  <span className={styles.unreadDot} />
                </Group>
              </Menu.Item>
            ))}
        </ScrollArea.Autosize>
      )}
      <Menu.Divider />
      <Menu.Item
        component={Link}
        href="/messaging"
        rightSection={<FontAwesomeIcon icon={faArrowRight} />}
        className={styles.notificationFooter}
      >
        {t('interface.seeAllMessages')}
      </Menu.Item>
    </>
  );
}
