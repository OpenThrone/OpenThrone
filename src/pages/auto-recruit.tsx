// src/pages/auto-recruit.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { Button, Center, Flex, Space, Stack, Text } from '@mantine/core';

import { GameCard } from '@/components/game/GameCard';
import SessionModal from '@/components/SessionModal';
import { alertService } from '@/services/Alert.service';
import type { UserApiResponse } from '@/types/typings';
import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';
import Recruiter from '../components/recruiter';
import MainArea from '@/components/MainArea';

/**
 * Page component for Auto Recruiter feature.
 * Allows users to start, pause, resume, and stop automated recruitment sessions.
 * Fetches random users, handles recruitment attempts, and manages session state.
 */
export default function AutoRecruiter(props) {
  const { t } = useTranslation('community');
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  const [user, setUser] = useState<Partial<UserApiResponse> | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastSuccess, setLastSuccess] = useState(false);
  const [totalLeft, setTotalLeft] = useState(0);
  const { forceUpdate, user: viewer } = useUser();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const isPausedRef = useRef(isPaused);
  const [sessionModalOpened, setSessionModalOpened] = useState(false);
  const [isFetchingUser, setIsFetchingUser] = useState(false);
  const [isHandlingRecruitment, setIsHandlingRecruitment] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [isResumingSession, setIsResumingSession] = useState(false);
  const [isCountdown, setIsCountdown] = useState(false);
  const [recruitStatus, setRecruitStatus] = useState('');
  const [friendIds, setFriendIds] = useState<Set<number>>(new Set());
  const [enemyIds, setEnemyIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const handleInvalidSession = useCallback(() => {
    setSessionId(null);
    sessionIdRef.current = null;
    setIsRecruiting(false);
    setIsPaused(false);
    setHasEnded(true);
    setUser(null);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    alertService.error(t('autoRecruit.sessionInvalid'), false);
  }, [t]);

  const stopRecruiting = useCallback(async (endSession = false) => {
    if (isStoppingSession) return;
    setIsStoppingSession(true);
    setIsPaused(true);
    setIsHandlingRecruitment(false);
    setIsFetchingUser(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(0);

    if (endSession) {
      setSessionId(null);
      sessionIdRef.current = null;
      try {
        const response = await fetch('/api/recruit/endSession', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        });
        const data = await response.json();
        if (response.ok) {
          alertService.success(t('autoRecruit.sessionEnded'));
          forceUpdate();
        } else {
          logError('Error ending recruitment session:', data.error);
        }
      } catch (error) {
        logError('Error ending recruitment session:', error);
        alertService.error(t('autoRecruit.failedToCleanlyEndServerSession'), false);
      }
    }
    setIsStoppingSession(false);
  }, [isStoppingSession, forceUpdate, t]);

  const fetchRandomUser = useCallback(async () => {
    if (isFetchingUser || isPausedRef.current || !sessionIdRef.current) {
      if (!sessionIdRef.current) logError('No session ID for fetchRandomUser', sessionIdRef.current);
      if (isPausedRef.current) console.log('Recruiting is paused. Aborting fetchRandomUser.');
      return;
    }
    setIsFetchingUser(true);
    try {
      const response = await fetch('/api/recruit/getRandomUser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      const data = await response.json();

      if (response.ok) {
        setUser(data.randomUser);
        setTotalLeft(data.recruitsLeft);
        if (data.recruitsLeft === 0) {
          setHasEnded(true);
          setIsPaused(true);
          alertService.info(t('autoRecruit.noMoreRecruits'));
          stopRecruiting(true);
        }
      } else {
        // Check for specific error codes first
        if (data.error === 'Invalid session ID') {
          handleInvalidSession();
        } else if (data.error === 'NO_RECRUITABLE_USERS_FOUND') {
          alertService.info(t('autoRecruit.noRecruitableUsers'));
          stopRecruiting(true);
        } else {
          setHasEnded(true);
          setIsPaused(true);
          alertService.error(data.error || t('autoRecruit.errorFetchingNewUser'), false);
          logError('Error fetching new user:', data.error || 'Unknown API error');
        }
      }
    } catch (error) {
      setHasEnded(true);
      setIsPaused(true);
      alertService.error(t('autoRecruit.networkErrorDuringRecruitment'), false);
      logError('Caught Network Error fetching user:', error);
    } finally {
      setIsFetchingUser(false);
    }
  }, [isFetchingUser, stopRecruiting, handleInvalidSession, t]);

  const startCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(3);
    setIsCountdown(true);
    setUser(null);

    let timer = 3;
    intervalRef.current = setInterval(async () => {
      timer -= 1;
      setCountdown(timer);

      if (timer <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsCountdown(false);
        setRecruitStatus(t('autoRecruit.recruiting'));
        if (sessionIdRef.current && !isPausedRef.current) {
          await fetchRandomUser();
        }
        setLastSuccess(false);
      }
    }, 1000);
  }, [fetchRandomUser, t]);

  const handleRecruitment = useCallback(async () => {
    if (isHandlingRecruitment || !user || !sessionIdRef.current) {
      if (!user) logError('handleRecruitment called without user');
      if (!sessionIdRef.current) logError('handleRecruitment called without session ID');
      return;
    }
    setIsHandlingRecruitment(true);
    try {
      const response = await fetch('/api/recruit/handleRecruitment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recruitedUserId: user.id,
          selfRecruit: false,
          sessionId: sessionIdRef.current,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setLastSuccess(true);
        setConsecutiveSuccesses((prev) => prev + 1);
        if (viewer) {
          forceUpdate();
        }
        setTotalLeft(prev => prev > 0 ? prev - 1 : 0);

        if (totalLeft - 1 <= 0) {
          stopRecruiting(true);
          alertService.success(t('autoRecruit.recruitedSuccessfully', { name: user?.display_name }));
          setTimeout(() => {
            setRecruitStatus(t('autoRecruit.recruiting'));
            setIsCountdown(true);
            setUser(null);
            startCountdown();
          }, 1000);
        }
      } else {
        setLastSuccess(false);
        if (data.error === 'Invalid session ID') {
          handleInvalidSession();
        } else {
          logError('Error handling recruitment:', data.error);
          alertService.error(data.error || t('autoRecruit.errorHandlingRecruitment'), false);
        }
      }
    } catch (error) {
      setLastSuccess(false);
      logError('Error handling recruitment:', error);
      alertService.error(t('autoRecruit.networkErrorDuringRecruitment'), false);
    } finally {
      setIsHandlingRecruitment(false);
    }
  }, [isHandlingRecruitment, user, viewer, forceUpdate, totalLeft, startCountdown, handleInvalidSession, stopRecruiting, t]);

  const resumeRecruiting = useCallback(async () => {
    if (isResumingSession || !sessionIdRef.current) {
      if (!sessionIdRef.current) {
        await startCountdown();
      }
      return;
    }
    setIsResumingSession(true);
    try {
      const response = await fetch('/api/recruit/verifySession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });

      const data = await response.json();

      if (response.ok && data.valid) {
        setIsPaused(false);
        alertService.clear();
        if (!isFetchingUser) {
          fetchRandomUser();
        }
      } else {
        handleInvalidSession();
      }
    } catch (error) {
      logError('Error verifying session:', error);
      alertService.error(t('autoRecruit.errorVerifyingSession'), false);
    } finally {
      setIsResumingSession(false);
    }
  }, [isResumingSession, handleInvalidSession, startCountdown, fetchRandomUser, isFetchingUser, t]);

  const startRecruiting = useCallback(async () => {
    if (isStartingSession) return;
    setIsStartingSession(true);
    try {
      const response = await fetch('/api/recruit/startSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      alertService.clear();
      setSessionId(data.sessionId);
      setIsRecruiting(true);
      setIsPaused(false);
      setConsecutiveSuccesses(0);
      setHasEnded(false);
      setLastSuccess(false);
      setTotalLeft(viewer?.recruitsLeft ?? 0);
    } catch (error) {
      logError('Error starting recruitment session:', error);
      alertService.error(t('autoRecruit.errorStartingSession'), false);
    } finally {
      setIsStartingSession(false);
    }
  }, [isStartingSession, viewer, t]);

  // Initial state: Not recruiting
  if (!isRecruiting) {
    return (
      <MainArea title={t('autoRecruit.title')}>
        <Center style={{ height: '50vh' }}>
          <GameCard title={t('autoRecruit.sessionControls')} goldAccent={false}>
            <Stack align="center">
              <Text>{t('autoRecruit.clickStart')}</Text>
              <Button color="yellow" onClick={startRecruiting} loading={isStartingSession}>
                {t('autoRecruit.startSession')}
              </Button>
              <Button variant="default" onClick={() => setSessionModalOpened(true)} disabled={isStartingSession}>
                {t('autoRecruit.manageSessions')}
              </Button>
            </Stack>
          </GameCard>
        </Center>
      </MainArea>
    );
  }

  // Recruiting state: Waiting for user or countdown
  if (!user && !hasEnded) {
    return (
      <MainArea title={t('autoRecruit.title')}>
        <Center style={{ height: '50vh' }}>
          <GameCard title={t('autoRecruit.sessionStatus')} goldAccent={false}>
            <Stack align="center">
              <Text>{t('autoRecruit.loadingNextUser')}</Text>
            </Stack>
          </GameCard>
        </Center>
      </MainArea>
    );
  }

  // Recruiting ended state: Session complete
  if (hasEnded) {
    return (
      <MainArea title={t('autoRecruit.title')}>
        <Center style={{ height: '50vh' }}>
          <GameCard title={t('autoRecruit.sessionComplete')} goldAccent={false}>
            <Stack align="center">
              <Text>{t('autoRecruit.sessionEnded')}</Text>
              <Button color="yellow" onClick={startRecruiting} loading={isStartingSession}>
                {t('autoRecruit.startNewSession')}
              </Button>
            </Stack>
          </GameCard>
        </Center>
      </MainArea>
    );
  }

  // Active recruiting state: Display user and controls
  return (
    <MainArea title={t('autoRecruit.title')}>
      <GameCard title={t('autoRecruit.recruitmentStatus')} goldAccent={false}>
        <Text size="lg" ta="center">
          {t('autoRecruit.totalDailyRecruitsLeft', { count: totalLeft })}
        </Text>
        <Space h="md" />
        {user && !isPaused && !isCountdown && (
          <Recruiter
            key={user.id}
            user={user}
            showCaptcha={process.env.NEXT_PUBLIC_USE_CAPTCHA === 'true' ? consecutiveSuccesses < 3 : false}
            onSuccess={handleRecruitment}
            status={recruitStatus === 'success' ? t('autoRecruit.recruitedSuccessfully') : `Recruiting ${user?.display_name}...`}
          />
        )}
      </GameCard>
      <Space h="md" />
      <GameCard title={t('autoRecruit.controls')} goldAccent={false}>
        <Flex justify={'center'} align={'center'} direction={'column'} gap="md">
          {!isPaused && isCountdown && countdown > 0 && (
            <Text>
              {t('autoRecruit.loadingNextUser', { count: countdown })}
            </Text>
          )}
          {isPaused ? (
            <Button
              color="yellow"
              onClick={resumeRecruiting}
              loading={isResumingSession}
              disabled={isStartingSession || hasEnded}
            >
              {t('autoRecruit.resumeRecruiting')}
            </Button>
          ) : (
            <Button
              color="yellow"
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
