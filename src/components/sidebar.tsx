import React, { useEffect, useState } from 'react';

import { useUser } from '@/context/users';

const Sidebar: React.FC = () => {
  const [time, setTime] = useState('');
  const [messages, setMessages] = useState(['']);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  // const { data: session, status } = useSession();

  const { user } = useUser();

  const [sidebar, setSidebar] = useState({
    gold: 0,
    citizens: 0,
    level: 1,
    xp: 0,
    turns: 0,
    xpNextLevel: 0,
  });
  useEffect(() => {
    const messagesArray = [
      'This is a hint. It will rotate out',
      'This is another hint.',
      'You get the point',
      // Add more messages as needed
    ];

    setMessages(messagesArray);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
    }, 30000);

    return () => clearInterval(interval);
  }, [messages]);

  // https://www.sitepoint.com/build-javascript-countdown-timer-no-dependencies/
  const getTimeRemaining = (endtime: string) => {
    const total = Date.parse(endtime) - new Date().getTime();
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));

    return {
      total,
      days,
      hours,
      minutes,
      seconds,
    };
  };

  const getTimeToNextTurn = (date = new Date()) => {
    const ms = 1800000; // 30mins in ms
    const nextTurn = new Date(Math.ceil(date.getTime() / ms) * ms);
    return nextTurn.toString();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getTimeRemaining(getTimeToNextTurn());
      const minutes = String(remaining.minutes).padStart(2, '0');
      const seconds = String(remaining.seconds).padStart(2, '0');
      setTime(`${minutes}:${seconds}`);
      setSidebar({
        gold: user?.gold?.toLocaleString(),
        citizens: user?.citizens?.toLocaleString(),
        level: user?.level?.toLocaleString(),
        xp: user?.experience?.toLocaleString(),
        xpNextLevel: user?.xpToNextLevel?.toLocaleString(),
        turns: user?.attackTurns?.toLocaleString(),
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <div className="block sm:block">
      <div className="advisor mt-3 overflow-hidden rounded-lg shadow-lg">
        <div className="p-6">
          <h6 className="advisor-title text-center">
            <span> </span> Advisor <span> </span>
          </h6>
          <p className="text-xs">{messages[currentMessageIndex]}</p>

          <h6 className="text-center">Stats</h6>
          <ul className="list-none pl-0 text-sm">
            <li>
              <i className="ra ra-gem ra-fw" /> Gold:{' '}
              <span id="gold">{sidebar.gold}</span>
            </li>
            <li>
              <i className="ra ra-player ra-fw" /> Citizens:{' '}
              <span id="citizens">{sidebar.citizens}</span>
            </li>
            <li>
              <i className="ra ra-tower ra-fw" /> Level:{' '}
              <span id="level">{sidebar.level}</span>
            </li>
            <li>
              Experience:{' '}
              <span id="experience">
                {sidebar.xp}{' '}
                <span className="xpNextLevel">
                  (next level in{' '}
                  <span id="xpToNextLevel">{sidebar.xpNextLevel}</span>)
                </span>
              </span>
            </li>
            <li>
              Turns Available: <span id="attackTurns">{sidebar.turns}</span>
            </li>
            <li>
              Time Until Next Turn: <span id="nextTurnTimestamp">{time}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
