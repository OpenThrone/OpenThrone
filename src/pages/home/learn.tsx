import { faBookOpen, faGraduationCap } from '@fortawesome/free-solid-svg-icons';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { TUTORIAL_CHAPTER_LIST } from '@/components/walkthrough/chapters';
import { useTutorialState } from '@/hooks/useTutorialState';
import type { TutorialChapterId } from '@/utils/tutorialState';
import { getTutorialPhase } from '@/utils/tutorialState';

const GUIDES = [
  { key: 'howToPlay', href: '/how-to-play' },
  { key: 'faq', href: '/faq' },
] as const;

/**
 * On-demand learning: replay any guided lesson, restart the whole tutorial, or
 * open the full written guides. Replaying switches the tutorial back on, even
 * after "Don't show again".
 */
const Learn = () => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { state, ready, dispatch } = useTutorialState();
  const [busy, setBusy] = useState(false);

  const replay = useCallback(
    async (chapter: TutorialChapterId, href: string) => {
      setBusy(true);
      await dispatch({ type: 'replay-chapter', chapter });
      router.push(href);
    },
    [dispatch, router],
  );

  const restart = useCallback(async () => {
    setBusy(true);
    await dispatch({ type: 'restart' });
    router.push('/home/overview');
  }, [dispatch, router]);

  // Level does not matter here: anything but "off" or "paused" reads as on.
  const phase = getTutorialPhase(state, { level: 1 });
  const statusKey =
    state?.status === 'active'
      ? 'active'
      : state?.status === 'snoozed' && phase === 'off'
        ? 'snoozed'
        : 'off';

  return (
    <MainArea title={t('walkthrough.learn.title')}>
      <Stack gap="md">
        <Text c="var(--ot-muted)">{t('walkthrough.learn.subtitle')}</Text>
        <GameCard
          title={t('walkthrough.learn.lessonsTitle')}
          icon={faGraduationCap}
        >
          <Stack gap="sm">
            {ready && (
              <Text size="sm" c="var(--ot-muted)" role="status">
                {t(`walkthrough.learn.status.${statusKey}`)}
              </Text>
            )}
            <Stack
              component="ul"
              gap="xs"
              m={0}
              p={0}
              style={{ listStyle: 'none' }}
            >
              {TUTORIAL_CHAPTER_LIST.map((chapter) => {
                const seen = Boolean(state?.chapters.includes(chapter.id));
                return (
                  <li key={chapter.id}>
                    <Group justify="space-between" wrap="nowrap" gap="md">
                      <div>
                        <Group gap="xs">
                          <Text fw={600}>
                            {t(`walkthrough.learn.lessons.${chapter.id}.title`)}
                          </Text>
                          <Badge
                            size="xs"
                            variant={seen ? 'light' : 'outline'}
                            color={seen ? 'teal' : 'gray'}
                          >
                            {seen
                              ? t('walkthrough.learn.seen')
                              : t('walkthrough.learn.unseen')}
                          </Badge>
                        </Group>
                        <Text size="sm" c="var(--ot-muted)">
                          {t(`walkthrough.learn.lessons.${chapter.id}.summary`)}
                        </Text>
                      </div>
                      <Button
                        variant="default"
                        disabled={busy || !ready}
                        onClick={() => replay(chapter.id, chapter.href)}
                      >
                        {t('walkthrough.learn.replay')}
                      </Button>
                    </Group>
                  </li>
                );
              })}
            </Stack>
            <Group justify="flex-end">
              <Button
                variant="subtle"
                disabled={busy || !ready}
                onClick={restart}
              >
                {t('walkthrough.learn.restart')}
              </Button>
            </Group>
          </Stack>
        </GameCard>
        <GameCard title={t('walkthrough.learn.guidesTitle')} icon={faBookOpen}>
          <Stack gap="xs">
            {GUIDES.map((guide) => (
              <Group key={guide.key} justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={600}>
                    {t(`walkthrough.learn.guides.${guide.key}.title`)}
                  </Text>
                  <Text size="sm" c="var(--ot-muted)">
                    {t(`walkthrough.learn.guides.${guide.key}.summary`)}
                  </Text>
                </div>
                <Button
                  component={Link}
                  href={guide.href}
                  variant="default"
                  size="compact-md"
                >
                  {t('walkthrough.learn.open')}
                </Button>
              </Group>
            ))}
          </Stack>
        </GameCard>
      </Stack>
    </MainArea>
  );
};

export default Learn;
