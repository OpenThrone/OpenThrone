// src/pages/auto-recruit.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Recruiter from '../components/recruiter';
import { alertService } from '@/services';
import { Button, Space, Container, Text, Title, Center, Flex, Stack } from '@mantine/core';
import { useUser } from '@/context/users';
import SessionModal from '@/components/SessionModal';
import MainArea from '@/components/MainArea';
import { logError } from '@/utils/logger';
import type { UserApiResponse } from '@/types/typings'; // Import a potential type for the user state

/**
 * Page component for the Auto Recruiter feature.
 * Allows users to start, pause, resume, and stop automated recruitment sessions.
 * Fetches random users, handles recruitment attempts, and manages session state.
 */
export default function AutoRecruiter(props) {
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  // Use a more specific type if available from API response, otherwise fallback to partial or any
  const [user, setUser] = useState<Partial<UserApiResponse> | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastSuccess, setLastSuccess] = useState(false);
  const [totalLeft, setTotalLeft] = useState(0);
  const { forceUpdate, user: viewer } = useUser(); // viewer is the logged-in user context
  const [sessionId, setSessionId] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const isPausedRef = useRef(isPaused);
  const [sessionModalOpened, setSessionModalOpened] = useState(false);
  const [isFetchingUser, setIsFetchingUser] = useState(false);
  const [isHandlingRecruitment, setIsHandlingRecruitment] = useState(false);
  // Add loading states for button actions
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [isResumingSession, setIsResumingSession] = useState(false);
  // New state to track countdown/loading phase
  const [isCountdown, setIsCountdown] = useState(false);
  // New state to track recruit status: 'recruiting', 'success', or ''
  const [recruitStatus, setRecruitStatus] = useState('');

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    // Cleanup interval on component unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  /**
   * Handles the scenario where the current session ID is invalid or expired.
   * Resets state, clears intervals, and shows an error message.
   */
  const handleInvalidSession = useCallback(() => {
    setSessionId(null);
    sessionIdRef.current = null;
    setIsRecruiting(false);
    setIsPaused(false);
    setHasEnded(true); // Mark as ended on invalid session
    setUser(null);
    if (intervalRef.current) { // Clear interval on invalid session
        clearInterval(intervalRef.current);
        intervalRef.current = null;
    }
    alertService.error('Your session has ended or is no longer valid. Please start a new session.', false); // Simplified call
  }, []); // Added dependency array

  /**
   * Stops the current recruitment process locally.
   * Optionally ends the session on the server.
   * @param endSession - If true, attempts to end the session via API call. Defaults to false.
   */
  const stopRecruiting = useCallback(async (endSession = false) => {
    if (isStoppingSession) return; // Prevent double clicks
    setIsStoppingSession(true);
    setIsPaused(true); // Always pause when stopping
    setIsHandlingRecruitment(false); // Stop any ongoing recruitment handling
    setIsFetchingUser(false); // Stop any ongoing user fetching

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(0); // Reset countdown display

    if (endSession) {
      setHasEnded(true); // Mark session as ended locally
      if (sessionIdRef.current) {
        const currentSessionToEnd = sessionIdRef.current; // Capture session ID before clearing
        setSessionId(null); // Clear local session ID immediately
        sessionIdRef.current = null;
        try {
          await fetch('/api/recruit/endSession', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSessionToEnd }),
          });
          // Session ended successfully on server
        } catch (error) {
          logError('Error ending recruitment session:', error);
          alertService.error('Could not cleanly end server session, but stopping locally.', false); // Simplified call
        }
      }
    }
    setIsStoppingSession(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStoppingSession]); // Dependency for stopRecruiting

  /**
   * Fetches a random user for recruitment from the API.
   * Handles various API responses including success, invalid session, and no users found.
   */
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      const data = await response.json();

      if (response.ok) {
        setUser(data.randomUser);
        setTotalLeft(data.recruitsLeft);
        if (data.recruitsLeft === 0) { // Check if recruits ran out
            setHasEnded(true);
            setIsPaused(true);
            alertService.info('No more recruits left for today.');
            stopRecruiting(true); // End the session if recruits are zero
        }
      } else {
        // Check for specific error codes first
        if (data.error === 'Invalid session ID') {
          handleInvalidSession();
        } else if (data.error === 'NO_RECRUITABLE_USERS_FOUND') {
          // Handle the case where the API couldn't find anyone recruitable *by this user*
          alertService.info('No more recruitable users found for today. Ending session.');
          stopRecruiting(true); // End the session gracefully
        } else {
          // Handle other generic errors from the API
          setHasEnded(true);
          setIsPaused(true);
          alertService.error(data.error || 'Error fetching new user', false); // Simplified call
          logError('Error fetching new user:', data.error || 'Unknown API error');
        }
      }
    } catch (error) {
      setHasEnded(true);
      setIsPaused(true);
      alertService.error('Network error fetching new user', false); // Simplified call
      logError('Caught Network Error fetching user:', error);
    } finally {
      setIsFetchingUser(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetchingUser, handleInvalidSession, stopRecruiting]); // stopRecruiting dependency is now valid

  // Effect to fetch the first user or when resuming and user is missing
  useEffect(() => {
    // Conditions to fetch: Recruiting active, not paused, session not ended, valid session ID, no user loaded, not already fetching
    if (isRecruiting && !isPaused && !hasEnded && sessionId && !user && !isFetchingUser) {
        console.log('Effect triggered: Fetching initial/missing user for session:', sessionId);
        fetchRandomUser();
    }
  }, [isRecruiting, isPaused, hasEnded, sessionId, user, isFetchingUser, fetchRandomUser]);

  /**
   * Starts the 3-second countdown timer before fetching the next user.
   */
  const startCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(3);
    setIsCountdown(true); // Enter countdown phase
    setUser(null); // Hide user during countdown/loading
    let timer = 3;
    intervalRef.current = setInterval(async () => {
      timer -= 1; // Decrement timer first
      setCountdown(timer); // Update countdown state
      if (timer <= 0) { // Check if timer reached zero
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsCountdown(false); // Exit countdown phase
        setRecruitStatus('recruiting'); // Reset status for next user
        if (sessionIdRef.current && !isPausedRef.current) {
          await fetchRandomUser();
        }
        setLastSuccess(false); // Reset after countdown finishes
      }
    }, 1000);
  }, [fetchRandomUser]);

  /**
   * Handles the recruitment attempt for the currently displayed user.
   * Sends the request to the API and triggers the countdown or stops the session based on the result.
   */
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recruitedUserId: user.id,
          selfRecruit: false,
          sessionId: sessionIdRef.current, // Use ref value
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setLastSuccess(true);
        setConsecutiveSuccesses((prev) => prev + 1);
        if (viewer) {
          forceUpdate(); // Update context user data
        }
        setTotalLeft(prev => prev > 0 ? prev - 1 : 0); // Decrement totalLeft locally
        if (!isPausedRef.current) { // Check pause state via ref
          if (totalLeft -1 <= 0) { // Check if this was the last recruit
            stopRecruiting(true); // End session if no recruits left
            alertService.success('Successfully recruited the last unit for today!');
          } else {
            setRecruitStatus('success'); // Show success message
            setTimeout(() => {
              setRecruitStatus('');
              setIsCountdown(true); // Enter countdown phase
              setUser(null); // Hide user during countdown
              startCountdown(); // Start countdown for next user
            }, 1000); // Show success for 1s before countdown
          }
        }
      } else {
        setLastSuccess(false); // Mark as not successful on error
        if (data.error === 'Invalid session ID') {
          handleInvalidSession();
        } else {
          logError('Error handling recruitment:', data.error);
          alertService.error(data.error || 'Recruitment failed.', false); // Simplified call
        }
      }
    } catch (error) {
      setLastSuccess(false);
      logError('Error handling recruitment:', error);
      alertService.error('Network error during recruitment. Please try again.', false); // Simplified call
    } finally {
      setIsHandlingRecruitment(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHandlingRecruitment, user, viewer, forceUpdate, totalLeft, startCountdown, handleInvalidSession, stopRecruiting]);

  /**
   * Starts a new auto-recruitment session by calling the API.
   * Resets state variables and fetches the first user on success.
   */
  const startRecruiting = useCallback(async () => {
    if (isStartingSession) return; // Prevent double clicks
    setIsStartingSession(true);
    try {
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
        // First user fetch is now handled by useEffect
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
            , true); // Make sticky
            break;
          default:
            alertService.error(data.error || 'Failed to start session.', false); // Simplified call
            break;
        }
      }
    } catch (error) {
        logError('Error starting recruitment session:', error);
        alertService.error('An error occurred while starting the session.', false); // Simplified call
    } finally {
        setIsStartingSession(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStartingSession]); // Removed fetchRandomUser dependency

  /**
   * Resumes a paused recruitment session. Verifies the session ID with the API
   * and fetches the next user if valid.
   */
  const resumeRecruiting = useCallback(async () => {
    if (isResumingSession || !sessionIdRef.current) {
        if (!sessionIdRef.current) {
            // If no session ID, try starting a new one instead of resuming
            await startRecruiting();
        }
        return;
    }
    setIsResumingSession(true);
    try {
      const response = await fetch('/api/recruit/verifySession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      const data = await response.json();

      if (response.ok && data.valid) {
        setIsPaused(false);
        alertService.clear();
        // Fetch user immediately after resuming if not already loading/handling
        // This is now handled by the useEffect hook based on state changes
      } else {
        handleInvalidSession();
      }
    } catch (error) {
      logError('Error verifying session:', error);
      alertService.error('Error verifying session. Please try again.', false); // Simplified call
    } finally {
        setIsResumingSession(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResumingSession, handleInvalidSession, startRecruiting]); // Removed fetchRandomUser dependency

  // Initial state: Not recruiting
  if (!isRecruiting) {
    return (
      <MainArea title="Auto Recruiter">
        <Center style={{ height: '50vh' }}> {/* Added height for better centering */}
          <Container>
            <Stack align="center"> {/* Use Stack for vertical arrangement */}
              <Text>Click Start to begin the Auto-Recruit session.</Text>
              <Button color="dark" onClick={startRecruiting} loading={isStartingSession}>
                Start Recruiting
              </Button>
              <Button color="dark" onClick={() => setSessionModalOpened(true)} disabled={isStartingSession}>
                Manage Sessions
              </Button>
            </Stack>
          </Container>
          <SessionModal
            opened={sessionModalOpened}
            onClose={() => setSessionModalOpened(false)}
          />
        </Center>
      </MainArea>
    );
  }

  // Recruiting state: Waiting for user or countdown
  if (!user && !hasEnded) {
    return (
      <MainArea title='Auto Recruiter'>
        <Center style={{ height: '50vh' }}>
            <Stack align="center">
                <Text>Loading next user...</Text> {/* Simplified initial loading message */}
                <Space h="md" />
                <Button loading={isStoppingSession} color="dark" onClick={() => stopRecruiting(true)}>
                  Stop Recruiting Session
                </Button>
            </Stack>
        </Center>
         <SessionModal
            opened={sessionModalOpened}
            onClose={() => setSessionModalOpened(false)}
          />
      </MainArea>
    );
  }

  // Recruiting ended state
   if (hasEnded) {
     return (
       <MainArea title="Auto Recruiter">
         <Center style={{ height: '50vh' }}>
           <Stack align="center">
             <Text>Recruiting session ended.</Text>
             <Button color="dark" onClick={startRecruiting} loading={isStartingSession}>
               Start New Session
             </Button>
              <Button color="dark" onClick={() => setSessionModalOpened(true)} disabled={isStartingSession}>
                Manage Sessions
              </Button>
           </Stack>
         </Center>
          <SessionModal
            opened={sessionModalOpened}
            onClose={() => setSessionModalOpened(false)}
          />
       </MainArea>
     );
   }


  // Active recruiting state: Display user and controls
  return (
    <MainArea title="Auto Recruiter">
      <Text size="lg" ta="center" mb="md"> {/* Centered text */}
        Total Daily Recruits left: {totalLeft}
      </Text>
      {/* Conditionally render Recruiter only if user exists, not paused, and not in countdown */}
      {user && !isPaused && !isCountdown && (
          <Recruiter
            key={user.id}
            user={user}
            showCaptcha={process.env.NEXT_PUBLIC_USE_CAPTCHA === 'true' ? consecutiveSuccesses < 3 : false}
            onSuccess={handleRecruitment}
            status={recruitStatus === 'success' ? 'Recruited successfully!' : `Recruiting ${user.display_name} into your army...`}
          />
      )}
      <Space h="md" />
      <Flex justify={'center'} align={'center'} direction={'column'} gap="md"> {/* Added gap */}
        {/* Conditional Loading Text */}
        {!isPaused && isCountdown && countdown > 0 && (
          <Text>
            Loading next user in {countdown} seconds...
          </Text>
        )}

        {/* Conditional Action Buttons */}
        {isPaused ? (
          <Button
            color="dark"
            onClick={resumeRecruiting}
            loading={isResumingSession}
            disabled={isStoppingSession || isStartingSession || hasEnded} // More robust disabling
          >
            Resume Recruiting
          </Button>
        ) : (
          <Button
            color="dark"
            onClick={() => stopRecruiting(false)} // Button to pause, not end session
            loading={isStoppingSession}
            disabled={isResumingSession || isStartingSession || isHandlingRecruitment || hasEnded} // More robust disabling
          >
            Pause Recruiting
          </Button>
        )}
         {/* Always show button to end session */}
         <Button
            color="red" // Use red for ending session
            onClick={() => stopRecruiting(true)}
            loading={isStoppingSession && hasEnded} // Show loading only when ending
            disabled={isStartingSession || isResumingSession}
          >
            End Session
          </Button>
      </Flex>
       <SessionModal
            opened={sessionModalOpened}
            onClose={() => setSessionModalOpened(false)}
        />
    </MainArea>
  );
}
