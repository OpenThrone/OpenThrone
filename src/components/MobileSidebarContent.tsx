import {
  faArrowLeft,
  faArrowRight,
  faCircleInfo,
  faCoins,
  faRefresh,
  faSearch,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { AutocompleteProps } from '@mantine/core';
import {
  Autocomplete,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  List,
  Popover,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';

import { ScrollSidebar as SidebarScroll } from '@/components/game/SidebarScroll';
import { SidebarTimeInfo, StatRow } from '@/components/sidebar/SidebarShared';
import { useUser } from '@/context/users'; // Provides UserModel instance
import { useSidebarData } from '@/hooks/useSidebarData';
import { getAvatarSrc } from '@/utils/utilities';

import { GoldRequestNotificationModal } from './GoldRequestNotificationModal';
import RpgAwesomeIcon from './RpgAwesomeIcon';

interface MobileSidebarContentProps {
  isMobile: boolean;
}

const MobileSidebarContent: React.FC<MobileSidebarContentProps> = ({
  isMobile,
}) => {
  const { t } = useTranslation('common');
  const { user, forceUpdate, loading: userLoading } = useUser();
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
  } = useSidebarData(user, userLoading);

  const renderAutocompleteOption: AutocompleteProps['renderOption'] = ({
    option,
  }) => (
    <Group gap="sm">
      <Avatar
        src={getAvatarSrc((option as any).image, (option as any).race)}
        size={50}
        radius="xl"
      />
      <div>
        <Text size="sm">{(option as any).label}</Text>
        <Text size="xs" opacity={0.5}>
          {t('sidebar.levelAbbrev')} {(option as any).experience}{' '}
          {(option as any).race} {(option as any).class}
        </Text>
      </div>
    </Group>
  );

  const inkColor = 'var(--scroll-ink)';
  const accentColor = 'var(--scroll-accent)';

  return (
    <SidebarScroll maxWidth="100%">
      <div
        className={`${isMobile ? 'mt-1' : 'mt-2'} space-y-3`}
        style={{ color: inkColor }}
      >
        <Group justify="center" gap="xs" wrap="nowrap">
          <button
            type="button"
            onClick={handlePrevAdvisor}
            aria-label={t('sidebar.previousAdvisorMessage')}
            style={{ color: inkColor }}
          >
            <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 14 }} />
          </button>
          <Text
            size={isMobile ? 'lg' : 'xl'}
            fw={900}
            tt="uppercase"
            style={{ letterSpacing: '1px', color: inkColor }}
          >
            {t('sidebar.advisor')}
          </Text>
          <button
            type="button"
            onClick={handleNextAdvisor}
            aria-label={t('sidebar.nextAdvisorMessage')}
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
          <Text
            size={isMobile ? 'xs' : 'sm'}
            fw={700}
            fs="italic"
            style={{ color: inkColor }}
          >
            {advisorMessages[currentMessageIndex]}
          </Text>
        </div>

        <Divider
          my={isMobile ? 'xs' : 'sm'}
          color={inkColor}
          style={{ opacity: 0.35 }}
        />

        <Group justify="center" gap="xs">
          <Text
            size={isMobile ? 'md' : 'lg'}
            fw={800}
            tt="uppercase"
            style={{ letterSpacing: '1px', color: inkColor }}
          >
            {t('sidebar.stats')}
          </Text>
          <button
            type="button"
            onClick={forceUpdate}
            aria-label={t('sidebar.refreshStats')}
            style={{ color: accentColor }}
          >
            <FontAwesomeIcon icon={faRefresh} style={{ fontSize: 13 }} />
          </button>
        </Group>

        {userLoading ? (
          <List
            size={isMobile ? 'sm' : 'sm'}
            className={isMobile ? 'ml-1 text-xs' : 'text-base'}
            style={isMobile ? { marginLeft: '6px' } : {}}
          >
            <List.Item>
              <Skeleton height={16} width="80%" radius="sm" />
            </List.Item>
            <List.Item>
              <Skeleton height={16} width="70%" radius="sm" mt={6} />
            </List.Item>
            <List.Item>
              <Skeleton height={16} width="60%" radius="sm" mt={6} />
            </List.Item>
            <List.Item>
              <Skeleton height={16} width="90%" radius="sm" mt={6} />
              <Skeleton height={8} width="100%" radius="sm" mt={4} />
            </List.Item>
            <List.Item>
              <Skeleton height={16} width="75%" radius="sm" mt={6} />
            </List.Item>
            <List.Item>
              <Skeleton height={16} width="85%" radius="sm" mt={6} />
            </List.Item>
            <List.Item>
              <Skeleton height={16} width="70%" radius="sm" mt={6} />
            </List.Item>
          </List>
        ) : (
          <Stack gap="xs">
            <StatRow
              variant="scroll"
              isMobile={isMobile}
              inkColor={inkColor}
              label={t('labels.gold')}
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
                      title={t('sidebar.goldRequestPending', {
                        count: goldRequestCount,
                      })}
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
                        fontSize: '12px',
                      }}
                      onClick={() => setIsNotificationModalOpen(true)}
                      title={t('sidebar.goldRequestPending', {
                        count: goldRequestCount,
                      })}
                    />
                  )}
                </Group>
              }
            />
            <StatRow
              variant="scroll"
              isMobile={isMobile}
              inkColor={inkColor}
              label={t('labels.citizens')}
              value={<span id="citizens">{sidebar.citizens}</span>}
              icon={
                <span style={{ color: accentColor }}>
                  <RpgAwesomeIcon icon="player" fw />
                </span>
              }
            />
            <StatRow
              variant="scroll"
              isMobile={isMobile}
              inkColor={inkColor}
              label={t('labels.level')}
              value={<span id="level">{sidebar.level}</span>}
              icon={
                <span style={{ color: accentColor }}>
                  <RpgAwesomeIcon icon="tower" fw />
                </span>
              }
            />
            <StatRow
              variant="scroll"
              isMobile={isMobile}
              inkColor={inkColor}
              label={t('labels.experience')}
              value={<span id="experience">{sidebar.xp}</span>}
              icon={
                <>
                  <span style={{ color: accentColor }}>
                    <RpgAwesomeIcon icon="experience" fw />
                  </span>
                  <Popover
                    width={200}
                    position="bottom"
                    withArrow
                    shadow="md"
                    opened={nextLevelOpened}
                  >
                    <Popover.Target>
                      <FontAwesomeIcon
                        icon={faCircleInfo}
                        onMouseEnter={open}
                        onMouseLeave={close}
                      />
                    </Popover.Target>
                    <Popover.Dropdown style={{ pointerEvents: 'none' }}>
                      <Text size="sm">
                        {t('sidebar.xpToNextLevel', {
                          xp: sidebar.xpNextLevel,
                        })}
                      </Text>
                    </Popover.Dropdown>
                  </Popover>
                </>
              }
            />
            <StatRow
              variant="scroll"
              isMobile={isMobile}
              inkColor={inkColor}
              label={t('labels.turns')}
              value={<span id="turns">{sidebar.turns}</span>}
              icon={
                <span style={{ color: accentColor }}>
                  <RpgAwesomeIcon icon="clockwork" fw />
                </span>
              }
            />
            <Divider
              my={isMobile ? 'xs' : 'md'}
              color={inkColor}
              style={{ opacity: 0.35 }}
            />
            {!userLoading && (
              <SidebarTimeInfo
                user={user}
                userLoading={userLoading}
                isMobile={isMobile}
                inkColor={inkColor}
              />
            )}
          </Stack>
        )}

        <Divider
          my={isMobile ? 'xs' : 'sm'}
          color={inkColor}
          style={{ opacity: 0.25 }}
        />

        <Text
          size={isMobile ? 'md' : 'lg'}
          fw={800}
          ta="center"
          tt="uppercase"
          style={{ letterSpacing: '1px', color: inkColor }}
        >
          {t('sidebar.search')}
        </Text>
        <form onSubmit={handleSubmit}>
          <Group
            gap={0}
            style={{
              borderBottom: `2px solid ${inkColor}`,
              paddingBottom: '2px',
            }}
          >
            <Autocomplete
              value={searchValue}
              onChange={setSearchValue}
              onOptionSubmit={handleItemSubmit}
              renderOption={renderAutocompleteOption}
              data={usersData}
              maxDropdownHeight={300}
              placeholder={t('sidebar.searchPlaceholder')}
              style={{ flex: 1 }}
              comboboxProps={{ width: '250px' }}
              variant="unstyled"
              styles={{
                input: {
                  color: inkColor,
                  fontFamily: 'MedievalSharp, serif',
                  fontSize: '14px',
                },
              }}
            />
            <Button
              type="submit"
              variant="subtle"
              color="dark"
              size="xs"
              px={6}
              aria-label={t('sidebar.searchUsers')}
            >
              <FontAwesomeIcon icon={faSearch} color={inkColor} />
            </Button>
          </Group>
        </form>
      </div>

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
