// src/pages/auto-recruit.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Recruiter from '../components/recruiter';
import Alert from '../components/alert';
import { alertService } from '@/services';
import { Button, Space, Container, Text, Title, Center, Flex } from '@mantine/core';
import { useUser } from '@/context/users';
import SessionModal from '@/components/SessionModal';
import MainArea from '@/components/MainArea';

export default function AutoRecruiter(props) {
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  const [user, setUser] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastSuccess, setLastSuccess] = useState(false);
  const [totalLeft, setTotalLeft] = useState(0);
  const { forceUpdate, user: viewer } = useUser();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef(sessionId);
  const isPausedRef = useRef(isPaused);
  const [sessionModalOpened, setSessionModalOpened] = useState(false);
  const [isFetchingUser, setIsFetchingUser] = useState(false);
  const [isHandlingRecruitment, setIsHandlingRecruitment] = useState(false);


  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleInvalidSession = () => {
    // Clear the session ID
    setSessionId(null);
    sessionIdRef.current = null;

    // Reset recruiting state
    setIsRecruiting(false);
    setIsPaused(false);
    setHasEnded(false);
    setUser(null);

    // Notify the user
    alertService.error('Your session has ended or is no longer valid. Please start a new session.', false, false, '', 5000);
  };

  const fetchRandomUser = useCallback(async () => {
    if (isFetchingUser) {
      return;
    }
    setIsFetchingUser(true);
    if (!sessionIdRef.current) {
      console.error('No session ID', sessionIdRef.current);
      return;
    }
    if (isPausedRef.current) {
      console.log('Recruiting is paused. Aborting fetchRandomUser.');
      return;
    }
    try {
      const response = await fetch('/api/recruit/getRandomUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      const data = await response.json();

      if (response.ok) {
        setUser(data.randomUser);
        setTotalLeft(data.recruitsLeft);
      } else {
        if (data.error === 'Invalid session ID') {
          handleInvalidSession();
        } else {
          setHasEnded(true);
          setIsPaused(true);
          alertService.error(data.error, false, false, '', 5000);
          console.error('Error fetching new user:', data.error);
        }
      }
    } catch (error) {
      setHasEnded(true);
      setIsPaused(true);
      alertService.error('Error fetching new user', false, false, '', 5000);
      console.error('Caught Error fetching user:', error);
    } finally {
      setIsFetchingUser(false);
    }
  }, []);

  const startCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(3);
    let timer = 3;
    intervalRef.current = setInterval(async () => {
      if (timer > 1) {
        setCountdown(timer - 1);
      } else {
        setCountdown(0);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (sessionIdRef.current && !isPausedRef.current) {
          await fetchRandomUser();
        }
        setLastSuccess(false); // Reset after countdown finishes
      }
      timer -= 1;
    }, 1000);
  }, [fetchRandomUser]);

  const handleRecruitment = useCallback(async () => {
    if (isHandlingRecruitment) {
      return;
    }
    setIsHandlingRecruitment(true);
    if (!sessionId) {
      console.error('No session ID');
      return;
    }
    try {
      const response = await fetch('/api/recruit/handleRecruitment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recruitedUserId: user.id,
          selfRecruit: false,
          sessionId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setLastSuccess(true);
        setConsecutiveSuccesses((prev) => prev + 1);
        if (viewer) {
          console.log('user', viewer);
          forceUpdate();
        }
        if (!isPaused) {
          if (totalLeft === 0) {
            stopRecruiting(true);
          } else {
            startCountdown();
          }
        }
      } else {
        if (data.error === 'Invalid session ID') {
          handleInvalidSession();
        } else {
          console.error('Error handling recruitment:', data.error);
          alertService.error(data.error, false, false, '', 5000);
          startCountdown();
        }
      }
    } catch (error) {
      console.error('Error handling recruitment:', error);
      alertService.error('Error handling recruitment. Please try again.', false, false, '', 5000);
      startCountdown();
    } finally {
      setIsHandlingRecruitment(false);
    }
  }, [isHandlingRecruitment, user, sessionId, isPaused, startCountdown, forceUpdate, totalLeft]);

  const startRecruiting = async () => {
    const response = await fetch('/api/recruit/startSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();

    if (response.ok) {
      alertService.clear();
      setSessionId(data.sessionId);
      setIsRecruiting(true);
      setIsPaused(false);
      setConsecutiveSuccesses(0);
      setHasEnded(false);
      setLastSuccess(false);
    } else {
      switch (data.code) {
        case 'TOO_MANY_SESSIONS':
          alertService.error(
            <>
              <Text>
                You have too many active sessions. Please end one or more sessions to continue.
              </Text>
              <Button onClick={() => setSessionModalOpened(true)} mb="md">
                Manage Sessions
              </Button>
            </>
          );
          break;
        default:
          alertService.error(data.error, false, false, '', 5000);
          break;
      }
    }
  };

  const resumeRecruiting = async () => {
    if (!sessionId) {
      startRecruiting();
      return;
    }

    try {
      const response = await fetch('/api/recruit/verifySession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json();

      if (response.ok && data.valid) {
        // Session is valid, resume recruiting
        setIsPaused(false);
        alertService.clear();
      } else {
        // Session is invalid
        handleInvalidSession();
      }
    } catch (error) {
      console.error('Error verifying session:', error);
      alertService.error('Error verifying session. Please try again.', false, false, '', 5000);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchRandomUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const stopRecruiting = async (endSession = false) => {
    setIsPaused(true); // Pause the countdown
    setIsHandlingRecruitment(false);
    setIsFetchingUser(false);
    if (endSession) {
      setHasEnded(true); // End the session
    }

    // Clear any active intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (sessionIdRef.current) {
      await fetch('/api/recruit/endSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      setSessionId(null);
      sessionIdRef.current = null;
    }
  };

  if (!isRecruiting) {
    return (
      <MainArea title="Auto Recruiter">
        <Center>
          <Container>
            {!hasEnded && <Text>Click Start to begin the Auto-Recruit, a new user will appear.</Text>}
            <Center>
              <Button color="dark" onClick={startRecruiting}>
                Start Recruiting
              </Button>
            </Center>
          </Container>
          <SessionModal
            opened={sessionModalOpened}
            onClose={() => setSessionModalOpened(false)}
          />
        </Center>
      </MainArea>
    );
  }

  if (!user) {
    return (
      <MainArea title='Auto Recruiter'>
        <Center>
          {!hasEnded ? (
            <div>
              <Center>
                <Text>
                  Loading{countdown > 0 ? ` next user in ${countdown} seconds...` : '...'}
                </Text>
                <Space h="md" />
                <Center>
                  <Button loading color="dark" onClick={() => stopRecruiting()}>
                    Stop Recruiting
                  </Button>
                </Center>
              </Center>
            </div>
          ) : (
            <Center>
              <Button color="dark" onClick={startRecruiting}>
                Restart Recruiting
              </Button>
            </Center>
          )}
        </Center>
      </MainArea>
    );
  }

  return (
    <MainArea title="Auto Recruiter">
      {/* Display Total Daily Recruits left */}
      <Text size="lg">
        Total Daily Recruits left: {totalLeft}
      </Text>

      <Space h="md" />
      <Recruiter
        key={user.id}
        user={user}
        showCaptcha={process.env.NEXT_PUBLIC_USE_CAPTCHA ? consecutiveSuccesses < 3 : false}
        onSuccess={handleRecruitment}
      />
      <Space h="md" />
      <Flex justify={'center'} align={'center'} direction={'column'}>
        {!isPaused && lastSuccess && (
          <Text>
            Loading{countdown > 0 ? ` next user in ${countdown} seconds...` : '...'}
          </Text>
        )}
        <Space h="md" />
        {isPaused ? (
          <Button color="dark" onClick={resumeRecruiting}>
            Resume Recruiting
          </Button>
        ) : (
          <Button color="dark" onClick={() => stopRecruiting()}>
            Stop Recruiting
          </Button>
        )}
      </Flex>
    </MainArea>
  );
}
