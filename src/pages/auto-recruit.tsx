import React, { useState, useCallback, useEffect } from 'react';
import Recruiter from '../components/recruiter';
import Alert from '../components/alert';
import { alertService } from '@/services';
import { Button, Space, Container, Text, Title, Center, LoadingOverlay, Flex } from '@mantine/core';
import { useUser } from '@/context/users';

export default function AutoRecruiter(props) {
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  const [user, setUser] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastSuccess, setLastSuccess] = useState(false);
  const [totalLeft, setTotalLeft] = useState(0);
  const { forceUpdate, user: viewer} = useUser();

  const fetchRandomUser = useCallback(async () => {
    try {
      const response = await fetch('/api/recruit/getRandomUser');
      const data = await response.json();

      if (response.ok) {
        setUser(data.randomUser);
        setTotalLeft(data.totalLeft);
      } else {
        setHasEnded(true);
        setIsPaused(true);
        alertService.error(data.error);
        console.error('Error fetching new user:', data.error);
      }
    } catch (error) {
      setHasEnded(true);
      setIsPaused(true);
      alertService.error('Error fetching new user');
      console.error('Caught Error fetching user:', error);
    }
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(3);
    let timer = 3;
    const interval = setInterval(async () => {
      console.log('Timer:', timer)
      if (timer > 1) {
        setCountdown(timer - 1);
      } else {
        setCountdown(0);
        clearInterval(interval);
        await fetchRandomUser();
        setLastSuccess(false); // Reset after countdown finishes
      }
      timer -= 1;
    }, 1000);
  }, [fetchRandomUser]);

  const handleRecruitment = useCallback(async () => {
    try {
      const response = await fetch('/api/recruit/handleRecruitment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recruitedUserId: user.id,
          selfRecruit: false,
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
        console.error('Error handling recruitment, ln88:', data.error);
        console.log('startingCountdown after error ');
        startCountdown();
      }
    } catch (error) {
      console.error('Error handling recruitment, ln 93:', error);
      startCountdown();
    }
  }, [user, isPaused, startCountdown, forceUpdate, totalLeft]);

  const startRecruiting = async () => {
    setIsRecruiting(true);
    setIsPaused(false);
    setConsecutiveSuccesses(0);
    setHasEnded(false);
    setLastSuccess(false); // Reset last success flag
    await fetchRandomUser();
  };

  const stopRecruiting = (endSession = false) => {
    setIsPaused(true); // Pause the session
    if (endSession) {
      setHasEnded(true); // Indicate the session has ended
    }
  };

  if (!isRecruiting) {
    return (
      <Container className="mainArea" pb="xl">
        <Title order={2} className="page-title">Auto Recruiter</Title>
        <Center>
          <Container>
            {!hasEnded && <Text>Click Start to begin the Auto-Recruit, a new user will appear.</Text>}
            <Center>
              <Button color="dark" onClick={startRecruiting}>
                {!hasEnded ? 'Start' : 'Stop'} Recruiting
              </Button>
            </Center>
          </Container>
        </Center>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container className="mainArea" pb="xl">
        <Title order={2} className="page-title">Auto Recruiter</Title>
        <Space h="md" />
        <Alert />
        <Space h="md" />
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
              <Button color="dark" onClick={() => startRecruiting()}>
                Restart Recruiting
              </Button>
            </Center>
          )}
        </Center>
      </Container>
    );
  }

  return (
    <Container className="mainArea" pb="xl" size={'xl'}>
      <Title order={2} className="page-title">Auto Recruiter</Title>
      <Space h="md" />
      <Alert />
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
          <Button color="dark" onClick={startRecruiting}>
            Resume Recruiting
          </Button>
        ) : (
          <Button color="dark" onClick={() => stopRecruiting()}>
            Stop Recruiting
          </Button>
        )}
      </Flex>
    </Container>
  );
}
