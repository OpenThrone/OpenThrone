import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/context/users'; // Provides UserModel instance
import toLocale from '@/utils/numberFormatting';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faCircleInfo, faRefresh } from "@fortawesome/free-solid-svg-icons";
import { getTimeRemaining, getTimeToNextTurn, getOTTime } from '@/utils/timefunctions';
import { Button, Autocomplete, AutocompleteProps, Avatar, Group, Text, List, Progress, Popover, Skeleton, Stack, Title, Divider } from '@mantine/core';
import { useDebouncedCallback, useDisclosure, useMediaQuery } from '@mantine/hooks';
import { getAvatarSrc, getLevelFromXP } from '@/utils/utilities';
import router from 'next/router';
import { levelXPArray } from '@/constants/XPLevels'; // Assuming constants are correctly exported
import RpgAwesomeIcon from './RpgAwesomeIcon';
import { logError } from '@/utils/logger';
import UserModel from '@/models/Users';
import messages from '@/pages/api/messages';

const Sidebar: React.FC = () => {
  const [time, setTime] = useState('');
  const [OTTime, setOTTime] = useState('');
  const [messages, setMessages] = useState<string[]>([]); // Explicitly type as string array
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const { user, forceUpdate, loading: userLoading } = useUser(); // Get user (UserModel instance) and loading state
  const [searchValue, setSearchValue] = useState('');
  const [usersData, setUsersData] = useState<any[]>([]); // Keep 'any' for autocomplete data flexibility or define a specific type
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [nextLevelOpened, { close, open }] = useDisclosure(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // State for sidebar display values, derived from user model
  const [sidebar, setSidebar] = useState({
    gold: '0',
    citizens: '0',
    level: '0',
    xp: '0',
    turns: '0',
    xpNextLevel: '0',
    progress: '0'
  });

  // --- Advisor Messages Logic (remains the same) ---
  useEffect(() => {
    const messagesArray = [ /* ... messages ... */
      'It is better to buy a few stronger weapons than many weaker ones.',
      'The more attack turns you use in an attack, the more experience and gold you will gain.',
      `The more workers you have, the more gold you'll earn per turn.`,
      `Recruiting your max amount every day will ensure your kingdom continues to grow.`,
      `A unit is only as strong as the equipment they wield. Make sure your army is well equipped.`,
      `If your defense is less than 25% of your non-combatant population, you may lose citizens and workers in an attack. Keep your fort repaired.`,
    ];
    setMessages(messagesArray);
  }, []);

  const intervalIdRef = useRef<NodeJS.Timer | null>(null);

  const resetInterval = useCallback(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }
    intervalIdRef.current = setInterval(() => {
      setCurrentMessageIndex(prevIndex => (prevIndex + 1) % messages.length);
      // No need to call forceUpdate here for advisor messages
    }, 15000);
  }, [messages.length]);

  useEffect(() => {
    resetInterval();
    return () => { if (intervalIdRef.current) clearInterval(intervalIdRef.current); };
  }, [resetInterval]);

  useEffect(() => {
    if (!user || userLoading) return;

    const currentLevelInfo = levelXPArray.find((l) => l.level === user.level);
    const nextLevelInfo = levelXPArray.find((l) => l.level === user.level + 1);

    const xpForCurrentLevel = currentLevelInfo?.xp ?? 0;
    const xpForNextLevel = nextLevelInfo?.xp ?? xpForCurrentLevel;

    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
    const xpGainedThisLevel = user.experience - xpForCurrentLevel;

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
  }, [user, userLoading]);

  const renderAutocompleteOption = React.useCallback<AutocompleteProps['renderOption']>(
    ({ option }) => {
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
    },
    []
  );

  const fetchUsers = async (searchTerm: string): Promise<any[]> => { // Return type clarification
    if (!searchTerm.trim()) return [];
    setLoadingSearch(true);
    try {
      const response = await fetch('/api/general/searchUsers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: searchTerm }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      // Map to Autocomplete format
      return data.map((u: any) => ({ // Add type for 'u' if possible
        value: u.display_name,
        label: u.display_name,
        image: u.avatar,
        class: u.class,
        race: u.race,
        experience: getLevelFromXP(u.experience),
        id: u.id
      }));
    } catch (error) {
      logError("Failed to fetch users:", error);
      return [];
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleSearch = useDebouncedCallback(async (query) => {
    if (!query.trim()) {
      setUsersData([]);
      return;
    }
    try {
      const users = await fetchUsers(query);
      setUsersData(users);
    } catch (error) {
      logError("Failed to fetch users during search:", error);
    }
  }, 300);

  // Trigger search on searchValue change
  useEffect(() => {
    handleSearch(searchValue);
  }, [searchValue, handleSearch]);


  const handleItemSubmit = (value: string) => {
    const selectedUser = usersData.find(u => u.label === value);
    if (selectedUser) {
      router.push(`/userprofile/${selectedUser.id}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { // Type the event
    e.preventDefault();
    const selectedUser = usersData.find(u => u.label.toLowerCase() === searchValue.toLowerCase());
    if (selectedUser) {
      router.push(`/userprofile/${selectedUser.id}`);
    } else {
      // Optionally handle case where typed value doesn't exactly match an option
      console.log("No exact match found for:", searchValue);
    }
  };

  const handlePrevAdvisor = () => {
    setCurrentMessageIndex((prevIndex) => (prevIndex - 1 + messages.length) % messages.length);
    resetInterval(); // Reset timer on manual change
  }
  const handleNextAdvisor = () => {
    setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
    resetInterval(); // Reset timer on manual change
  }

  const SidebarTimeInfo = React.memo(({ user, userLoading }: { user: UserModel | null, userLoading: boolean }) => {
    const [time, setTime] = useState('--:--');
    const [OTTime, setOTTime] = useState('--:--');
    const hasInitializedRef = useRef(false);
    
    // Define the medieval font style to be used with Mantine components
    const medievalFontStyle = { fontFamily: 'MedievalSharp, cursive' };

    useEffect(() => {
      // Only show '--:--' on initial load before we have user data
      if ((!user || userLoading) && !hasInitializedRef.current) {
        return;
      }

      // Once we have user data, we'll start the timer and never go back to '--:--'
      if (user && !hasInitializedRef.current) {
        hasInitializedRef.current = true;
      }

      const updateTimes = () => {
        const nextTurnTime = getTimeToNextTurn();
        const remaining = getTimeRemaining(nextTurnTime);
        
        // Format the time
        const minutes = String(remaining.minutes).padStart(2, '0');
        const seconds = String(remaining.seconds).padStart(2, '0');
        
        setTime(`${minutes}:${seconds}`);
        setOTTime(getOTTime().toLocaleTimeString('en-us', { timeStyle: 'short', hour12: false }));
      };
      
      // Update immediately
      updateTimes();
      
      // Then set interval for updates
      const interval = setInterval(updateTimes, 1000);

      return () => clearInterval(interval);
    }, [user, userLoading]);

    return (
      <>
        <Title order={5} className={"text-center"} style={medievalFontStyle}>Time Until Next Turn</Title>
        <Title order={4} ta="center" fw="bold" style={medievalFontStyle}><span id="nextTurnTimestamp">{time}</span></Title>
        
        <Title order={5} className={"text-center"} style={medievalFontStyle}>OT Time:</Title>
        <Title order={3} ta="center" fw="bold" style={medievalFontStyle}><span id="otTime">{OTTime}</span></Title>
      </>
    );
  });

  SidebarTimeInfo.displayName = 'SidebarTimeInfo';

  // Stat Row Component for consistent styling and layout
  const StatRow: React.FC<{ label: string; value: string | React.ReactNode; icon?: React.ReactNode }> = ({ label, value, icon }) => (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Group gap="xs" wrap="nowrap">
        {icon && <span className="w-4 text-center" style={{ paddingLeft: '5px' }}>{icon}</span>} {/* Icon wrapper */}
        <Text size="md" c="black" fw="bold" lh="xs">{label}</Text>
      </Group>
      <Text size="md" fw='bold' ta="right" pr="10px">{value}</Text>
    </Group>
  );

  return (
    <div className="block sm:block">
      {/* Advisor Scroll background and structure */}
      <div className="text-black font-semibold mt-3 overflow-hidden rounded-lg shadow-lg min-h-96 h-96" style={{ /* ... background styles ... */
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
          {/* Advisor Title and Text */}
          <h3 className="advisor-title text-center font-medieval font-bold text-xl text-shadow text-shadow-xs">
            <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 15, padding: '3px', cursor: 'pointer' }} onClick={handlePrevAdvisor} />
            Advisor
            <FontAwesomeIcon icon={faArrowRight} style={{ fontSize: 15, padding: '3px', cursor: 'pointer' }} onClick={handleNextAdvisor} />
          </h3>
          <Text size={isMobile ? 'xl' : 'sm'} fw={'bold'} className='text-black text-center' style={{ minHeight: '105px' }}>
            {messages[currentMessageIndex]}
          </Text>

          {/* Stats Section */}
          <h6 className="text-center font-medieval font-bold text-xl mt-2 text-shadow text-shadow-xs">
            Stats <FontAwesomeIcon icon={faRefresh} className="cursor-pointer" style={{ fontSize: 15, padding: '3px 0' }} onClick={forceUpdate} />
          </h6>
          {userLoading ? (
            <List size={isMobile ? 'xl' : 'sm'} className={isMobile ? 'text-sm ml-2' : 'text-base'} style={isMobile ? { marginLeft: '14px' } : {}}>
              <List.Item><Skeleton height={16} width="80%" radius="sm" /></List.Item>
              <List.Item><Skeleton height={16} width="70%" radius="sm" mt={6} /></List.Item>
              <List.Item><Skeleton height={16} width="60%" radius="sm" mt={6} /></List.Item>
              <List.Item>
                <Skeleton height={16} width="90%" radius="sm" mt={6} />
                <Skeleton height={8} width="100%" radius="sm" mt={4} /> {/* Skeleton for progress bar */}
              </List.Item>
              <List.Item><Skeleton height={16} width="75%" radius="sm" mt={6} /></List.Item>
              <List.Item><Skeleton height={16} width="85%" radius="sm" mt={6} /></List.Item>
              <List.Item><Skeleton height={16} width="70%" radius="sm" mt={6} /></List.Item>
            </List>
          ) : (
              
              <>
                <Stack gap="xs">
                  <StatRow label="Gold" value={<span id="gold">{sidebar.gold}</span>} icon={<RpgAwesomeIcon icon="gold-bar" fw />} />
                  <StatRow label="Citizens" value={<span id="citizens">{sidebar.citizens}</span>} icon={<RpgAwesomeIcon icon="player" fw />} />
                  <StatRow label="Level" value={<span id="level">{sidebar.level}</span>} icon={<RpgAwesomeIcon icon="tower" fw />} />
                  <StatRow label="XP" value={<span id="experience">{sidebar.xp}</span>} icon={
                    <>
                      <RpgAwesomeIcon icon="experience" fw />
                      <Popover width={200} position="bottom" withArrow shadow="md" opened={nextLevelOpened}>
                        <Popover.Target>
                          <FontAwesomeIcon icon={faCircleInfo} onMouseEnter={open} onMouseLeave={close} />
                        </Popover.Target>
                        <Popover.Dropdown style={{ pointerEvents: 'none' }}>
                          <Text size="sm">You are {sidebar.xpNextLevel} XP away from the next level</Text>
                        </Popover.Dropdown>
                      </Popover>
                    </>
                  } />
                  <StatRow label="Turns" value={<span id="turns">{sidebar.turns}</span>} icon={<RpgAwesomeIcon icon="turn" fw />} />
                  <Divider my="md" c="gray" variant="dashed" />
                  {!userLoading && <SidebarTimeInfo user={user} userLoading={userLoading} />}
                </Stack>
              </>
          )}

          {/* Search Section */}
          <h6 className="advisor-title text-center font-medieval font-bold text-xl mt-2 text-shadow text-shadow-xs">
            Search
          </h6>
          <form onSubmit={handleSubmit}>
            <center>
              <Autocomplete
                value={searchValue}
                onChange={setSearchValue}
                onOptionSubmit={handleItemSubmit} // Use onOptionSubmit for selection
                renderOption={renderAutocompleteOption}
                data={usersData}
                maxDropdownHeight={300}
                placeholder="Type to search..."
                style={{ width: '95%' }}
                className='mb-2'
                comboboxProps={{ width: '250px' }}
                color='brand' // Consider theme variable if needed
                variant='filled'
                loading={loadingSearch}
              />
            </center>
            <center>
              <Button type="submit" color='gray' variant='filled' size="sm"> {/* Adjusted button appearance */}
                Search
              </Button>
            </center>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;