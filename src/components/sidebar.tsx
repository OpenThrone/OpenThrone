import React, { useEffect, useState } from 'react';

import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faRefresh, faTrash } from "@fortawesome/free-solid-svg-icons";
import { getTimeRemaining, getTimeToNextTurn } from '@/utils/timefunctions';


const Sidebar: React.FC = () => {
  const [time, setTime] = useState('');
  const [messages, setMessages] = useState(['']);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  const { user, forceUpdate } = useUser();

  const [sidebar, setSidebar] = useState({
    gold: '0',
    citizens: '0',
    level: '1',
    xp: '0',
    turns: '0',
    xpNextLevel: '0',
  });
  useEffect(() => {
    const messagesArray = [
      'It is better to buy a few stronger weapons than many weaker ones.',
      'The more attack turns you use in an attack, the more experience and gold you will gain.',
      `The more workers you have, the more gold you'll earn per turn.`,
      `Recruiting your max amount every day will ensure you're kingdom continues to grow.`,
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

  useEffect(() => {
    const interval = setInterval(() => {
      if (user) {
        const remaining = getTimeRemaining(getTimeToNextTurn());
        const minutes = String(remaining.minutes).padStart(2, '0');
        const seconds = String(remaining.seconds).padStart(2, '0');
        setTime(`${minutes}:${seconds}`);
        setSidebar({
          gold: toLocale(user.gold, user?.locale),
          citizens: toLocale(user.citizens, user?.locale),
          level: toLocale(user.level, user?.locale),
          xp: toLocale(user.experience, user?.locale),
          xpNextLevel: toLocale(user.xpToNextLevel, user?.locale),
          turns: toLocale(user.attackTurns, user?.locale),
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <div className="block sm:block">
      <div className="text-black font-semibold mt-3 overflow-hidden rounded-lg shadow-lg min-h-96 h-96" style={{
        backgroundImage: 'url(/assets/images/advisor-scroll.webp)',
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        paddingLeft: '30px',
        paddingRight: '30px',
}}>
        <div className="xs:p-14 md:p-6">
          <h6 className="advisor-title text-center font-medieval font-bold">
            <span> </span> Advisor <span> </span>
          </h6>
          <p className="text-xs">{messages[currentMessageIndex]}</p>

            <h6 className="text-center font-medieval font-bold">Stats <FontAwesomeIcon icon={faRefresh} className="fas fa-refresh" style={{ fontSize: 10, padding: '3px 0' }} onClick={forceUpdate} /></h6>
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
