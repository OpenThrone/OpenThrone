import { faEllipsisVertical } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Portal,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useUser } from '@/context/users';
import { useImpersonation } from '@/hooks/useImpersonation';
import { useTutorialState } from '@/hooks/useTutorialState';
import { toLocale } from '@/utils/numberFormatting';
import {
  TRAINING_PRESET_EVENT,
  TRAINING_PRESET_IDS,
  TRAINING_TRAIN_EVENT,
  type TrainingPresetId,
  type TrainingTrainDetail,
} from '@/utils/trainingPresets';
import { getTutorialPhase } from '@/utils/tutorialState';

import {
  findChapterForRoute,
  type StepAction,
  type TutorialChapter,
} from './walkthrough/chapters';
import {
  type HighlightRect,
  isInsideViewport,
  toHighlightRect,
  VIEWPORT_MARGIN,
} from './walkthrough/spotlight';

const CALLOUT_ESTIMATED_HEIGHT = 280;
const Z_INDEX = 9000;

/** Outlines the first selector that is actually on screen (hidden ones are skipped). */
const getTargetRect = (selectors: readonly string[]): HighlightRect | null => {
  for (const selector of selectors) {
    // The same target can exist in several layouts (desktop and mobile
    // sidebars); take the one that is actually on screen.
    const element = [...document.querySelectorAll<HTMLElement>(selector)].find(
      (candidate) => {
        const box = candidate.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      },
    );
    if (!element) continue;
    let rect = element.getBoundingClientRect();
    // Pull the target into view whenever any part of it is hidden. Sections
    // taller than the viewport are aligned to their top so the highlight shows
    // their start; `block: 'start'` is a no-op once there, so this cannot loop.
    const fitsViewport =
      rect.height <= window.innerHeight - VIEWPORT_MARGIN * 2 &&
      rect.width <= window.innerWidth - VIEWPORT_MARGIN * 2;
    if (!isInsideViewport(rect)) {
      element.scrollIntoView({
        block: fitsViewport ? 'center' : 'start',
        inline: 'nearest',
      });
      rect = element.getBoundingClientRect();
    }
    return toHighlightRect(rect);
  }
  return null;
};

const getCalloutWidth = () => Math.min(420, window.innerWidth - 32);

/**
 * Page-by-page guide for new players. Each page has a short chapter that plays
 * when the player arrives, then points at the next page worth seeing. Progress
 * is saved on the account (see `useTutorialState`), and every callout can be
 * paused for a day, skipped for this page, or switched off for good.
 */
