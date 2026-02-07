import {
  Alert,
  Button,
  Group,
  Loader,
  Select,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

export default function CreateAlliance() {
  const { user } = useUser();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation('alliances');

  const form = useForm({
    initialValues: {
      allianceName: '',
      motto: '',
      comments: '',
      avatarUrl: '',
      joinMode: 'OPEN',
      rosterVisibility: 'PUBLIC',
    },

    validate: {
      allianceName: (value) =>
        value.trim().length >= 3 ? null : t('create.nameTooShort'),
      motto: (value) =>
        value.trim().length === 0 || value.trim().length <= 255
          ? null
          : t('create.mottoTooLong'),
      comments: (value) =>
        value.trim().length === 0 || value.trim().length <= 1000
          ? null
          : t('create.commentsTooLong'),
    },
  });

  if (!user) {
    return (
      <MainArea title={t('create.title')}>
        <Loader />
      </MainArea>
    );
  }

  if (user.level < 10) {
    return (
      <MainArea title={t('create.title')}>
        <Alert color="red">{t('create.levelRequired', { level: 10 })}</Alert>
      </MainArea>
    );
  }

  if (user.gold < 100000000) {
    return (
      <MainArea title={t('create.title')}>
        <Alert color="red">
          {t('create.goldRequired', { cost: '100 million' })}
        </Alert>
      </MainArea>
    );
  }

  const handleSubmit = async (values: {
    allianceName: string;
    motto: string;
    comments: string;
    avatarUrl: string;
    joinMode: string;
    rosterVisibility: string;
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
          join_mode: values.joinMode,
          roster_visibility: values.rosterVisibility,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data?.error || t('create.error');
        alertService.error(message);
        return;
      }

      alertService.success(t('create.success'));
      router.push('/alliances');
    } catch (error) {
      logError('Failed to create alliance:', error);
      alertService.error(t('create.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainArea title={t('create.title')}>
      <GameCard title={t('create.charter')}>
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput
            label={t('create.name')}
            placeholder={t('create.namePlaceholder')}
            required
            {...form.getInputProps('allianceName')}
          />
          <Group grow>
            <Select
              label={t('create.joinMode')}
              data={[
                { value: 'OPEN', label: t('create.joinModeOpen') },
                {
                  value: 'REQUEST_TO_JOIN',
                  label: t('create.joinModeRequest'),
                },
                {
                  value: 'INVITE_ONLY',
                  label: t('create.joinModeInvite'),
                },
              ]}
              {...form.getInputProps('joinMode')}
            />
            <Select
              label={t('create.rosterVisibility')}
              data={[
                { value: 'PUBLIC', label: t('create.rosterPublic') },
                {
                  value: 'MEMBERS_ONLY',
                  label: t('create.rosterMembersOnly'),
                },
              ]}
              {...form.getInputProps('rosterVisibility')}
            />
          </Group>
          <TextInput
            label={t('create.avatar')}
            placeholder={t('create.avatarPlaceholder')}
            {...form.getInputProps('avatarUrl')}
          />
          <TextInput
            label={t('create.motto')}
            placeholder={t('create.mottoPlaceholder')}
            {...form.getInputProps('motto')}
          />
          <Textarea
            label={t('create.comments')}
            placeholder={t('create.commentsPlaceholder')}
            minRows={4}
            {...form.getInputProps('comments')}
          />

          <Text>{t('create.cost')}</Text>
          <Group mt="md">
            <Button type="submit" loading={submitting} color="yellow">
              {t('create.create')}
            </Button>
          </Group>
        </form>
      </GameCard>
    </MainArea>
  );
}
