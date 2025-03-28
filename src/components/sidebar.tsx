import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faCircleInfo, faRefresh } from "@fortawesome/free-solid-svg-icons";
import { getTimeRemaining, getTimeToNextTurn, getOTTime } from '@/utils/timefunctions';
import { Button, Autocomplete, AutocompleteProps, Avatar, Group, Text, List, Progress, Popover } from '@mantine/core';
import { useDebouncedCallback, useDisclosure, useMediaQuery } from '@mantine/hooks';
import { getAvatarSrc, getLevelFromXP } from '@/utils/utilities';
import router from 'next/router';
import { levelXPArray } from '@/constants/XPLevels';
import RpgAwesomeIcon from './RpgAwesomeIcon';
import { logError } from '@/utils/logger';

const Sidebar: React.FC = () => {
  const [time, setTime] = useState('');
  const [OTTime, setOTTime] = useState('');
  const [messages, setMessages] = useState(['']);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const { user, forceUpdate } = useUser();
  const [searchValue, setSearchValue] = useState('');
  const [usersData, setUsersData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextLevelOpened, { close, open }] = useDisclosure(false);
  const isMobile = useMediaQuery('(max-width: 768px)'); // Adjust breakpoint for mobile devices

  const [sidebar, setSidebar] = useState({
    gold: '0',
    citizens: '0',
    level: '1',
    xp: '0',
    turns: '0',
    xpNextLevel: '0',
    progress: '0'
  });

  useEffect(() => {
    const messagesArray = [
      'It is better to buy a few stronger weapons than many weaker ones.',
      'The more attack turns you use in an attack, the more experience and gold you will gain.',
      `The more workers you have, the more gold you'll earn per turn.`,
      `Recruiting your max amount every day will ensure your kingdom continues to grow.`,
      `A unit is only as strong as the equipment they wield. Make sure your army is well equipped.`,
      `If your defense is less than 25% of your non-combatant population, you may lose citizens and workers in an attack. Keep your fort repaired.`,
      // Add more messages as needed
    ];

    setMessages(messagesArray);
  }, []);

  const intervalIdRef = useRef(null);

  const resetInterval = useCallback(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }

    // Define new interval
    intervalIdRef.current = setInterval(() => {
      setCurrentMessageIndex(prevIndex => (prevIndex + 1) % messages.length);
      forceUpdate();
    }, 15000);

    return () => clearInterval(intervalIdRef.current);
  }, [messages.length, forceUpdate]);

  useEffect(() => {
    resetInterval();
    return () => clearInterval(intervalIdRef.current);
  }, [resetInterval]);



  useEffect(() => {
    const interval = setInterval(() => {
      if (user) {
        const remaining = getTimeRemaining(getTimeToNextTurn());
        const minutes = String(remaining.minutes).padStart(2, '0');
        const seconds = String(remaining.seconds).padStart(2, '0');
        setTime(`${minutes}:${seconds}`);
        setOTTime(getOTTime().toLocaleTimeString('en-us', {timeStyle: 'short', hour12: false}));
        const currentLevelInfo = levelXPArray.find((l) => l.level === user?.level);
        const nextLevelInfo = levelXPArray.find((l) => l.level === user?.level + 1);

        const xpForCurrentLevel = currentLevelInfo?.xp ?? 0;
        const xpForNextLevel = nextLevelInfo?.xp ?? xpForCurrentLevel;

        const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
        const xpGainedThisLevel = user?.experience - xpForCurrentLevel;

        const progressPercentage = xpNeededForNextLevel > 0
          ? (xpGainedThisLevel / xpNeededForNextLevel) * 100
          : 100;
        
        setSidebar({
          gold: toLocale(user.gold, user?.locale),
          citizens: toLocale(user.citizens, user?.locale),
          level: toLocale(user.level, user?.locale),
          xp: toLocale(user.experience, user?.locale),
          xpNextLevel: toLocale(user.xpToNextLevel, user?.locale),
          progress: progressPercentage.toString(),
          turns: toLocale(user.attackTurns, user?.locale),
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [user]);

  const renderAutocompleteOption: AutocompleteProps['renderOption'] = ({ option }) => {
    return (
      <Group gap="sm">
        <Avatar src={getAvatarSrc(option.image, option.race)} size={50} radius="xl" />
        <div>
          <Text size="sm">{option.label}</Text>
          <Text size="xs" opacity={0.5}>
            Lvl {option.experience} {option.race} {option.class}
          </Text>
        </div>
      </Group>
    );
  };

  const fetchUsers = async (searchTerm) => {
    if (!searchTerm.trim()) return [];

    setLoading(true);
    try {
      const response = await fetch('/api/general/searchUsers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: searchTerm }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      return data.map(user => ({
        value: user.display_name,
        label: user.display_name,
        image: user.avatar,
        class: user.class,
        race: user.race,
        experience: getLevelFromXP(user.experience),
        id: user.id
      }));
    } catch (error) {
      logError("Failed to fetch users:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useDebouncedCallback(async (query) => {
    if (!query.trim()) {
      setUsersData([]);
      return;
    }

    setLoading(true);
    try {
      const users = await fetchUsers(query);
      setUsersData(users);
    } catch (error) {
      logError("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, 300);

  useEffect(() => {
    handleSearch(searchValue);
  }, [searchValue, handleSearch]);

  const handleItemSubmit = (item) => {
    router.push(`/userprofile/${item.id}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const user = usersData.find(u => u.label.toLowerCase() === searchValue.toLowerCase());
    if (user) {
      router.push(`/userprofile/${user.id}`);
    }
  };

  const handlePrevAdvisor = () => {
    setCurrentMessageIndex((prevIndex) => (prevIndex - 1 + messages.length) % messages.length);
    resetInterval();
  }
  const handleNextAdvisor = () => {
    setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
    resetInterval();
  }

  return (
    <div className="block sm:block">
      <div className="text-black font-semibold mt-3 overflow-hidden rounded-lg shadow-lg min-h-96 h-96" style={{
        height: '100%',
        backgroundImage: 'url(https://assets.openthrone.dev/images/background/advisor-scroll-side.webp)',
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        paddingLeft: '18px',
        paddingRight: '18px',
        paddingTop: '15px',
        paddingBottom: '30px',
      }}>
        <div className="p-10 md:p-4 mt-2">
          <h3 className="advisor-title text-center font-medieval font-bold text-xl text-shadow text-shadow-xs">
            <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 15, padding: '3px 0' }} onClick={handlePrevAdvisor} /> Advisor <FontAwesomeIcon icon={faArrowRight} style={{ fontSize: 15, padding: '3px 0' }} onClick={handleNextAdvisor} />
          </h3>
          <Text size={isMobile ? 'xl' : 'sm'} fw={'bold'} className='text-black text-center' style={{minHeight: '105px'}}>{messages[currentMessageIndex]}</Text>

          <h6 className="text-center font-medieval font-bold text-xl mt-2 text-shadow text-shadow-xs">Stats <FontAwesomeIcon icon={faRefresh} className="fas fa-refresh" style={{ fontSize: 15, padding: '3px 0' }} onClick={forceUpdate} /></h6>
          <List size={isMobile ? 'xl' : 'sm'} className={ isMobile? 'text-sm ml-2': 'text-base' } style={isMobile ? {marginLeft: '14px'} : {}}>
            <List.Item>
              <RpgAwesomeIcon icon="gem" fw /> Gold:{' '}
              <span id="gold">{sidebar.gold}</span>
            </List.Item>
            <List.Item>
              <RpgAwesomeIcon icon="player" fw /> Citizens:{' '}
              <span id="citizens">{sidebar.citizens}</span>
            </List.Item>
            <List.Item>
              <RpgAwesomeIcon icon="tower" fw /> Level:{' '}
              <span id="level">{sidebar.level}</span>
            </List.Item>
            <List.Item>
              Experience:{' '}
              <span id="experience">
                {sidebar.xp}{' '}
                <Popover width={200} position="bottom" withArrow shadow="md" opened={nextLevelOpened}>
                  <Popover.Target>
                    <FontAwesomeIcon icon={faCircleInfo} onMouseEnter={open} onMouseLeave={close} />
                  </Popover.Target>
                  <Popover.Dropdown style={{ pointerEvents: 'none' }}>
                    <Text size="sm">You are { user?.xpToNextLevel} XP away from the next level</Text>
                  </Popover.Dropdown>
                </Popover>
              </span>
              <Progress value={Number(sidebar.progress)} size={'md'} />
            </List.Item>
            <List.Item>
              Turns Available: <span id="attackTurns">{sidebar.turns}</span>
            </List.Item>
            <List.Item>
              Time Until Next Turn: <span id="nextTurnTimestamp">{time}</span>
            </List.Item>
            <List.Item>
              OT Time: <span id="otTime">{OTTime}</span>
            </List.Item>
          </List>
          <h6 className="advisor-title text-center font-medieval font-bold text-xl mt-2 text-shadow text-shadow-xs">
            <span> </span> Search <span> </span>
          </h6>
          <form onSubmit={handleSubmit}>
            <center>
            <Autocomplete
              value={searchValue}
              onChange={setSearchValue}
              onSubmit={handleItemSubmit}
              renderOption={renderAutocompleteOption}
              data={usersData}
              maxDropdownHeight={300}
              placeholder="Type to search..."
              style={{ width: '95%' }}
              className='mb-2'
              comboboxProps={{ width: '250px' }}
              color='brand'
              variant='filled'
              bg={'dark'}
            />
            </center>
            <center>
              <Button type="submit" color='bluishGray' variant='brand'>Submit</Button>
            </center>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