export default function NewPlayerWalkthrough() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { user, loading } = useUser();
  const { isImpersonating } = useImpersonation();
  const { state, ready, dispatch } = useTutorialState();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [preset, setPreset] = useState<TrainingPresetId | null>(null);
  const [training, setTraining] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const pendingComplete = useRef<TutorialChapter['id'] | null>(null);
  const shownChapter = useRef<TutorialChapter['id'] | undefined>(undefined);

  const isStaffArea = router.pathname.startsWith('/home/admin');
  const canShow =
    ready && !loading && Boolean(user) && !isImpersonating && !isStaffArea;
  const phase = canShow
    ? getTutorialPhase(state, { level: user?.level ?? 1 })
    : 'off';

  const routeChapter = findChapterForRoute(router.pathname);
  const chapter =
    phase === 'run' &&
    routeChapter &&
    !state?.chapters.includes(routeChapter.id)
      ? routeChapter
      : undefined;
  const isProtected = Boolean(user?.protection?.protected);
  const steps = (chapter?.steps ?? []).filter(
    (candidate) => candidate.requires !== 'protected' || isProtected,
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLastStep = Boolean(chapter && stepIndex >= steps.length - 1);

  // Restart from the first step whenever a different chapter takes over, and
  // save the chapter the player just left if they saw it through.
  useEffect(() => {
    const previous = shownChapter.current;
    if (previous === chapter?.id) return;
    if (previous && pendingComplete.current === previous) {
      pendingComplete.current = null;
      dispatch({ type: 'complete-chapter', chapter: previous });
    }
    shownChapter.current = chapter?.id;
    setStepIndex(0);
    setPreset(null);
  }, [chapter?.id, dispatch]);

  useEffect(() => {
    if (chapter && isLastStep) pendingComplete.current = chapter.id;
  }, [chapter, isLastStep]);

  useEffect(() => {
    if (!step?.targets) {
      setTargetRect(null);
      return undefined;
    }
    const { targets } = step;
    let frame = 0;
    let retryTimeout: number | undefined;
    let attempts = 0;

    const updateTarget = () => {
      const nextRect = getTargetRect(targets);
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
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    return () => {
      window.cancelAnimationFrame(frame);
      if (retryTimeout) window.clearTimeout(retryTimeout);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [step]);

  // Keyboard users land on the main button of each new step.
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [chapter?.id, stepIndex]);

  const completeChapter = useCallback(() => {
    if (!chapter) return;
    pendingComplete.current = null;
    dispatch({ type: 'complete-chapter', chapter: chapter.id });
  }, [chapter, dispatch]);

  const next = useCallback(() => {
    if (!chapter) return;
    if (isLastStep) {
      completeChapter();
      return;
    }
    setStepIndex((current) => current + 1);
  }, [chapter, completeChapter, isLastStep]);

  const back = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  const follow = useCallback(
    (action: StepAction) => {
      completeChapter();
      router.push(action.href);
    },
    [completeChapter, router],
  );

  const choosePreset = useCallback((id: TrainingPresetId) => {
    setPreset(id);
    window.dispatchEvent(
      new CustomEvent(TRAINING_PRESET_EVENT, { detail: { preset: id } }),
    );
  }, []);

  // Trains the order the chosen plan filled in, and only moves on once the
  // Training page confirms it went through (it shows its own errors otherwise).
  const trainAndContinue = useCallback(() => {
    setTraining(true);
    window.dispatchEvent(
      new CustomEvent<TrainingTrainDetail>(TRAINING_TRAIN_EVENT, {
        detail: {
          done: (trained) => {
            setTraining(false);
            if (trained) next();
          },
        },
      }),
    );
  }, [next]);

  const startTour = useCallback(() => {
    dispatch({ type: 'start' });
    const here = findChapterForRoute(router.pathname);
    if (!here) router.push('/home/overview');
  }, [dispatch, router]);

  const snooze = useCallback(() => dispatch({ type: 'snooze' }), [dispatch]);
  const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), [dispatch]);

  if (phase === 'off') return null;

  const offerOpen = phase === 'offer';
  const returning = state?.status === 'snoozed';

  const calloutWidth = chapter ? getCalloutWidth() : 420;
  const calloutLeft = 16;
  // Prefer below the highlight, flip above it when the viewport is too short,
  // so the callout never sits on top of the section it is describing.
  const calloutTop = (() => {
    if (!targetRect) return undefined;
    const below = targetRect.top + targetRect.height + 14;
    if (below + CALLOUT_ESTIMATED_HEIGHT <= window.innerHeight) return below;
    return Math.max(16, targetRect.top - CALLOUT_ESTIMATED_HEIGHT - 14);
  })();

  // Fills the protection step with this player's own limits.
  const protection = user?.protection;
  const textParams = {
    days: Math.max(
      1,
      Math.ceil(protection?.daysLeft ?? protection?.durationDays ?? 1),
    ),
    levelLimit: protection?.levelLimit ?? 10,
    population: toLocale(
      protection?.populationThreshold ?? 0,
      user?.locale ?? 'en-US',
    ),
  };
  const textKey =
    chapter && step ? `walkthrough.chapters.${chapter.id}.${step.id}` : '';
  const primaryAction = step?.actions?.find((action) => action.primary);
  const otherActions = step?.actions?.filter((action) => !action.primary) ?? [];

  return (
    <>
      <Modal
        opened={offerOpen}
        onClose={snooze}
        centered
        size="lg"
        zIndex={Z_INDEX}
        withCloseButton={false}
        closeOnClickOutside={false}
        overlayProps={{ backgroundOpacity: 0.7, blur: 3 }}
        title={
          returning
            ? t('walkthrough.offer.returningTitle')
            : t('walkthrough.offer.title')
        }
      >
        <Stack gap="md">
          <Text c="var(--ot-muted)">
            {returning
              ? t('walkthrough.offer.returningBody')
              : t('walkthrough.offer.body')}
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={dismiss}>
              {t('walkthrough.options.dismiss')}
            </Button>
            <Button variant="default" onClick={snooze}>
              {t('walkthrough.options.snooze')}
            </Button>
            <Button onClick={startTour} data-autofocus>
              {t('walkthrough.start')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {chapter && step && (
        <Portal>
          <div
            className="pointer-events-none fixed inset-0"
            style={{ zIndex: Z_INDEX }}
          >
            {targetRect ? (
              <div
                className="absolute rounded-md border-2"
                style={{
                  ...targetRect,
                  borderColor: 'var(--ot-accent)',
                  boxShadow:
                    '0 0 0 9999px color-mix(in srgb, var(--ot-inset) 58%, transparent), 0 0 28px color-mix(in srgb, var(--ot-accent) 75%, transparent)',
                }}
              />
            ) : (
              <div
                className="absolute inset-0 backdrop-blur-[1px]"
                style={{
                  backgroundColor:
                    'color-mix(in srgb, var(--ot-inset) 65%, transparent)',
                }}
              />
            )}
            <Paper
              className="pointer-events-auto fixed max-w-[calc(100vw-2rem)] border border-[var(--ot-border)] p-4"
              radius="sm"
              role="dialog"
              aria-live="polite"
              aria-label={t(`${textKey}.title`)}
              style={{
                left: calloutLeft,
                top: calloutTop ?? '22vh',
                width: calloutWidth,
                backgroundColor: 'var(--ot-surface)',
                boxShadow: 'var(--ot-shadow)',
              }}
            >
              <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Title
                    order={3}
                    fw={400}
                    // Mantine headings default to the blackletter display
                    // face, which is hard to read at callout size.
                    style={{
                      fontFamily: 'MedievalSharp, cursive',
                      fontSize: '1.2rem',
                      letterSpacing: '0.02em',
                      color: 'var(--ot-text)',
                    }}
                  >
                    {t(`${textKey}.title`, textParams)}
                  </Title>
                  <Menu
                    position="bottom-end"
                    zIndex={Z_INDEX + 100}
                    withinPortal
                  >
                    <Menu.Target>
                      <ActionIcon
                        aria-label={t('walkthrough.options.label')}
                        variant="subtle"
                        c="var(--ot-muted)"
                      >
                        <FontAwesomeIcon icon={faEllipsisVertical} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={completeChapter}>
                        {t('walkthrough.options.skipPage')}
                      </Menu.Item>
                      <Menu.Item onClick={snooze}>
                        {t('walkthrough.options.snooze')}
                      </Menu.Item>
                      <Menu.Item color="red" onClick={dismiss}>
                        {t('walkthrough.options.dismiss')}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
                <Progress
                  value={((stepIndex + 1) / steps.length) * 100}
                  color="var(--ot-accent)"
                  size="xs"
                  aria-label={t('walkthrough.progress', {
                    current: stepIndex + 1,
                    total: steps.length,
                  })}
                />
                <Text size="sm" c="var(--ot-body)">
                  {t(`${textKey}.body`, textParams)}
                </Text>
                {step.kind === 'strategy' && (
                  <Stack
                    gap="xs"
                    role="group"
                    aria-label={t('walkthrough.strategy.label')}
                  >
                    {TRAINING_PRESET_IDS.map((id) => (
                      <Button
                        key={id}
                        variant={preset === id ? 'filled' : 'default'}
                        justify="flex-start"
                        h="auto"
                        py="xs"
                        aria-pressed={preset === id}
                        onClick={() => choosePreset(id)}
                      >
                        <Stack gap={0} align="flex-start">
                          <Text size="sm" fw={600} inherit>
                            {t(`walkthrough.strategy.${id}.title`)}
                          </Text>
                          <Text
                            size="xs"
                            fw={400}
                            inherit
                            style={{ opacity: 0.85 }}
                          >
                            {t(`walkthrough.strategy.${id}.body`)}
                          </Text>
                        </Stack>
                      </Button>
                    ))}
                    {preset && (
                      <Text size="xs" c="var(--ot-muted)">
                        {t('walkthrough.strategy.filled')}
                      </Text>
                    )}
                  </Stack>
                )}
                <Group justify="space-between" mt="xs">
                  <Button
                    variant="subtle"
                    onClick={back}
                    disabled={stepIndex === 0}
                  >
                    {t('walkthrough.back')}
                  </Button>
                  <Group gap="xs" justify="flex-end">
                    {step.kind === 'strategy' ? (
                      <>
                        <Button
                          ref={preset ? undefined : primaryRef}
                          variant={preset ? 'default' : 'filled'}
                          onClick={next}
                          disabled={training}
                        >
                          {t('walkthrough.skip')}
                        </Button>
                        {preset && (
                          <Button
                            ref={primaryRef}
                            onClick={trainAndContinue}
                            loading={training}
                          >
                            {t('walkthrough.strategy.train')}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        {otherActions.map((action) => (
                          <Button
                            key={action.href}
                            variant="default"
                            onClick={() => follow(action)}
                          >
                            {t(`walkthrough.actions.${action.label}`)}
                          </Button>
                        ))}
                        {primaryAction ? (
                          <>
                            <Button variant="default" onClick={next}>
                              {t('walkthrough.notNow')}
                            </Button>
                            <Button
                              ref={primaryRef}
                              onClick={() => follow(primaryAction)}
                            >
                              {t(`walkthrough.actions.${primaryAction.label}`)}
                            </Button>
                          </>
                        ) : (
                          <Button ref={primaryRef} onClick={next}>
                            {isLastStep
                              ? t('walkthrough.finish')
                              : t('walkthrough.next')}
                          </Button>
                        )}
                      </>
                    )}
                  </Group>
                </Group>
              </Stack>
            </Paper>
          </div>
        </Portal>
      )}
    </>
  );
}
