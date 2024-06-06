import React, { useState, useCallback, useEffect } from 'react';
import Recruiter from '../components/recruiter';
import Alert from '../components/alert';
import { alertService } from '@/services';
import { Button } from '@mantine/core';
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
  const {forceUpdate} = useUser();

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
        alertService.error(data.error);;
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
    const interval = setInterval(() => {
      setCountdown(timer - 1);
      timer -= 1;
      if (timer < 0) {
        clearInterval(interval);
        setLastSuccess(false);  // Reset after countdown finishes
        fetchRandomUser();
      }
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
          selfRecruit: false, // Adjust this flag based on your requirement
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setLastSuccess(true);
        const newCount = consecutiveSuccesses + 1;
        forceUpdate();
        setConsecutiveSuccesses(newCount);
        if (!isPaused) {
          if (totalLeft === 0) {
            stopRecruiting(true);
          } else {
            startCountdown();
          }
        }
      } else {
        console.error('Error handling recruitment_:', data.error);
      }
    } catch (error) {
      console.error('Error handling recruitment:', error);
    }
  }, [user, consecutiveSuccesses, isPaused, startCountdown, forceUpdate, totalLeft]);

  const startRecruiting = async () => {
    setIsRecruiting(true);
    setIsPaused(false);
    setConsecutiveSuccesses(0);
    setHasEnded(false);
    setLastSuccess(false);  // Reset last success flag
    await fetchRandomUser();
  };

  const stopRecruiting = (endSession = false) => {
    setIsPaused(true);  // Pause the session
    if (endSession) {
      setHasEnded(true);  // Indicate the session has ended
    }
  };

  if (!isRecruiting) {
    return (
      <div className="mainArea pb-10">
        <h2>Auto Recruiter</h2>
        <div className="flex h-full items-center justify-center">
          <div className="container mx-auto text-center">
            {!hasEnded && <p>Click Start to begin the Auto-Recruit, a new user will appear.</p>}
            <Button color='dark' onClick={startRecruiting}>{!hasEnded ? "Start" : "Stop"} Recruiting</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mainArea pb-10">
        <h2>Auto Recruiter</h2>
        <div className="my-5 flex justify-between">
          <Alert />
        </div>
        <div className='my-5 flex justify-center items-center'>
        {!hasEnded ? (
          <div>
            <div>Loading next user in {countdown} seconds...</div>
            <Button loading color='dark' onClick={() => stopRecruiting()}>Stop Recruiting</Button>
          </div>
        ) : (
          <div>
            <Button color='dark' onClick={() => startRecruiting()}>Restart Recruiting</Button>
          </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mainArea pb-10">
      <h2>Auto Recruiter</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <Recruiter
        key={user.id}
        user={user}
        showCaptcha={consecutiveSuccesses < 3}
        onSuccess={handleRecruitment}
      />
      <div className='my-5 flex justify-center items-center'>
      {!isPaused && lastSuccess && (
        <div>Loading next user in {countdown} seconds...</div>
      )}
      {isPaused ? (
        <Button color='dark' onClick={startRecruiting}>Resume Recruiting</Button>
      ) : (
        <Button color='dark' onClick={() => stopRecruiting()}>Stop Recruiting</Button>
        )}
        </div>
    </div>
  );
}
