import {
  Button,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

const MassMessagingPage = () => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendToAll, setSendToAll] = useState(false);
  const [recipientIds, setRecipientIds] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Subject and body are required.',
        color: 'red',
      });
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/admin/content/mass-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          sendToAll,
          recipientUserIds: !sendToAll
            ? recipientIds
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => !Number.isNaN(n))
            : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        notifications.show({
          title: 'Sent',
          message: `Sent ${data.sent} messages.`,
          color: 'green',
        });
        setSubject('');
        setBody('');
      }
    } catch (err) {
      logError('Failed to send:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to send.',
        color: 'red',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout
      title="Content: Mass Messaging"
      permissions={['SEND_MASS_MESSAGES']}
    >
      <Stack gap="md">
        <Paper p="md" withBorder>
          <Text size="sm" c="dimmed" mb="md">
            Send direct in-game messages to all users or a specific list. Use
            sparingly — players receive these immediately.
          </Text>
        </Paper>

        <GameCard title="Compose">
          <Stack>
            <Switch
              label="Send to ALL active users"
              checked={sendToAll}
              onChange={(e) => setSendToAll(e.currentTarget.checked)}
            />
            {!sendToAll && (
              <TextInput
                label="Recipient User IDs (comma separated)"
                value={recipientIds}
                onChange={(e) => setRecipientIds(e.currentTarget.value)}
                placeholder="123, 456, 789"
              />
            )}
            <TextInput
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.currentTarget.value)}
            />
            <Textarea
              label="Message"
              minRows={6}
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                color="orange"
                loading={sending}
                onClick={handleSend}
                disabled={!subject.trim() || !body.trim()}
              >
                {sendToAll ? 'Broadcast to All' : 'Send'}
              </Button>
            </Group>
          </Stack>
        </GameCard>
      </Stack>
    </AdminLayout>
  );
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
      ])),
    },
  };
};

export default MassMessagingPage;
