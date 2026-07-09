import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Button,
  Group,
  Paper,
  Portal,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useUser } from '@/context/users';

type WalkthroughStep = {
  readonly key: string;
  readonly path: string;
  readonly target: string;
  readonly title: string;
  readonly body: string;
};

type TargetRect = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

const ACTIVE_KEY = 'openthrone.walkthrough.active';
const COMPLETE_PREFIX = 'openthrone.walkthrough.completed';

const getTargetRect = (selector: string): TargetRect | null => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  let rect = element.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    rect = element.getBoundingClientRect();
  }
  return {
    top: Math.max(8, rect.top - 8),
    left: Math.max(8, rect.left - 8),
    width: rect.width + 16,
    height: rect.height + 16,
  };
};

const getCompletionKey = (userId: number, eraKey: string) =>
  `${COMPLETE_PREFIX}.${userId}.${eraKey}`;

const getCalloutWidth = () => Math.min(420, window.innerWidth - 32);

export default function NewPlayerWalkthrough() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { user, loading } = useUser();
  const [offered, setOffered] = useState(false);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const eraKey = String(
    user?.currentEra?.id ?? user?.currentEra?.name ?? 'current',
  );
  const completionKey = user?.id ? getCompletionKey(user.id, eraKey) : null;

  const steps = useMemo<readonly WalkthroughStep[]>(
    () => [
      {
        key: 'overview-menu',
        path: '/home/overview',
        target: '[data-tour-id="primary-nav"]',
        title: t('walkthrough.menu.title', 'The command menu'),
        body: t(
          'walkthrough.menu.body',
          'Use this bar to move between Home, Battle, Structures, Alliances, and the wider realm.',
        ),
      },
      {
        key: 'overview-sidebar',
        path: '/home/overview',
        target: '[data-tour-id="sidebar"]',
        title: t('walkthrough.sidebar.title', 'Your kingdom ledger'),
        body: t(
          'walkthrough.sidebar.body',
          'The sidebar keeps gold, citizens, level, turns, the advisor, player search, and the turn timer close at hand.',
        ),
      },
      {
        key: 'overview-stats',
        path: '/home/overview',
        target: '[data-tour-id="overview-stats"]',
        title: t('walkthrough.overview.title', 'Read the realm at a glance'),
        body: t(
          'walkthrough.overview.body',
          'Overview is the pulse check: wealth, population, army size, banked gold, and progress toward the next level.',
        ),
      },
      {
        key: 'training',
        path: '/battle/training',
        target: '[data-tour-id="training-panel"]',
        title: t('walkthrough.training.title', 'Train citizens with intent'),
        body: t(
          'walkthrough.training.body',
          'Workers create gold, offensive units win attacks, defensive units protect your people, and spy roles control information.',
        ),
      },
      {
        key: 'armory',
        path: '/structures/armory/offense',
        target: '[data-tour-id="armory-panel"]',
        title: t('walkthrough.armory.title', 'Equip before you march'),
        body: t(
          'walkthrough.armory.body',
          'The Armory turns trained units into real power. Buy offense to hit harder and defense to hold your ground.',
        ),
      },
      {
        key: 'bank',
        path: '/structures/bank/deposit',
        target: '[data-tour-id="bank-panel"]',
        title: t('walkthrough.bank.title', 'Bank what you cannot defend'),
        body: t(
          'walkthrough.bank.body',
          'Gold in hand is useful but exposed. Deposits protect wealth while workers and structures keep income moving.',
        ),
      },
      {
        key: 'attack',
        path: '/battle/users',
        target: '[data-tour-id="main-area"]',
        title: t('walkthrough.attack.title', 'Choose your first target'),
        body: t(
          'walkthrough.attack.body',
          'You are ready to scout the battlefield. Compare levels, gold, and risk before spending attack turns.',
        ),
      },
    ],
    [t],
  );

  const currentStep = steps[stepIndex];
  const isReadyForOffer = Boolean(user?.id && !loading && completionKey);

  useEffect(() => {
    if (!isReadyForOffer || !completionKey) return;
    if (localStorage.getItem(completionKey) === '1') return;
    if (sessionStorage.getItem(ACTIVE_KEY) === '1') {
      setActive(true);
      return;
    }
    setOffered(true);
  }, [completionKey, isReadyForOffer]);

  useEffect(() => {
    if (!active || !currentStep) return;
    if (router.asPath.split('?')[0] !== currentStep.path) {
      router.push(currentStep.path);
    }
  }, [active, currentStep, router]);

  useEffect(() => {
    if (!active || !currentStep) return undefined;

    let frame = 0;
    let retryTimeout: number | undefined;
    let attempts = 0;

    const updateTarget = () => {
      const nextRect = getTargetRect(currentStep.target);
      setTargetRect(nextRect);

      if (!nextRect && attempts < 20) {
        attempts += 1;
        retryTimeout = window.setTimeout(updateTarget, 100);
      }
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      if (retryTimeout) window.clearTimeout(retryTimeout);
      attempts = 0;
      frame = window.requestAnimationFrame(updateTarget);
    };

    setTargetRect(null);
    scheduleUpdate();
    router.events.on('routeChangeComplete', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    return () => {
      window.cancelAnimationFrame(frame);
      if (retryTimeout) window.clearTimeout(retryTimeout);
      router.events.off('routeChangeComplete', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [active, currentStep, router.events]);

  const finish = useCallback(() => {
    if (completionKey) localStorage.setItem(completionKey, '1');
    sessionStorage.removeItem(ACTIVE_KEY);
    setActive(false);
    setOffered(false);
    setStepIndex(0);
  }, [completionKey]);

  const start = useCallback(() => {
    sessionStorage.setItem(ACTIVE_KEY, '1');
    setOffered(false);
    setActive(true);
    setStepIndex(0);
  }, []);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((current) => current + 1);
  }, [finish, stepIndex, steps.length]);

  const back = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  if (!currentStep || (!offered && !active)) return null;

  const progressValue = active ? ((stepIndex + 1) / steps.length) * 100 : 0;
  const calloutWidth = active ? getCalloutWidth() : 420;
  const preferredLeft = 16;
  const calloutLeft = Math.min(
    Math.max(16, preferredLeft),
    window.innerWidth - calloutWidth - 16,
  );
  const calloutTop = targetRect
    ? Math.min(
        Math.max(16, targetRect.top + targetRect.height + 14),
        window.innerHeight - 260,
      )
    : undefined;

  return (
    <Portal>
      {offered && (
        <div className="fixed inset-0 z-[9000] bg-black/70 px-4 backdrop-blur-sm">
          <Paper
            className="mx-auto mt-[18vh] max-w-xl border border-[var(--ot-border)] bg-black/90 p-5 shadow-2xl"
            radius="sm"
            role="dialog"
            aria-modal="true"
          >
            <Stack gap="md">
              <Title order={2} className="font-medieval text-[var(--ot-text)]">
                {t('walkthrough.offer.title', 'Take the first-turn tour?')}
              </Title>
              <Text c="gray.2">
                {t(
                  'walkthrough.offer.body',
                  'A short optional walkthrough will point out the menu, advisor, stats, Training, Armory, Bank, and leave you on Attack.',
                )}
              </Text>
              <Group justify="flex-end">
                <Button variant="subtle" color="gray" onClick={finish}>
                  {t('walkthrough.skip', 'Skip')}
                </Button>
                <Button color="yellow" onClick={start}>
                  {t('walkthrough.start', 'Start tour')}
                </Button>
              </Group>
            </Stack>
          </Paper>
        </div>
      )}

      {active && (
        <div className="pointer-events-none fixed inset-0 z-[9000]">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-[1px]" />
          {targetRect && (
            <div
              className="absolute rounded-md border-2 border-yellow-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.58),0_0_28px_rgba(250,204,21,0.75)]"
              style={targetRect}
            />
          )}
          <Paper
            className="pointer-events-auto fixed max-w-[calc(100vw-2rem)] border border-[var(--ot-border)] bg-black/95 p-4 shadow-2xl"
            radius="sm"
            role="dialog"
            aria-live="polite"
            style={{
              left: calloutLeft,
              top: calloutTop ?? '22vh',
              width: calloutWidth,
            }}
          >
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap">
                <Title
                  order={3}
                  className="font-medieval text-[var(--ot-text)]"
                >
                  {currentStep.title}
                </Title>
                <ActionIcon
                  aria-label={t('walkthrough.close', 'Close walkthrough')}
                  variant="subtle"
                  color="gray"
                  onClick={finish}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </ActionIcon>
              </Group>
              <Progress value={progressValue} color="yellow" size="xs" />
              <Text size="sm" c="gray.2">
                {currentStep.body}
              </Text>
              <Group justify="space-between" mt="xs">
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={back}
                  disabled={stepIndex === 0}
                >
                  {t('walkthrough.back', 'Back')}
                </Button>
                <Group gap="xs">
                  <Button variant="subtle" color="gray" onClick={finish}>
                    {t('walkthrough.skip', 'Skip')}
                  </Button>
                  <Button color="yellow" onClick={next}>
                    {stepIndex === steps.length - 1
                      ? t('walkthrough.finish', 'Finish')
                      : t('walkthrough.next', 'Next')}
                  </Button>
                </Group>
              </Group>
            </Stack>
          </Paper>
        </div>
      )}
    </Portal>
  );
}
