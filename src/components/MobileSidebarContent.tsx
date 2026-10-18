import {
  faArrowLeft,
  faArrowRight,
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
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import classes from '@/components/MobileSidebarContent.module.css';
import { ProtectionMeter } from '@/components/sidebar/ProtectionMeter';
import { SidebarTimeInfo } from '@/components/sidebar/SidebarShared';
import { useUser } from '@/context/users';
import { useSidebarData } from '@/hooks/useSidebarData';
import { getAvatarSrc } from '@/utils/utilities';

import { GoldRequestNotificationModal } from './GoldRequestNotificationModal';
import HeaderIconButton from './HeaderIconButton';
import RpgAwesomeIcon from './RpgAwesomeIcon';

interface MobileSidebarContentProps {
  isMobile: boolean;
}

const MobileSidebarContent: React.FC<MobileSidebarContentProps> = ({
  isMobile,
}) => {
  const { t } = useTranslation('common');
  const { user, forceUpdate, loading: userLoading } = useUser();

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
  }) => {
    const userData = usersData.find((u) => u.value === option.value);
    return (
      <Group gap="sm">
        <Avatar
          src={getAvatarSrc(userData?.image, userData?.race)}
          size={50}
          radius="xl"
        />
        <div>
          <Text size="sm">{userData?.label ?? option.value}</Text>
          <Text size="xs" opacity={0.5}>
            {t('sidebar.levelAbbrev')} {userData?.experience} {userData?.race}{' '}
            {userData?.class}
          </Text>
        </div>
      </Group>
    );
  };

  const stats = [
    {
      label: t('labels.gold'),
      value: (
        <Group gap={6} wrap="nowrap">
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
      ),
      icon: <RpgAwesomeIcon icon="gold-bar" fw />,
    },
    {
      label: t('labels.era'),
      value: user?.currentEra?.id ?? t('labels.unknown'),
      tooltip: user?.currentEra?.name ?? t('labels.unknown'),
      icon: <RpgAwesomeIcon icon="hourglass" fw />,
    },
    {
      label: t('labels.citizens'),
      value: <span id="citizens">{sidebar.citizens}</span>,
      icon: <RpgAwesomeIcon icon="player" fw />,
    },
    {
      label: t('labels.level'),
      value: <span id="level">{sidebar.level}</span>,
      icon: <RpgAwesomeIcon icon="tower" fw />,
    },
    {
      label: t('labels.experience'),
      value: <span id="experience">{sidebar.xp}</span>,
      tooltip: t('sidebar.xpToNextLevel', { xp: sidebar.xpNextLevel }),
      icon: <RpgAwesomeIcon icon="experience" fw />,
    },
    {
      label: t('labels.turns'),
      value: <span id="turns">{sidebar.turns}</span>,
      icon: <RpgAwesomeIcon icon="clockwork" fw />,
    },
  ];

  const refreshAction = (
    <HeaderIconButton
      label={t('sidebar.refreshStats')}
      onClick={forceUpdate}
      size={44}
      radius="sm"
    >
      <FontAwesomeIcon icon={faRefresh} />
    </HeaderIconButton>
  );

  return (
    <div className={classes.root}>
      {/* Advisor ledger card (FINDING-45). */}
      <GameCard
        title={t('sidebar.advisor')}
        action={
          <Group gap="xs" wrap="nowrap">
            <HeaderIconButton
              label={t('sidebar.previousAdvisorMessage')}
              onClick={handlePrevAdvisor}
              size={44}
              radius="sm"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
            </HeaderIconButton>
            <HeaderIconButton
              label={t('sidebar.nextAdvisorMessage')}
              onClick={handleNextAdvisor}
              size={44}
              radius="sm"
            >
              <FontAwesomeIcon icon={faArrowRight} />
            </HeaderIconButton>
          </Group>
        }
      >
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={classes.advisorText}
        >
          {userLoading ? (
            <Stack gap={6} w="100%">
              <Skeleton height={14} radius="sm" />
              <Skeleton height={14} width="75%" radius="sm" />
            </Stack>
          ) : (
            <Text
              size={isMobile ? 'sm' : 'md'}
              fs="italic"
              lh={1.4}
              c="var(--ot-body)"
              className={classes.advisorMessage}
            >
              {advisorMessages[currentMessageIndex]}
            </Text>
          )}
        </div>
      </GameCard>

      {/* Kingdom stats grid (FINDING-45): restores the Era row from the
          desktop ledger and pins tabular figures on the inset chassis. */}
      {userLoading ? (
        <GameCard title={t('sidebar.stats')} action={refreshAction}>
          <SimpleGrid cols={2} spacing="sm">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} height={44} radius="sm" />
            ))}
          </SimpleGrid>
        </GameCard>
      ) : (
        <StatGrid
          title={t('sidebar.stats')}
          columns={4}
          cols={{ base: 2, sm: 2 }}
          action={refreshAction}
          stats={stats}
        />
      )}
      {!userLoading && user?.protection?.protected && (
        <GameCard title={t('sidebar.protection.label')} goldAccent={false}>
          <ProtectionMeter user={user} />
        </GameCard>
      )}

      {/* Search card (FINDING-44): themed 44px control, heading ink on the
          inset chassis. */}
      <GameCard title={t('sidebar.search')} goldAccent={false}>
        <form onSubmit={handleSubmit} className={classes.searchForm}>
          <Autocomplete
            value={searchValue}
            onChange={setSearchValue}
            onOptionSubmit={handleItemSubmit}
            renderOption={renderAutocompleteOption}
            data={usersData}
            maxDropdownHeight={300}
            placeholder={t('sidebar.searchPlaceholder')}
            comboboxProps={{ width: 280 }}
            className={classes.searchField}
            styles={{
              input: {
                height: 44,
                color: 'var(--ot-heading)',
                borderColor: 'var(--ot-border)',
              },
            }}
          />
          <Button
            type="submit"
            aria-label={t('sidebar.searchUsers')}
            h={44}
            className={classes.searchSubmit}
          >
            <FontAwesomeIcon icon={faSearch} />
          </Button>
        </form>
      </GameCard>

      {/* Compact status strip for the turn timer and OpenThrone time. */}
      <div className={classes.statusStrip}>
        <SidebarTimeInfo user={user} userLoading={userLoading} compact />
      </div>

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

export default MobileSidebarContent;
