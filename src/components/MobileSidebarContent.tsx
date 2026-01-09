import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '@/context/users'; // Provides UserModel instance
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faCircleInfo, faRefresh, faCoins, faSearch } from "@fortawesome/free-solid-svg-icons";
import { getTimeRemaining, getTimeToNextTurn, getOTTime } from '@/utils/timefunctions';
import { Autocomplete, AutocompleteProps, Avatar, Group, Text, List, Popover, Skeleton, Stack, Title, Divider, Badge, Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getAvatarSrc } from '@/utils/utilities';
import RpgAwesomeIcon from './RpgAwesomeIcon';
import type UserModel from '@/models/Users';
import { GoldRequestNotificationModal } from './GoldRequestNotificationModal';
import { useSidebarData } from '@/hooks/useSidebarData';
import SidebarScroll from '@/components/game/SidebarScroll';

interface MobileSidebarContentProps {
  isMobile: boolean;
}

const MobileSidebarContent: React.FC<MobileSidebarContentProps> = ({ isMobile }) => {
  const { user, forceUpdate, loading: userLoading } = useUser(); // Get user (UserModel instance) and loading state
  const [nextLevelOpened, { close, open }] = useDisclosure(false);

  const {
    advisorMessages,
    currentMessageIndex,
    handlePrevAdvisor,
    handleNextAdvisor,
    sidebar,
    goldRequestCount,
    isNotificationModalOpen,
    setIsNotificationModalOpen,
    refreshGoldRequestCount,
    searchValue,
    setSearchValue,
    usersData,
    handleItemSubmit,
    handleSubmit,
  } = useSidebarData(user as UserModel | null, userLoading);

  const renderAutocompleteOption: AutocompleteProps['renderOption'] = ({ option }) => (
    <Group gap="sm">
      <Avatar src={getAvatarSrc((option as any).image, (option as any).race)} size={50} radius="xl" />
      <div>
        <Text size="sm">{(option as any).label}</Text>
        <Text size="xs" opacity={0.5}>
          Lvl {(option as any).experience} {(option as any).race} {(option as any).class}
        </Text>
      </div>
    </Group>
  );

  const messages = advisorMessages;
  const inkColor = 'var(--scroll-ink)';
  const accentColor = 'var(--scroll-accent)';

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

    const labelOrder = isMobile ? 6 : 5;
    const valueOrder = isMobile ? 5 : 4;
    const otValueOrder = isMobile ? 4 : 3;

    return (
      <>
        <Title order={labelOrder} className={"text-center"} style={{ ...medievalFontStyle, color: inkColor }}>Time Until Next Turn</Title>
        <Title order={valueOrder} ta="center" fw="bold" style={{ ...medievalFontStyle, color: inkColor }}><span id="nextTurnTimestamp">{time}</span></Title>

        <Title order={labelOrder} className={"text-center"} style={{ ...medievalFontStyle, color: inkColor }}>OT Time:</Title>
        <Title order={otValueOrder} ta="center" fw="bold" style={{ ...medievalFontStyle, color: inkColor }}><span id="otTime">{OTTime}</span></Title>
      </>
    );
  });

  SidebarTimeInfo.displayName = 'SidebarTimeInfo';

  // Stat Row Component for consistent styling and layout
  const statTextColor = inkColor;
  const StatRow: React.FC<{ label: string; value: string | React.ReactNode; icon?: React.ReactNode }> = ({ label, value, icon }) => (
    <Group justify="space-between" wrap="nowrap" gap={isMobile ? 'xs' : 'sm'}>
      <Group gap="xs" wrap="nowrap">
        {icon && <span className="w-4 text-center" style={{ paddingLeft: '4px' }}>{icon}</span>} {/* Icon wrapper */}
        <Text size={isMobile ? 'sm' : 'md'} c={statTextColor} fw="bold" lh="xs">{label}</Text>
      </Group>
      {React.isValidElement(value) ? (
        <div
          className="flex items-end"
          style={{ paddingRight: isMobile ? '6px' : '10px', color: statTextColor }}
        >
          {value}
        </div>
      ) : (
        <Text size={isMobile ? 'sm' : 'md'} c={statTextColor} fw='bold' ta="right" pr={isMobile ? '6px' : '10px'}>{value}</Text>
      )}
    </Group>
  );

  return (
    <SidebarScroll maxWidth="100%">
      <div className={`${isMobile ? 'mt-1' : 'mt-2'} space-y-3`} style={{ color: inkColor }}>
        <Group justify="center" gap="xs" wrap="nowrap">
          <button
            type="button"
            onClick={handlePrevAdvisor}
            aria-label="Previous advisor message"
            style={{ color: inkColor }}
          >
            <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 14 }} />
          </button>
          <Text size={isMobile ? 'lg' : 'xl'} fw={900} tt="uppercase" style={{ letterSpacing: '1px', color: inkColor }}>
            Advisor
          </Text>
          <button
            type="button"
            onClick={handleNextAdvisor}
            aria-label="Next advisor message"
            style={{ color: inkColor }}
          >
            <FontAwesomeIcon icon={faArrowRight} style={{ fontSize: 14 }} />
          </button>
        </Group>

        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-center"
          style={{ minHeight: isMobile ? '48px' : '90px', lineHeight: 1.35 }}
        >
          <Text size={isMobile ? 'xs' : 'sm'} fw={700} fs="italic" style={{ color: inkColor }}>
            {messages[currentMessageIndex]}
          </Text>
        </div>

        <Divider my={isMobile ? 'xs' : 'sm'} color={inkColor} style={{ opacity: 0.35 }} />

        <Group justify="center" gap="xs">
          <Text size={isMobile ? 'md' : 'lg'} fw={800} tt="uppercase" style={{ letterSpacing: '1px', color: inkColor }}>
            Stats
          </Text>
          <button
            type="button"
            onClick={forceUpdate}
            aria-label="Refresh stats"
            style={{ color: accentColor }}
          >
            <FontAwesomeIcon icon={faRefresh} style={{ fontSize: 13 }} />
          </button>
        </Group>

        {userLoading ? (
          <List size={isMobile ? 'sm' : 'sm'} className={isMobile ? 'text-xs ml-1' : 'text-base'} style={isMobile ? { marginLeft: '6px' } : {}}>
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
          <Stack gap="xs">
            <StatRow
              label="Gold"
              value={
                <Group gap="xs">
                  <span id="gold">{sidebar.gold}</span>
                  {goldRequestCount > 0 && (
                    <Badge
                      color="yellow"
                      size="xs"
                      variant="filled"
                      onClick={() => setIsNotificationModalOpen(true)}
                      style={{ cursor: 'pointer' }}
                      title={`${goldRequestCount} gold request${goldRequestCount > 1 ? 's' : ''} pending`}
                    >
                      {goldRequestCount}
                    </Badge>
                  )}
                </Group>
              }
              icon={
                <Group gap="xs">
                  <span style={{ color: accentColor }}>
                    <RpgAwesomeIcon icon="gold-bar" fw />
                  </span>
                  {goldRequestCount > 0 && (
                    <FontAwesomeIcon
                      icon={faCoins}
                      style={{
                        color: accentColor,
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                      onClick={() => setIsNotificationModalOpen(true)}
                      title={`${goldRequestCount} gold request${goldRequestCount > 1 ? 's' : ''} pending`}
                    />
                  )}
                </Group>
              }
            />
            <StatRow label="Citizens" value={<span id="citizens">{sidebar.citizens}</span>} icon={<span style={{ color: accentColor }}><RpgAwesomeIcon icon="player" fw /></span>} />
            <StatRow label="Level" value={<span id="level">{sidebar.level}</span>} icon={<span style={{ color: accentColor }}><RpgAwesomeIcon icon="tower" fw /></span>} />
            <StatRow label="XP" value={<span id="experience">{sidebar.xp}</span>} icon={
              <>
                <span style={{ color: accentColor }}><RpgAwesomeIcon icon="experience" fw /></span>
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
            <StatRow label="Turns" value={<span id="turns">{sidebar.turns}</span>} icon={<span style={{ color: accentColor }}><RpgAwesomeIcon icon="clockwork" fw /></span>} />
            <Divider my={isMobile ? 'xs' : 'md'} color={inkColor} style={{ opacity: 0.35 }} />
            {!userLoading && <SidebarTimeInfo user={user} userLoading={userLoading} />}
          </Stack>
        )}

        <Divider my={isMobile ? 'xs' : 'sm'} color={inkColor} style={{ opacity: 0.25 }} />

        <Text size={isMobile ? 'md' : 'lg'} fw={800} ta="center" tt="uppercase" style={{ letterSpacing: '1px', color: inkColor }}>
          Search
        </Text>
        <form onSubmit={handleSubmit}>
          <Group gap={0} style={{ borderBottom: `2px solid ${inkColor}`, paddingBottom: '2px' }}>
            <Autocomplete
              value={searchValue}
              onChange={setSearchValue}
              onOptionSubmit={handleItemSubmit} // Use onOptionSubmit for selection
              renderOption={renderAutocompleteOption}
              data={usersData}
              maxDropdownHeight={300}
              placeholder="Type to search..."
              style={{ flex: 1 }}
              comboboxProps={{ width: '250px' }}
              variant='unstyled'
              styles={{
                input: {
                  color: inkColor,
                  fontFamily: 'MedievalSharp, serif',
                  fontSize: '14px',
                },
              }}
            />
            <Button type="submit" variant="subtle" color="dark" size="xs" px={6} aria-label="Search users">
              <FontAwesomeIcon icon={faSearch} color={inkColor} />
            </Button>
          </Group>
        </form>
      </div>

      {/* Gold Request Notification Modal */}
      <GoldRequestNotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        onRequestComplete={() => {
          refreshGoldRequestCount();
        }}
      />
    </SidebarScroll>
  );
};

export default MobileSidebarContent;
