import {
  faArrowLeft,
  faArrowRight,
  faCircleInfo,
  faCoins,
  faRefresh,
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
  Title,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';

import { SidebarTimeInfo, StatRow } from '@/components/sidebar/SidebarShared';
import { useUser } from '@/context/users';
import { useSidebarData } from '@/hooks/useSidebarData';
import { getAvatarSrc } from '@/utils/utilities';

import CollapsibleSection from './CollapsibleSection';
import { GoldRequestNotificationModal } from './GoldRequestNotificationModal';
import RpgAwesomeIcon from './RpgAwesomeIcon';

const Sidebar: React.FC = () => {
  const { t } = useTranslation('common');
  const { user, forceUpdate, loading: userLoading } = useUser();
  const [nextLevelOpened, { close, open }] = useDisclosure(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

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

  return (
    <div className="block sm:block">
      {isMobile ? (
        <CollapsibleSection title={t('sidebar.advisor')}>
          <div className="card-fantasy mt-3 overflow-hidden p-4 font-semibold text-black">
            <div className="mt-2 p-4">
              <Text
                size={isMobile ? 'xl' : 'sm'}
                fw="bold"
                className="text-center text-[var(--ot-text)]"
                style={{ minHeight: '105px', lineHeight: 1.5 }}
              >
                {advisorMessages[currentMessageIndex]}
              </Text>

              <Title
                order={2}
                className="mt-2 text-center font-bold text-shadow text-shadow-xs"
              >
                {t('sidebar.stats')}{' '}
                <FontAwesomeIcon
                  icon={faRefresh}
                  className="cursor-pointer"
                  style={{ fontSize: 15, padding: '3px 0' }}
                  onClick={forceUpdate}
                />
              </Title>
              {userLoading ? (
                <List
                  size={isMobile ? 'xl' : 'sm'}
                  className={isMobile ? 'ml-2 text-sm' : 'text-base'}
                  style={isMobile ? { marginLeft: '14px' } : {}}
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
                        <RpgAwesomeIcon icon="gold-bar" fw />
                        {goldRequestCount > 0 && (
                          <FontAwesomeIcon
                            icon={faCoins}
                            style={{
                              color: '#fbbf24',
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
                    label={t('labels.era')}
                    value={
                      <span>
                        {user?.currentEra?.name ?? t('labels.unknown')}
                      </span>
                    }
                    icon={<RpgAwesomeIcon icon="hourglass" fw />}
                  />
                  <StatRow
                    label={t('labels.citizens')}
                    value={<span id="citizens">{sidebar.citizens}</span>}
                    icon={<RpgAwesomeIcon icon="player" fw />}
                  />
                  <StatRow
                    label={t('labels.level')}
                    value={<span id="level">{sidebar.level}</span>}
                    icon={<RpgAwesomeIcon icon="tower" fw />}
                  />
                  <StatRow
                    label={t('labels.xp')}
                    value={<span id="experience">{sidebar.xp}</span>}
                    icon={
                      <>
                        <RpgAwesomeIcon icon="experience" fw />
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
                    label={t('labels.turns')}
                    value={<span id="turns">{sidebar.turns}</span>}
                    icon={<RpgAwesomeIcon icon="clockwork" fw />}
                  />
                  <Divider my="md" c="gray" variant="dashed" />
                  {!userLoading && (
                    <SidebarTimeInfo user={user} userLoading={userLoading} />
                  )}
                </Stack>
              )}

              {/* Search Section */}
              <Title
                order={2}
                className="advisor-title mt-2 text-center font-bold text-shadow text-shadow-xs"
              >
                {t('sidebar.search')}
              </Title>
              <form onSubmit={handleSubmit}>
                <center>
                  <Autocomplete
                    value={searchValue}
                    onChange={setSearchValue}
                    onOptionSubmit={handleItemSubmit}
                    renderOption={renderAutocompleteOption}
                    data={usersData}
                    maxDropdownHeight={300}
                    placeholder={t('sidebar.searchPlaceholder')}
                    style={{ width: '95%' }}
                    className="mb-2"
                    comboboxProps={{ width: '250px' }}
                    color="brand"
                    variant="filled"
                  />
                </center>
                <center>
                  <Button type="submit" color="gray" variant="filled" size="sm">
                    {t('sidebar.searchUsers')}
                  </Button>
                </center>
              </form>
            </div>
          </div>
        </CollapsibleSection>
      ) : (
        <div className="card-fantasy mt-3 overflow-hidden p-4 font-semibold text-black">
          <div className="mt-2 p-4">
            <Title
              order={2}
              className="advisor-title text-center font-bold text-shadow text-shadow-xs"
            >
              <FontAwesomeIcon
                icon={faArrowLeft}
                style={{ fontSize: 15, padding: '3px', cursor: 'pointer' }}
                onClick={handlePrevAdvisor}
              />
              {t('sidebar.advisor')}
              <FontAwesomeIcon
                icon={faArrowRight}
                style={{ fontSize: 15, padding: '3px', cursor: 'pointer' }}
                onClick={handleNextAdvisor}
              />
            </Title>
            <Text
              size={isMobile ? 'xl' : 'sm'}
              fw="bold"
              className="text-center text-[var(--ot-text)]"
              style={{ minHeight: '105px', lineHeight: 1.5 }}
              >
                {advisorMessages[currentMessageIndex]}
              </Text>

              <Title
              order={2}
              className="mt-2 text-center font-bold text-shadow text-shadow-xs"
            >
              {t('sidebar.stats')}{' '}
              <FontAwesomeIcon
                icon={faRefresh}
                className="cursor-pointer"
                style={{ fontSize: 15, padding: '3px 0' }}
                onClick={forceUpdate}
              />
            </Title>
            {userLoading ? (
              <List
                size={isMobile ? 'xl' : 'sm'}
                className={isMobile ? 'ml-2 text-sm' : 'text-base'}
                style={isMobile ? { marginLeft: '14px' } : {}}
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
                      <RpgAwesomeIcon icon="gold-bar" fw />
                      {goldRequestCount > 0 && (
                        <FontAwesomeIcon
                          icon={faCoins}
                          style={{
                            color: '#fbbf24',
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
                  label={t('labels.era')}
                  value={
                    <span>{user?.currentEra?.name ?? t('labels.unknown')}</span>
                  }
                  icon={<RpgAwesomeIcon icon="hourglass" fw />}
                />
                <StatRow
                  label={t('labels.citizens')}
                  value={<span id="citizens">{sidebar.citizens}</span>}
                  icon={<RpgAwesomeIcon icon="player" fw />}
                />
                <StatRow
                  label={t('labels.level')}
                  value={<span id="level">{sidebar.level}</span>}
                  icon={<RpgAwesomeIcon icon="tower" fw />}
                />
                <StatRow
                  label={t('labels.xp')}
                  value={<span id="experience">{sidebar.xp}</span>}
                  icon={
                    <>
                      <RpgAwesomeIcon icon="experience" fw />
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
                  label={t('labels.turns')}
                  value={<span id="turns">{sidebar.turns}</span>}
                  icon={<RpgAwesomeIcon icon="clockwork" fw />}
                />
                <Divider my="md" c="gray" variant="dashed" />
                {!userLoading && (
                  <SidebarTimeInfo user={user} userLoading={userLoading} />
                )}
              </Stack>
            )}

            {/* Search Section */}
            <Title
              order={2}
              className="advisor-title mt-2 text-center font-bold text-shadow text-shadow-xs"
            >
              {t('sidebar.search')}
            </Title>
            <form onSubmit={handleSubmit}>
              <center>
                  <Autocomplete
                    value={searchValue}
                    onChange={setSearchValue}
                    onOptionSubmit={handleItemSubmit}
                    renderOption={renderAutocompleteOption}
                  data={usersData}
                  maxDropdownHeight={300}
                  placeholder={t('sidebar.searchPlaceholder')}
                  style={{ width: '95%' }}
                    className="mb-2"
                    comboboxProps={{ width: '250px' }}
                    color="brand"
                    variant="filled"
                />
              </center>
                <center>
                  <Button type="submit" color="gray" variant="filled" size="sm">
                    {t('sidebar.searchUsers')}
                  </Button>
                </center>
            </form>
          </div>
        </div>
      )}

      {/* Gold Request Notification Modal */}
      <GoldRequestNotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        onRequestComplete={() => {
          refreshGoldRequestCount();
        }}
      />
    </div>
  );
};

export default Sidebar;
