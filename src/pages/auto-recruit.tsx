import { faUsers } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Center, Flex, Space, Stack, Text } from '@mantine/core';
import { Turnstile } from '@marsidev/react-turnstile';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useRef, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { PageLoading } from '@/components/game/PageLoading';
import MainArea from '@/components/MainArea';
import SessionModal from '@/components/SessionModal';
import { AUTO_RECRUIT_ENABLED } from '@/constants/AutoRecruit';
import { useUser } from '@/context/users';
import { useSupporterStatus } from '@/hooks/useSupporterStatus';
import { alertService } from '@/services/Alert.service';
import type { UserApiResponse } from '@/types/typings';
import {
  completionReasonKey,
  recruitmentOutcome,
} from '@/utils/autoRecruitFlow';
import { logError } from '@/utils/logger';

import Recruiter from '../components/recruiter';

function AutoRecruiter() {
  const { t } = useTranslation('community');
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  const [user, setUser] = useState<Partial<UserApiResponse> | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [totalLeft, setTotalLeft] = useState(0);
  const { forceUpdate, user: viewer } = useUser();
  const [sessionModalOpened, setSessionModalOpened] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [sessionCaptcha, setSessionCaptcha] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [isResumingSession, setIsResumingSession] = useState(false);
  const [isCountdown, setIsCountdown] = useState(false);
  const [recruitStatus, setRecruitStatus] = useState('');
  const [completionMessage, setCompletionMessage] = useState('');
  const sessionIdRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(false);
  const fetchRef = useRef(false);
  const attemptedRef = useRef<number | null>(null);
  const previousRef = useRef<number | undefined>(undefined);
  const skipsRef = useRef(0);
  const generationRef = useRef(0);
  const fetchNextRef = useRef<() => void>(() => {});

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      clearTimer();
    };
  }, []);

  const stopRecruiting = async (endSession = false, message = '') => {
    if (isStoppingSession) return;
    pausedRef.current = true;
    setIsPaused(true);
    clearTimer();
    setIsCountdown(false);
    if (!endSession) return;
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    generationRef.current += 1;
    setHasEnded(true);
    setCompletionMessage(message);
    setIsStoppingSession(true);
    if (id !== null) {
      try {
        const response = await fetch('/api/recruit/endSession', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id }),
        });
        if (!response.ok)
          logError('Error ending recruitment session:', response.status);
        forceUpdate();
      } catch (error) {
        logError('Error ending recruitment session:', error);
        alertService.error(
          t('autoRecruit.failedToCleanlyEndServerSession'),
          false,
        );
      }
    }
    if (mountedRef.current) setIsStoppingSession(false);
  };

  const fetchRandomUser = async () => {
    if (fetchRef.current || pausedRef.current || sessionIdRef.current === null)
      return;
    fetchRef.current = true;
    const generation = generationRef.current;
    try {
      const response = await fetch('/api/recruit/getRandomUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          excludeUserId: previousRef.current,
        }),
      });
      const data = await response.json();
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (response.ok) {
        setTotalLeft(data.recruitsLeft);
        if (pausedRef.current) return;
        attemptedRef.current = null;
        setRecruitStatus('');
        setUser(data.randomUser);
      } else if (recruitmentOutcome(data.code || data.error) === 'complete') {
        setTotalLeft(0);
        stopRecruiting(true, t(completionReasonKey(data.code)));
      } else {
        logError('Error fetching new user:', data.error);
        alertService.error(
          data.error === 'Invalid session ID'
            ? t('autoRecruit.sessionInvalid')
            : t('autoRecruit.errorFetchingNewUser'),
          false,
        );
        stopRecruiting(true);
      }
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      logError('Caught Network Error fetching user:', error);
      alertService.error(t('autoRecruit.networkErrorDuringRecruitment'), false);
      stopRecruiting(true);
    } finally {
      if (generation === generationRef.current) fetchRef.current = false;
    }
  };
  fetchNextRef.current = () => {
    fetchRandomUser();
  };

  const startCountdown = () => {
    clearTimer();
    if (pausedRef.current || sessionIdRef.current === null) return;
    setIsCountdown(true);
    setCountdown(3);
    let remaining = 3;
    const tick = () => {
      if (pausedRef.current || sessionIdRef.current === null) return;
      remaining -= 1;
      setCountdown(remaining);
      if (remaining === 0) {
        setIsCountdown(false);
        setUser(null);
        fetchNextRef.current();
      } else timerRef.current = setTimeout(tick, 1000);
    };
    timerRef.current = setTimeout(tick, 1000);
  };

  const handleRecruitment = async (captchaToken?: string) => {
    const id = user?.id;
    if (
      !id ||
      requestRef.current ||
      attemptedRef.current === id ||
      pausedRef.current ||
      sessionIdRef.current === null
    )
      return;
    requestRef.current = true;
    attemptedRef.current = id;
    const generation = generationRef.current;
    try {
      const response = await fetch('/api/recruit/handleRecruitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recruitedUserId: id,
          selfRecruit: false,
          sessionId: sessionIdRef.current,
          captchaToken,
        }),
      });
      const data = await response.json();
      if (!mountedRef.current || generation !== generationRef.current) return;
      previousRef.current = id;
      if (
        recruitmentOutcome(response.ok ? 'SUCCESS' : data.code) === 'advance'
      ) {
        skipsRef.current = 0;
        setConsecutiveSuccesses((prev) => prev + 1);
        if (typeof data.recruitsLeft === 'number')
          setTotalLeft(data.recruitsLeft);
        forceUpdate();
        setRecruitStatus('success');
        if (data.recruitsLeft === 0) {
          if (!pausedRef.current)
            timerRef.current = setTimeout(() => {
              stopRecruiting(true, t(completionReasonKey()));
            }, 1500);
        } else if (!pausedRef.current) {
          timerRef.current = setTimeout(startCountdown, 1500);
        }
      } else {
        const outcome = recruitmentOutcome(data.code);
        if (outcome === 'skip') {
          skipsRef.current += 1;
          if (skipsRef.current >= 5)
            stopRecruiting(true, t('autoRecruit.tooManySkips'));
          else if (!pausedRef.current) startCountdown();
        } else if (outcome === 'complete') {
          setTotalLeft(0);
          stopRecruiting(true, t(completionReasonKey(data.code)));
        } else {
          logError('Error handling recruitment:', data.error);
          alertService.error(
            data.error || t('autoRecruit.errorHandlingRecruitment'),
            false,
          );
          stopRecruiting(true);
        }
      }
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      logError('Error handling recruitment:', error);
      alertService.error(t('autoRecruit.networkErrorDuringRecruitment'), false);
      stopRecruiting(true);
    } finally {
      if (generation === generationRef.current) requestRef.current = false;
    }
  };

  const resumeRecruiting = async () => {
    if (isResumingSession || sessionIdRef.current === null) return;
    setIsResumingSession(true);
    try {
      const response = await fetch('/api/recruit/verifySession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      const data = await response.json();
      if (response.ok && data.valid) {
        pausedRef.current = false;
        setIsPaused(false);
        if (!requestRef.current) {
          setUser(null);
          fetchNextRef.current();
        }
      } else {
        alertService.error(t('autoRecruit.sessionInvalid'), false);
        stopRecruiting(true);
      }
    } catch (error) {
      logError('Error verifying session:', error);
      alertService.error(t('autoRecruit.errorVerifyingSession'), false);
    } finally {
      setIsResumingSession(false);
    }
  };

  /** Turnstile is checked once when a session starts; recruits inside it reuse that check. */
  const startRecruiting = async (captchaToken?: string) => {
    if (isStartingSession) return;
    setIsStartingSession(true);
    try {
      const response = await fetch('/api/recruit/startSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(captchaToken ? { captchaToken } : {}),
      });
      const data = await response.json();
      if (data.code === 'CAPTCHA_REQUIRED' || data.code === 'CAPTCHA_FAILED') {
        if (data.code === 'CAPTCHA_FAILED')
          alertService.error(t('autoRecruit.verificationFailed'), false);
        setSessionCaptcha(true);
        setCaptchaKey((key) => key + 1);
        return;
      }
      if (!response.ok || !data.sessionId)
        throw new Error(data.error || 'Failed to start session');
      generationRef.current += 1;
      fetchRef.current = false;
      requestRef.current = false;
      sessionIdRef.current = data.sessionId;
      setSessionCaptcha(false);
      pausedRef.current = false;
      previousRef.current = undefined;
      attemptedRef.current = null;
      skipsRef.current = 0;
      setUser(null);
      setIsRecruiting(true);
      setIsPaused(false);
      setConsecutiveSuccesses(0);
      setHasEnded(false);
      setCompletionMessage('');
      setTotalLeft(viewer?.recruitsLeft ?? 0);
      fetchNextRef.current();
    } catch (error) {
      logError('Error starting recruitment session:', error);
      alertService.error(t('autoRecruit.errorStartingSession'), false);
      // The challenge token is single-use; render a fresh one for the retry.
      setCaptchaKey((key) => key + 1);
    } finally {
      setIsStartingSession(false);
    }
  };

  const startCaptcha = sessionCaptcha ? (
    <Stack align="center" gap="xs">
      <Text size="sm">{t('autoRecruit.verifyToStart')}</Text>
      <Turnstile
        key={captchaKey}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
        onSuccess={(token) => startRecruiting(token)}
        onExpire={() => setCaptchaKey((key) => key + 1)}
        onError={() =>
          alertService.error(t('autoRecruit.verificationFailed'), false)
        }
      />
    </Stack>
  ) : null;

  if (!isRecruiting) {
    return (
      <MainArea
        title={t('autoRecruit.title')}
        icon={<FontAwesomeIcon icon={faUsers} />}
      >
        <Center py="xl">
          <GameCard title={t('autoRecruit.sessionControls')} goldAccent={false}>
            <Stack align="center">
              <Text>{t('autoRecruit.clickStart')}</Text>
              {startCaptcha}
              <Button
                onClick={() => startRecruiting()}
                loading={isStartingSession}
                disabled={sessionCaptcha}
              >
                {t('autoRecruit.startSession')}
              </Button>
              <Button
                variant="default"
                onClick={() => setSessionModalOpened(true)}
                disabled={isStartingSession}
              >
                {t('autoRecruit.manageSessions')}
              </Button>
            </Stack>
          </GameCard>
        </Center>
        <SessionModal
          opened={sessionModalOpened}
          onClose={() => setSessionModalOpened(false)}
        />
      </MainArea>
    );
  }

  if (hasEnded) {
    return (
      <MainArea
        title={t('autoRecruit.title')}
        icon={<FontAwesomeIcon icon={faUsers} />}
      >
        <Center py="xl">
          <GameCard title={t('autoRecruit.sessionComplete')} goldAccent={false}>
            <Stack align="center">
              <Text>{completionMessage || t('autoRecruit.sessionEnded')}</Text>
              <Text>
                {t('autoRecruit.sessionRecruitCount', {
                  count: consecutiveSuccesses,
                })}
              </Text>
              {startCaptcha}
              <Button
                onClick={() => startRecruiting()}
                loading={isStartingSession}
                disabled={sessionCaptcha}
              >
                {t('autoRecruit.startNewSession')}
              </Button>
            </Stack>
          </GameCard>
        </Center>
        <SessionModal
          opened={sessionModalOpened}
          onClose={() => setSessionModalOpened(false)}
        />
      </MainArea>
    );
  }

  return (
    <MainArea
      title={t('autoRecruit.title')}
      icon={<FontAwesomeIcon icon={faUsers} />}
    >
      <GameCard title={t('autoRecruit.recruitmentStatus')} goldAccent={false}>
        <Text size="lg" ta="center">
          {t('autoRecruit.totalDailyRecruitsLeft', { count: totalLeft })}
        </Text>
        <Space h="md" />
        {!user && !isPaused && (
          <Text ta="center">{t('autoRecruit.loadingNextUser')}</Text>
        )}
        {user && !isPaused && (
          <Recruiter
            key={user.id}
            user={user}
            showCaptcha={false}
            onSuccess={handleRecruitment}
            status={
              recruitStatus === 'success'
                ? t('autoRecruit.recruitedSuccessfully', {
                    name: user?.display_name,
                  })
                : t('autoRecruit.recruitingUser', {
                    name: user?.display_name,
                  })
            }
          />
        )}
      </GameCard>
      <Space h="md" />
      <GameCard title={t('autoRecruit.sessionControls')} goldAccent={false}>
        <Flex justify="center" align="center" direction="column" gap="md">
          {!isPaused && isCountdown && countdown > 0 && (
            <Text>
              {t('autoRecruit.loadingNextUserCountdown', { count: countdown })}
            </Text>
          )}
          {isPaused ? (
            <Button
              onClick={resumeRecruiting}
              loading={isResumingSession}
              disabled={isStartingSession || hasEnded}
            >
              {t('autoRecruit.resumeRecruiting')}
            </Button>
          ) : (
            <Button
              onClick={() => stopRecruiting(false)}
              loading={isStoppingSession}
              disabled={isStartingSession || hasEnded}
            >
              {t('autoRecruit.pauseRecruiting')}
            </Button>
          )}
          <Button
            color="red"
            onClick={() => stopRecruiting(true)}
            loading={isStoppingSession}
            disabled={isStartingSession || isResumingSession}
          >
            {t('autoRecruit.endSession')}
          </Button>
        </Flex>
      </GameCard>
      <SessionModal
        opened={sessionModalOpened}
        onClose={() => setSessionModalOpened(false)}
      />
    </MainArea>
  );
}

export default function AutoRecruitPage() {
  const { t } = useTranslation('community');
  // Retired for everyone but active supporters; the API enforces the same rule.
  const { data, error, isLoading } = useSupporterStatus(!AUTO_RECRUIT_ENABLED);
  if (AUTO_RECRUIT_ENABLED || data?.isActive) return <AutoRecruiter />;
  if (isLoading && !error)
    return (
      <MainArea title={t('autoRecruit.title')}>
        <PageLoading />
      </MainArea>
    );
  return (
    <MainArea title={t('autoRecruit.title')}>
      <GameCard title={t('autoRecruit.title')}>
        <Stack gap="sm">
          <Text>
            {t(data ? 'autoRecruit.supporterOnly' : 'autoRecruit.disabled')}
          </Text>
          {data && (
            <Button component={Link} href="/supporter" w="fit-content">
              {t('autoRecruit.becomeSupporter')}
            </Button>
          )}
        </Stack>
      </GameCard>
    </MainArea>
  );
}
