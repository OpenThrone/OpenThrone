import { useRouter } from 'next/router';
import { useState } from 'react';
import { Alert, Button, Group, Loader, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { alertService } from '@/services/Alert.service';
import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';
import MainArea from '@/components/MainArea';
import { GameCard } from '@/components/game/GameCard';

export default function CreateAlliance() {
  const { user } = useUser();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    initialValues: {
      allianceName: '',
      motto: '',
      comments: '',
      avatarUrl: '',
    },

    validate: {
      allianceName: (value) =>
        value.trim().length >= 3 ? null : 'Alliance name must be at least 3 characters long',
      motto: (value) =>
        value.trim().length === 0 || value.trim().length <= 255
          ? null
          : 'Motto must be 255 characters or less',
      comments: (value) =>
        value.trim().length === 0 || value.trim().length <= 1000
          ? null
          : 'Comments must be 1000 characters or less',
    },
  });

  if (!user) {
    return (
      <MainArea title="Create Alliance">
        <Loader />
      </MainArea>
    );
  }

  if (user.level < 10) {
    return (
      <MainArea title="Create Alliance">
        <Alert color="red">
          You must be at least level 10 to create an alliance.
        </Alert>
      </MainArea>
    );
  }

  if (user.gold < 100000000) {
    return (
      <MainArea title="Create Alliance">
        <Alert color="red">Creating an alliance costs 100 million gold.</Alert>
      </MainArea>
    );
  }

  const handleSubmit = async (values: {
    allianceName: string;
    motto: string;
    comments: string;
    avatarUrl: string;
  }) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/alliances/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.allianceName,
          motto: values.motto.trim() || undefined,
          comments: values.comments.trim() || undefined,
          avatar: values.avatarUrl.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (data as any)?.error || 'Failed to create alliance';
        alertService.error(message);
        return;
      }

      alertService.success('Alliance created');
      router.push('/alliances');
    } catch (error) {
      logError('Failed to create alliance:', error);
      alertService.error('Failed to create alliance');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainArea title="Create Alliance">
      <GameCard title="Alliance Charter">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput
            label="Alliance Name"
            placeholder="Enter your alliance name"
            required
            {...form.getInputProps('allianceName')}
          />
          <TextInput
            label="Avatar URL (optional)"
            placeholder="https://..."
            {...form.getInputProps('avatarUrl')}
          />
          <TextInput
            label="Motto (optional)"
            placeholder="Short motto"
            {...form.getInputProps('motto')}
          />
          <Textarea
            label="Comments (optional)"
            placeholder="Describe your alliance"
            minRows={4}
            {...form.getInputProps('comments')}
          />

          <Text>Cost: 100 Million Gold</Text>
          <Group mt="md">
            <Button type="submit" loading={submitting} color="yellow">
              Create Alliance
            </Button>
          </Group>
        </form>
      </GameCard>
    </MainArea>
  );
}
