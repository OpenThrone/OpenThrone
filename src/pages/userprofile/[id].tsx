import {
  Badge,
  Button,
  Group,
  Loader,
  SimpleGrid,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import type { InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';
import { MDXRemote } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AllianceListBadge } from '@/components/alliance/AllianceListBadge';
import ConfirmationModal from '@/components/ConfirmationModal';
import FriendCard from '@/components/friendCard';
import { GameCard } from '@/components/game/GameCard';
import { GoldRequestModal } from '@/components/GoldRequestModal';
import { GoldTransferModal } from '@/components/GoldTransferModal';
import MainArea from '@/components/MainArea';
import Modal from '@/components/modal';
import profileClasses from '@/components/profile/Profile.module.css';
import { ProfileHero } from '@/components/profile/ProfileHero';
import type { ProfileStat } from '@/components/profile/ProfileStatTiles';
import { ProfileStatTiles } from '@/components/profile/ProfileStatTiles';
import actionClasses from '@/components/ProfileActions.module.css';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import SpyMissionsModal from '@/components/spyMissionsModal';
import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { useRecruitmentStatus } from '@/hooks/useRecruitmentStatus';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { alertService } from '@/services/Alert.service';
import { AllianceService } from '@/services/Alliance.service';
import {
  hasParticipatedInEra,
  tookPartInArchivedEra,
} from '@/utils/eraParticipation';
import { logDebug, logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';
import { recruitBlockMessage } from '@/utils/recruitmentStatus';
import { serverSideTranslations } from '@/utils/serverTranslations';
import { serializeDates } from '@/utils/utilities';

const ERA_RECORD_FIELDS = [
  { key: 'maxLevelReached', label: 'Highest Level', icon: 'crown' },
  { key: 'totalAttacksWon', label: 'Attacks Won', icon: 'sword' },
  { key: 'totalDefendsWon', label: 'Defends Won', icon: 'shield' },
] as const;

const actionClassNames = {
  root: actionClasses.action,
  inner: actionClasses.inner,
  section: actionClasses.section,
  label: actionClasses.label,
};

const Index = ({
  users,
  visibleAlliances,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { user, forceUpdate } = useUser();
  const { config, error: configError } = useRuntimeConfig();
  const { t } = useTranslation('common');
  const { t: tAlliances } = useTranslation('alliances');
  const hideSidebar = !user;
  const userStatus = users.status;

  const profile = useMemo(() => new UserModel(users, true, false), [users]);
  const isOwnProfile = user?.id === profile.id;
  const { status: recruitStatus } = useRecruitmentStatus(
    profile.id ? [profile.id] : [],
    !!user && !isOwnProfile,
  );
  const recruitBlockReason = recruitBlockMessage(
    t,
    recruitStatus,
    profile.id,
    profile.displayName,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [lastActive, setLastActive] = useState('Never logged in');
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const socialEnabled = config?.enableSocial === true;
  const attackLevelRange = config?.attackLevelRange;
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);
  const [friendRelationship, setFriendRelationship] = useState(null);
  const [isFriendLoading, setIsFriendLoading] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [enemyRelationship, setEnemyRelationship] = useState(null);
  const [isEnemyLoading, setIsEnemyLoading] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const enableEnemies = config?.enableEnemies === true;

  const viewerId = user?.id;
  // The friends endpoint only returns the viewer's own list, so it is only shown
  // on the viewer's own profile; other players' social graphs stay private.
  useEffect(() => {
    if (!socialEnabled || !viewerId || viewerId !== profile.id) {
      setFriends([]);
      return;
    }
    let cancelled = false;
    setFriendsLoading(true);
    fetch('/api/social/listAll?type=FRIEND&limit=5')
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        logDebug('Friends data:', data);
        if (!cancelled) setFriends(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        logError('Error fetching friends:', error);
        if (!cancelled) setFriends([]);
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.id, socialEnabled, viewerId]);

  const fetchFriendRelationship = useCallback(async () => {
    if (!socialEnabled || !user || !profile.id || user.id === profile.id)
      return;
    setIsFriendLoading(true);
    try {
      const response = await fetch(
        `/api/social/relationship?targetUserId=${profile.id}`,
      );
      if (response.ok) {
        const data = await response.json();
        setFriendRelationship(data.relationship);
      }
    } catch (error) {
      logError('Error fetching friend relationship:', error);
    } finally {
      setIsFriendLoading(false);
    }
  }, [profile.id, socialEnabled, user]);

  const fetchEnemyRelationship = useCallback(async () => {
    if (
      !socialEnabled ||
      !user ||
      !profile.id ||
      user.id === profile.id ||
      !enableEnemies
    )
      return;
    setIsEnemyLoading(true);
    try {
      const response = await fetch(
        `/api/social/relationship?targetUserId=${profile.id}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (
          data.relationship &&
          data.relationship.relationshipType === 'ENEMY'
        ) {
          setEnemyRelationship(data.relationship);
        } else {
          setEnemyRelationship(null);
        }
      }
    } catch (error) {
      logError('Error fetching enemy relationship:', error);
    } finally {
      setIsEnemyLoading(false);
    }
  }, [enableEnemies, profile.id, socialEnabled, user]);

  useEffect(() => {
    fetchFriendRelationship();
  }, [fetchFriendRelationship]);

  useEffect(() => {
    fetchEnemyRelationship();
  }, [fetchEnemyRelationship]);

  const toggleModal = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (profile) {
      const nowdate = new Date();

      let rawLastActive: string | null = null;
      if (users && users.last_active) {
        rawLastActive = users.last_active;
      } else if (user && user.last_active) {
        if (
          user.last_active instanceof Date &&
          !isNaN(user.last_active.getTime())
        ) {
          rawLastActive = user.last_active.toISOString();
        } else if (typeof user.last_active === 'string') {
          rawLastActive = user.last_active;
        }
      } else if (profile && profile.last_active) {
        const p = profile.last_active;
        if (p instanceof Date) {
          if (!isNaN(p.getTime())) rawLastActive = p.toISOString();
        } else {
          const parsed = new Date(p);
          if (!isNaN(parsed.getTime())) rawLastActive = parsed.toISOString();
        }
      }

      logDebug('userprofile last_active check ->', {
        users_last_active: users?.last_active,
        profile_last_active: profile?.last_active,
        rawLastActive,
      });

      if (!rawLastActive) {
        setIsOnline(false);
        setLastActive('Never logged in');
        return;
      }

      const lastActiveDate = new Date(rawLastActive);
      const lastActiveTimestamp = lastActiveDate.getTime();
      const nowTimestamp = nowdate.getTime();

      if (!isNaN(lastActiveTimestamp)) {
        setIsOnline((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
        setLastActive(lastActiveDate.toDateString());
      } else {
        setIsOnline(false);
        setLastActive('Never logged in');
      }
    }
  }, [profile, users, user]);

  if (!profile) return <p>User not found</p>;

  const blockedStatuses = ['BANNED', 'SUSPENDED', 'CLOSED', 'TIMEOUT'];
  if (blockedStatuses.includes(userStatus)) {
    let statusMessage = '';
    switch (userStatus) {
      case 'IDLE':
        statusMessage = 'This account is currently idle.';
        break;
      case 'BANNED':
        statusMessage = 'This account has been banned.';
        break;
      case 'SUSPENDED':
        statusMessage = 'This account is suspended.';
        break;
      case 'CLOSED':
        statusMessage = 'This account has been closed.';
        break;
      case 'TIMEOUT':
        statusMessage = 'This account is in timeout.';
        break;
      default:
        statusMessage = 'This account is unavailable.';
    }
    return <p>{statusMessage}</p>;
  }

  // Friend request handlers
  const handleAddFriend = async () => {
    if (isFriendLoading) return;

    setIsFriendLoading(true);
    try {
      const res = await fetch('/api/social/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: profile.id,
          relationshipType: 'FRIEND',
        }),
      });

      if (res.ok) {
        alertService.success('Friend request sent successfully');
        await fetchFriendRelationship();
        forceUpdate();
      } else {
        const error = await res.json();
        alertService.error(error.error || 'Failed to add friend');
      }
    } catch {
      alertService.error('Failed to add friend');
    } finally {
      setIsFriendLoading(false);
    }
  };

  const handleCancelFriendRequest = async () => {
    if (isFriendLoading) return;

    setIsFriendLoading(true);
    try {
      const res = await fetch('/api/social/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: profile.id,
          relationshipType: 'FRIEND',
        }),
      });

      if (res.ok) {
        alertService.success('Friend request cancelled');
        await fetchFriendRelationship();
        forceUpdate();
      } else {
        const error = await res.json();
        alertService.error(error.error || 'Failed to cancel friend request');
      }
    } catch {
      alertService.error('Failed to cancel friend request');
    } finally {
      setIsFriendLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (isFriendLoading) return;

    setShowConfirmationModal(true);
  };

  const handleConfirmRemoveFriend = async () => {
    if (isFriendLoading) return;

    setIsFriendLoading(true);
    try {
      const res = await fetch('/api/social/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: profile.id,
          relationshipType: 'FRIEND',
        }),
      });

      if (res.ok) {
        alertService.success('Friend removed successfully');
        await fetchFriendRelationship();
        forceUpdate();
      } else {
        const error = await res.json();
        alertService.error(error.error || 'Failed to remove friend');
      }
    } catch {
      alertService.error('Failed to remove friend');
    } finally {
      setIsFriendLoading(false);
      setShowConfirmationModal(false);
    }
  };

  const getFriendStatus = () => {
    if (!friendRelationship) return 'neutral';

    if (friendRelationship.status === 'requested') {
      if (friendRelationship.playerId === user.id) {
        return 'pending_outgoing';
      }
      return 'pending_incoming';
    }

    if (friendRelationship.status === 'accepted') {
      return 'friend';
    }

    return 'neutral';
  };

  const getFriendStatusDisplay = () => {
    const status = getFriendStatus();
    switch (status) {
      case 'pending_outgoing':
        return {
          text: 'Friend Request is Pending',
          button: 'Cancel Friend Request',
          action: handleCancelFriendRequest,
          type: 'cancel',
        };
      case 'pending_incoming':
        return {
          text: `Friend Request from ${profile.displayName}`,
          button: 'Accept',
          action: () => {},
          type: 'accept',
        };
      case 'friend':
        return {
          text: `Friends with ${profile.displayName}`,
          button: 'Remove Friend',
          action: handleRemoveFriend,
          type: 'remove',
        };
      default:
        return {
          text: '',
          button: 'Add to Friends List',
          action: handleAddFriend,
          type: 'add',
        };
    }
  };

  const toggleSpyModal = () => {
    setIsSpyModalOpen(!isSpyModalOpen);
  };

  const targetUnavailable = !users.attackEligible;
  const outOfRange =
    !!user &&
    attackLevelRange !== undefined &&
    Math.abs(user.level - profile.level) > attackLevelRange;
  const targetReason = !user
    ? t('profileActions.signIn')
    : isOwnProfile
      ? t('profileActions.selfTarget')
      : !config
        ? t(
            configError
              ? 'profileActions.configError'
              : 'profileActions.loading',
          )
        : targetUnavailable
          ? t('profileActions.targetUnavailable')
          : outOfRange
            ? t('profileActions.outOfRange', { range: attackLevelRange })
            : null;
  const attackReason =
    targetReason ??
    (config?.enableAttacking === true
      ? null
      : t('profileActions.attackingDisabled'));
  const spyReason =
    targetReason ??
    (config?.enableIntel === true ||
    config?.enableAssassinations === true ||
    config?.enableInfiltrations === true
      ? null
      : t('profileActions.spyDisabled'));
  const canAttack = attackReason === null;
  const canSpy = spyReason === null;
  const friendStatus = getFriendStatus();
  const friendStatusDisplay = getFriendStatusDisplay();

  const friendsList =
    friends.length > 0 ? (
      friends.map((friend) => {
        const player = new UserModel(friend.friend, true, false);
        return <FriendCard key={player.id} player={player} />;
      })
    ) : (
      <p>No friends found.</p>
    );
  const kingdomStats: ProfileStat[] = [
    {
      key: 'population',
      label: t('profileSummary.population', { defaultValue: 'Population' }),
      value: toLocale(profile?.population ?? 0),
      icon: 'double-team',
    },
    {
      key: 'armySize',
      label: t('profileSummary.armySize', { defaultValue: 'Army Size' }),
      value: toLocale(profile?.armySize ?? 0),
      icon: 'crossed-swords',
    },
    {
      key: 'fortification',
      label: t('profileSummary.fortification', {
        defaultValue: 'Fortification',
      }),
      value:
        Fortifications.find((fort) => fort.level === profile?.fortLevel)
          ?.name ?? '—',
      icon: 'tower',
    },
    {
      key: 'gold',
      label: t('profileSummary.gold', { defaultValue: 'Gold' }),
      value: toLocale(profile?.gold),
      icon: 'gold-bar',
    },
  ];
  const eraRecord = users.latestUserEra;
  const tookPartInEra = tookPartInArchivedEra(eraRecord?.achievements);
  const eraStats: ProfileStat[] = tookPartInEra
    ? ERA_RECORD_FIELDS.map(({ key, label, icon }) => ({
        key,
        label: t(`profileSummary.${key}`, { defaultValue: label }),
        value: toLocale(users.latestUserEra.achievements?.[key] ?? 0),
        icon,
      }))
    : [];
  const statusLabel = isOnline
    ? t('profileSummary.online', { defaultValue: 'Online' })
    : userStatus === 'ACTIVE'
      ? t('profileSummary.offline', { defaultValue: 'Offline' })
      : userStatus;
  const hasBio = Boolean(users.bio?.trim());

  return (
    <MainArea
      title={t('profileSummary.pageTitle', { defaultValue: 'Player Profile' })}
    >
      <ProfileHero
        name={profile?.displayName}
        race={profile?.race}
        playerClass={profile?.class}
        avatar={profile?.avatar}
        level={profile?.level}
        rank={users?.rank}
        isOnline={isOnline}
        statusLabel={statusLabel}
        lastActive={lastActive}
      />

      <div className={profileClasses.sections}>
        {visibleAlliances.length > 0 && (
          <GameCard
            title={tAlliances('profile.title')}
            icon={<RpgAwesomeIcon icon="double-team" />}
          >
            <Group gap="xs">
              {visibleAlliances.map((alliance) => (
                <Badge
                  key={alliance.id}
                  component={Link}
                  href={`/alliances/${alliance.id}`}
                  variant={alliance.isLeader ? 'filled' : 'light'}
                  color={alliance.isLeader ? 'yellow' : undefined}
                  size="lg"
                  title={
                    alliance.isLeader
                      ? tAlliances('profile.leaderOf', { name: alliance.name })
                      : undefined
                  }
                  style={{ cursor: 'pointer' }}
                >
                  {alliance.name}
                </Badge>
              ))}
            </Group>
          </GameCard>
        )}

        <GameCard
          title={t('profileSummary.kingdom', {
            defaultValue: 'Kingdom Statistics',
          })}
          icon={<RpgAwesomeIcon icon="castle-flag" />}
        >
          <ProfileStatTiles stats={kingdomStats} />
        </GameCard>

        <GameCard
          title={t('profileSummary.actions', { defaultValue: 'Actions' })}
          icon={<RpgAwesomeIcon icon="crossed-swords" />}
        >
          {hideSidebar ||
          isOwnProfile ||
          (userStatus !== 'ACTIVE' && userStatus !== 'IDLE') ? (
            <div className={actionClasses.list}>
              <Button
                component={Link}
                href={`/recruit/${profile?.recruitingLink}`}
                classNames={actionClassNames}
                leftSection={<RpgAwesomeIcon icon="double-team" />}
                style={{
                  display: userStatus !== 'ACTIVE' ? 'none' : 'flex',
                }}
              >
                Recruit this Player
              </Button>
              <Button
                component={Link}
                href="/account/register"
                classNames={actionClassNames}
                leftSection={<RpgAwesomeIcon icon="castle-flag" />}
              >
                Join Now
              </Button>
            </div>
          ) : (
            <div className={actionClasses.list}>
              <Button
                component={Link}
                href={{
                  pathname: '/messaging',
                  query: {
                    composeToUserId: profile?.id,
                    composeToName: profile?.display_name,
                    composeToAvatar: profile?.avatar,
                  },
                }}
                classNames={actionClassNames}
                leftSection={<RpgAwesomeIcon icon="quill-ink" />}
                disabled={user?.id !== 1 && user?.id !== 2}
                onClick={(event) => {
                  if (user?.id !== 1 && user?.id !== 2) event.preventDefault();
                }}
              >
                Message this Player
              </Button>
              <Button
                type="button"
                onClick={toggleModal}
                disabled={!canAttack}
                aria-describedby={
                  attackReason ? 'profile-attack-reason' : undefined
                }
                classNames={actionClassNames}
                data-tone="danger"
                leftSection={<RpgAwesomeIcon icon="crossed-swords" />}
              >
                Attack this Player
              </Button>
              {!isOwnProfile && user?.id && (
                <AllianceListBadge targetUserId={profile.id} />
              )}
              {attackReason && (
                <Text
                  id="profile-attack-reason"
                  size="sm"
                  c="var(--ot-muted)"
                  my="xs"
                >
                  {attackReason}
                </Text>
              )}
              <Modal
                isOpen={isOpen}
                toggleModal={toggleModal}
                profileID={users.id}
              />

              <Button
                type="button"
                onClick={toggleSpyModal}
                disabled={!canSpy}
                aria-describedby={spyReason ? 'profile-spy-reason' : undefined}
                classNames={actionClassNames}
                data-tone="arcane"
                leftSection={<RpgAwesomeIcon icon="hood" />}
              >
                Spy Missions
              </Button>
              {spyReason && (
                <Text
                  id="profile-spy-reason"
                  size="sm"
                  c="var(--ot-muted)"
                  my="xs"
                >
                  {spyReason}
                </Text>
              )}
              <SpyMissionsModal
                isOpen={isSpyModalOpen}
                toggleModal={toggleSpyModal}
                defenderID={profile?.id}
              />
              {recruitBlockReason ? (
                <Tooltip
                  label={recruitBlockReason}
                  events={{ hover: true, focus: true, touch: true }}
                >
                  <Button
                    classNames={actionClassNames}
                    leftSection={<RpgAwesomeIcon icon="double-team" />}
                    data-disabled
                    aria-disabled
                    onClick={(event) => event.preventDefault()}
                  >
                    Recruit this Player
                  </Button>
                </Tooltip>
              ) : (
                <Button
                  component={Link}
                  href={`/recruit/${profile?.recruitingLink}`}
                  classNames={actionClassNames}
                  leftSection={<RpgAwesomeIcon icon="double-team" />}
                >
                  Recruit this Player
                </Button>
              )}
              {socialEnabled && (
                <>
                  {friendStatus === 'pending_incoming' ? (
                    <div
                      className="friend-request-button-group"
                      style={{
                        backgroundColor: 'var(--ot-inset)',
                        borderRadius: '6px',
                        border: '1px solid var(--ot-line)',
                        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                      }}
                    >
                      <div className="friend-request-status">
                        {friendStatusDisplay.text}
                      </div>
                      <div className="friend-request-buttons-container">
                        <UnstyledButton
                          type="button"
                          onClick={async () => {
                            if (isFriendLoading) return;

                            setIsFriendLoading(true);
                            try {
                              const res = await fetch('/api/social/respond', {
                                method: 'PUT',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  requestId: friendRelationship.id,
                                  action: 'accept',
                                }),
                              });

                              if (res.ok) {
                                alertService.success('Friend request accepted');
                                await fetchFriendRelationship();
                                forceUpdate();
                              } else {
                                const error = await res.json();
                                alertService.error(
                                  error.error ||
                                    'Failed to accept friend request',
                                );
                              }
                            } catch {
                              alertService.error(
                                'Failed to accept friend request',
                              );
                            } finally {
                              setIsFriendLoading(false);
                            }
                          }}
                          className={`friend-request-button accept ${isFriendLoading ? 'loading' : ''}`}
                          disabled={isFriendLoading}
                        >
                          {isFriendLoading ? (
                            <div className="flex items-center justify-center">
                              <svg
                                className="-ml-1 mr-2 size-4 animate-spin text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Accepting...
                            </div>
                          ) : (
                            'Accept'
                          )}
                        </UnstyledButton>
                        <UnstyledButton
                          type="button"
                          onClick={async () => {
                            if (isFriendLoading) return;

                            setIsFriendLoading(true);
                            try {
                              const res = await fetch('/api/social/respond', {
                                method: 'PUT',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  requestId: friendRelationship.id,
                                  action: 'decline',
                                }),
                              });

                              if (res.ok) {
                                alertService.success('Friend request declined');
                                await fetchFriendRelationship();
                                forceUpdate();
                              } else {
                                const error = await res.json();
                                alertService.error(
                                  error.error ||
                                    'Failed to decline friend request',
                                );
                              }
                            } catch {
                              alertService.error(
                                'Failed to decline friend request',
                              );
                            } finally {
                              setIsFriendLoading(false);
                            }
                          }}
                          className={`friend-request-button decline ${isFriendLoading ? 'loading' : ''}`}
                          disabled={isFriendLoading}
                        >
                          {isFriendLoading ? (
                            <div className="flex items-center justify-center">
                              <svg
                                className="-ml-1 mr-2 size-4 animate-spin text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Declining...
                            </div>
                          ) : (
                            'Decline'
                          )}
                        </UnstyledButton>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={friendStatusDisplay.action}
                      data-tone={
                        friendStatus === 'pending_outgoing'
                          ? undefined
                          : friendStatus === 'friend'
                            ? 'danger'
                            : 'gold'
                      }
                      leftSection={<RpgAwesomeIcon icon="two-hearts" />}
                      loading={isFriendLoading}
                      disabled={isOwnProfile}
                      fullWidth
                      classNames={actionClassNames}
                    >
                      {friendStatusDisplay.button}
                    </Button>
                  )}

                  {friendStatus === 'friend' && (
                    <>
                      <UnstyledButton
                        type="button"
                        className="profile-nav-link"
                        style={{ display: 'block' }}
                        onClick={() => setIsTransferModalOpen(true)}
                      >
                        Transfer Gold
                      </UnstyledButton>
                      <UnstyledButton
                        type="button"
                        className="profile-nav-link"
                        style={{ display: 'block' }}
                        onClick={() => setIsRequestModalOpen(true)}
                      >
                        Request Gold
                      </UnstyledButton>
                    </>
                  )}
                </>
              )}

              {/* Enemy functionality - only shown when enabled */}
              {socialEnabled && enableEnemies && (
                <Button
                  type="button"
                  onClick={async () => {
                    if (isEnemyLoading) return;

                    setIsEnemyLoading(true);
                    try {
                      const action = enemyRelationship ? 'remove' : 'add';
                      const res = await fetch(`/api/social/${action}`, {
                        method: action === 'add' ? 'POST' : 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          friendId: profile.id,
                          relationshipType: 'ENEMY',
                        }),
                      });

                      if (res.ok) {
                        alertService.success(
                          enemyRelationship
                            ? 'Enemy status removed'
                            : 'Player declared as enemy',
                        );
                        await fetchEnemyRelationship();
                        forceUpdate();
                      } else {
                        const error = await res.json();
                        alertService.error(
                          error.error ||
                            `Failed to ${enemyRelationship ? 'remove enemy' : 'declare enemy'}`,
                        );
                      }
                    } catch {
                      alertService.error(
                        `Failed to ${enemyRelationship ? 'remove enemy' : 'declare enemy'}`,
                      );
                    } finally {
                      setIsEnemyLoading(false);
                    }
                  }}
                  data-tone={enemyRelationship ? undefined : 'ember'}
                  leftSection={<RpgAwesomeIcon icon="skull" />}
                  loading={isEnemyLoading}
                  disabled={isOwnProfile}
                  fullWidth
                  classNames={actionClassNames}
                >
                  {enemyRelationship ? 'Remove Enemy' : 'Declare Enemy'}
                </Button>
              )}
            </div>
          )}
        </GameCard>

        {eraRecord && (
          <GameCard
            title={t('profileSummary.eraRecord', {
              defaultValue: 'Era {{era}} Record',
              era: eraRecord.eraId,
            })}
            icon={<RpgAwesomeIcon icon="trophy" />}
          >
            {tookPartInEra ? (
              <ProfileStatTiles stats={eraStats} columns={3} />
            ) : (
              <Text c="var(--ot-muted)" fs="italic">
                {t('profileSummary.eraNotPlayed', {
                  defaultValue: 'Did not take part in Era {{era}}.',
                  era: eraRecord.eraId,
                })}
              </Text>
            )}
          </GameCard>
        )}

        {hasBio && (
          <GameCard
            title={t('profileSummary.biography', { defaultValue: 'Biography' })}
            icon={<RpgAwesomeIcon icon="scroll-unfurled" />}
          >
            <div className={profileClasses.bio}>
              <MDXRemote {...users.bionew} />
            </div>
          </GameCard>
        )}

        {socialEnabled && isOwnProfile && (
          <GameCard
            title="Top Friends"
            icon={<RpgAwesomeIcon icon="two-hearts" />}
          >
            {friendsLoading ? (
              <Loader size="sm" />
            ) : (
              <SimpleGrid cols={3} spacing={4}>
                {friendsList}
              </SimpleGrid>
            )}
          </GameCard>
        )}
      </div>

      <ConfirmationModal
        isOpen={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        onConfirm={handleConfirmRemoveFriend}
        title="Remove Friend"
        message={`Are you sure you want to remove ${profile.displayName} from your friends list?`}
        confirmText="Remove Friend"
        cancelText="Cancel"
        isLoading={isFriendLoading}
        type="remove"
      />

      {friendStatus === 'friend' && (
        <GoldTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          targetUserId={profile.id}
          targetUserName={profile.displayName}
          userGold={user.gold}
          onTransferComplete={() => {
            alertService.success('Gold transfer completed successfully');
            forceUpdate();
          }}
        />
      )}

      {friendStatus === 'friend' && (
        <GoldRequestModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          targetUserId={profile.id}
          targetUserName={profile.displayName}
          onRequestComplete={() => {
            alertService.success('Gold request sent successfully');
            forceUpdate();
          }}
        />
      )}
    </MainArea>
  );
};

export const getServerSideProps = async ({ query, locale, req, res }) => {
  let recruitLink = '';
  let id: number | null = null;

  if (Number.isNaN(Number(query.id))) {
    recruitLink = query.id;
    id = null;
  } else {
    id = parseInt(query.id, 10);
  }

  if (!recruitLink && (id === null || id === 0)) {
    return { notFound: true };
  }

  const whereCondition = id ? { id } : { recruit_link: recruitLink };
  const [user, userService] = await Promise.all([
    prisma.users.findFirst({
      where: whereCondition,
      include: {
        currentEra: true,
        userEras: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    import('@/services/User.service'),
  ]);

  if (!user) {
    return { notFound: true };
  }

  const { getUpdatedStatus } = userService;

  const {
    password_hash: _passwordHash,
    email: _email,
    userEras: _userEras,
    ...userWithoutPassword
  } = user;

  const lastActiveDate = user.last_active ? new Date(user.last_active) : null;
  const lastActiveStr =
    lastActiveDate && !isNaN(lastActiveDate.getTime())
      ? lastActiveDate.toISOString()
      : null;

  const createdAtDate = user.created_at ? new Date(user.created_at) : null;
  const createdAtStr =
    createdAtDate && !isNaN(createdAtDate.getTime())
      ? createdAtDate.toISOString()
      : null;

  const updatedAtDate = user.updated_at ? new Date(user.updated_at) : null;
  const updatedAtStr =
    updatedAtDate && !isNaN(updatedAtDate.getTime())
      ? updatedAtDate.toISOString()
      : null;

  const bioContent = user.bio ?? '';

  const serializeBioSafe = async () => {
    try {
      return await serialize(bioContent);
    } catch (error) {
      logError('Error serializing user bio', error, { userId: user.id });
      return await serialize('');
    }
  };

  const [status, serializedBio] = await Promise.all([
    getUpdatedStatus(user.id),
    serializeBioSafe(),
  ]);

  const defensePressureDate = user.defense_pressure_date
    ? new Date(user.defense_pressure_date)
    : null;
  const defensePressureDateStr =
    defensePressureDate && !isNaN(defensePressureDate.getTime())
      ? defensePressureDate.toISOString()
      : null;

  const activeEra = await prisma.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
    select: { startDate: true },
  });
  const userData = {
    attackEligible:
      ['ACTIVE', 'IDLE'].includes(status) &&
      hasParticipatedInEra(user.last_active, activeEra?.startDate),
    ...userWithoutPassword,
    bionew: serializedBio,
    gold: user.gold.toString(),
    gold_in_bank: user.gold_in_bank.toString(),
    last_active: lastActiveStr,
    created_at: createdAtStr,
    updated_at: updatedAtStr,
    defense_pressure_date: defensePressureDateStr,
    status,
    currentEra: serializeDates(user.currentEra),
    latestUserEra: serializeDates(
      user.userEras && user.userEras.length > 0 ? user.userEras[0] : null,
    ),
  };

  const translations = await serverSideTranslations(locale ?? 'en', [
    'common',
    'navigation',
    'allianceLists',
    'alliances',
  ]);

  // Only alliances whose roster is PUBLIC, or that the viewer belongs to.
  const session = await getServerSession(req, res, authOptions);
  const sessionUserId = Number(session?.user?.id);
  const visibleAlliances = await AllianceService.getVisibleAlliancesForPlayer(
    user.id,
    Number.isSafeInteger(sessionUserId) ? sessionUserId : null,
  );

  return {
    props: {
      ...translations,
      users: serializeDates(userData),
      visibleAlliances,
    },
  };
};

export default Index;
