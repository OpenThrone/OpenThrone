import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { InferGetServerSidePropsType } from "next";
import { MDXRemote, MDXRemoteSerializeResult } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import { AccountStatus } from '@prisma/client'; // Import AccountStatus
import { JsonValue } from '@prisma/client/runtime/library'; // Import JsonValue
import { Avatar, Badge, Container, Flex, Group, Indicator, Loader, SimpleGrid, Space, Table, Text } from '@mantine/core';

import Modal from '@/components/modal';
import SpyMissionsModal from '@/components/spyMissionsModal';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GoldTransferModal } from '@/components/GoldTransferModal';
import { GoldRequestModal } from '@/components/GoldRequestModal';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { alertService } from '@/services/Alert.service';
import { Fortifications } from '@/constants';
import toLocale from '@/utils/numberFormatting';
import { serializeDates } from '@/utils/utilities';
import FriendCard from '@/components/friendCard';
import MainArea from '@/components/MainArea';
import { logDebug, logError } from '@/utils/logger';

interface UserProfileServerData {
  id: number;
  email: string;
  display_name: string;
  race: string;
  class: string;
  units: JsonValue | null;
  experience: number;
  gold: string;
  gold_in_bank: string;
  fort_level: number;
  fort_hitpoints: number;
  attack_turns: number;
  last_active: string | null;
  rank: number;
  items: JsonValue | null;
  house_level: number;
  battle_upgrades: JsonValue | null;
  structure_upgrades: JsonValue | null;
  bonus_points: JsonValue | null;
  bio: string;
  colorScheme: string | null;
  recruit_link: string;
  locale: string;
  economy_level: number;
  avatar: string | null;
  created_at: string | null;
  updated_at: string | null;
  stats: JsonValue | null;
  killing_str: number | null;
  defense_str: number | null;
  spying_str: number | null;
  sentry_str: number | null;
  offense: number | null;
  defense: number | null;
  spy: number | null;
  sentry: number | null;
  bionew: MDXRemoteSerializeResult<Record<string, unknown>, Record<string, unknown>>;
  status: AccountStatus | string;
  currentEra?: any;
  latestUserEra?: any;
  twoFactorSecret?: string;
  mercenaries?: JsonValue;

  // Additional optional properties that may be present from various DB queries or mocks
  userEras?: any;
  currentEraId?: number | null;
  achievements?: JsonValue | null;
}

interface IndexProps {
  users: UserProfileServerData; // Use the new interface
}

// The component receives props matching IndexProps (which uses UserProfileServerData)
const Index = ({ users }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [hideSidebar, setHideSidebar] = useState(true);
  const {user, forceUpdate} = useUser();
  const [isPlayer, setIsPlayer] = useState(false);
  const [isAPlayer, setIsAPlayer] = useState(false);

  const [profile, setUser] = useState<UserModel>(() => new UserModel(users as any, true, false));
  const [canAttack, setCanAttack] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [lastActive, setLastActive] = useState( 'Never logged in');
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [userStatus, setUserStatus] = useState('OFFLINE');
  const [socialEnabled, setSocialEnabled] = useState(false);
  // State to control the Spy Missions Modal
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);
  
  // Friend request states
  const [friendRelationship, setFriendRelationship] = useState(null);
  const [isFriendLoading, setIsFriendLoading] = useState(false);

  // Gold transfer modal states
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // Enemy relationship states
  const [enemyRelationship, setEnemyRelationship] = useState(null);
  const [isEnemyLoading, setIsEnemyLoading] = useState(false);

  // Confirmation modal states
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Feature flags
  const enableEnemies = process.env.NEXT_PUBLIC_ENABLE_ENEMIES === 'true';

  useEffect(() => {
    if (user) {
      setIsAPlayer(true);
      setHideSidebar(false);
    }
  }, [user])

  useEffect(() => {
    setUserStatus(users.status);
  }, [users]);

  useEffect(() => {
    fetch('/api/social/listAll?type=FRIEND&limit=5&playerId=' + profile.id)
      .then(response => response.json())
      .then(data => {
        console.log('Friends data:', data);
        setFriends(data);
        setLoading(false);
      });
  }, [profile.id]);

  const fetchFriendRelationship = useCallback(async () => {
    if (!user || !profile.id || user.id === profile.id) return;
    setIsFriendLoading(true);
    try {
      const response = await fetch(`/api/social/relationship?userId=${user.id}&targetUserId=${profile.id}`);
      if (response.ok) {
        const data = await response.json();
        setFriendRelationship(data.relationship);
      }
    } catch (error) {
      console.error('Error fetching friend relationship:', error);
    } finally {
      setIsFriendLoading(false);
    }
  }, [profile.id, user]);

  const fetchEnemyRelationship = useCallback(async () => {
    if (!user || !profile.id || user.id === profile.id || !enableEnemies) return;
    setIsEnemyLoading(true);
    try {
      const response = await fetch(`/api/social/relationship?userId=${user.id}&targetUserId=${profile.id}`);
      if (response.ok) {
        const data = await response.json();
        // Filter for enemy relationship only
        if (data.relationship && data.relationship.relationshipType === 'ENEMY') {
          setEnemyRelationship(data.relationship);
        } else {
          setEnemyRelationship(null);
        }
      }
    } catch (error) {
      console.error('Error fetching enemy relationship:', error);
    } finally {
      setIsEnemyLoading(false);
    }
  }, [enableEnemies, profile.id, user]);

  // Fetch friend relationship status
  useEffect(() => {
    fetchFriendRelationship();
  }, [fetchFriendRelationship]);

  // Force refresh friend relationship when friends list changes
  useEffect(() => {
    if (friends.length > 0) {
      fetchFriendRelationship();
    }
  }, [fetchFriendRelationship, friends.length]);

  // Fetch enemy relationship status
  useEffect(() => {
    fetchEnemyRelationship();
  }, [fetchEnemyRelationship]);

  // Force refresh enemy relationship when needed
  useEffect(() => {
    if (friends.length > 0) {
      fetchEnemyRelationship();
    }
  }, [fetchEnemyRelationship, friends.length]);

  const toggleModal = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (profile.id !== users.id) setUser(new UserModel(users as any, true, false)); // you're looking at someone else
    if (user?.id === profile.id) setIsPlayer(true); // you're looking at yourself
    if (!isPlayer && user) setCanAttack(user.canAttack(profile.level));

    // Prefer the canonical server-provided value when available (users.last_active).
    // Fallback to the model's last_active when the server prop is absent.
    if (profile) {
      const nowdate = new Date();

      // Resolve last-active safely without calling toISOString() on an invalid Date object.
      let rawLastActive: string | null = null;
      if (users && users.last_active) {
        rawLastActive = users.last_active;
      } else if (user && user.last_active) {
        // user (from context) stores last_active as a Date | null on the UserModel
        if (user.last_active instanceof Date && !isNaN(user.last_active.getTime())) {
          rawLastActive = user.last_active.toISOString();
        } else if (typeof user.last_active === 'string') {
          rawLastActive = user.last_active;
        }
      } else if (profile && profile.last_active) {
        const p = profile.last_active;
        if (p instanceof Date) {
          if (!isNaN(p.getTime())) rawLastActive = p.toISOString();
        } else {
          // attempt to parse non-Date values defensively
          const parsed = new Date(p as any);
          if (!isNaN(parsed.getTime())) rawLastActive = parsed.toISOString();
        }
      }

      // Debugging info for last_active propagation
      logDebug('userprofile last_active check ->', {
        users_last_active: users?.last_active,
        profile_last_active: profile?.last_active,
        rawLastActive,
      });

      // Handle missing/null/invalid last_active safely
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
        // Defensive fallback for malformed dates
        setIsOnline(false);
        setLastActive('Never logged in');
      }
    }

    if(process.env.NEXT_PUBLIC_ENABLE_SOCIAL) {
      setSocialEnabled(true);
    }
  }, [profile, users, user, isPlayer]);

  if (loading) return <Loader />;
  if (!profile) return <p>User not found</p>;

  // Show status message for blocked statuses
  const blockedStatuses = ["BANNED", "SUSPENDED", "CLOSED", "TIMEOUT"]; //"IDLE",
  if (blockedStatuses.includes(userStatus)) {
    let statusMessage = "";
    switch (userStatus) {
      case "IDLE":
        statusMessage = "This account is currently idle.";
        break;
      case "BANNED":
        statusMessage = "This account has been banned.";
        break;
      case "SUSPENDED":
        statusMessage = "This account is suspended.";
        break;
      case "CLOSED":
        statusMessage = "This account has been closed.";
        break;
      case "TIMEOUT":
        statusMessage = "This account is in timeout.";
        break;
      default:
        statusMessage = "This account is unavailable.";
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
        body: JSON.stringify({ friendId: profile.id, relationshipType: 'FRIEND' }),
      });

      if (res.ok) {
        alertService.success('Friend request sent successfully');
        await fetchFriendRelationship();
        forceUpdate();
      } else {
        const error = await res.json();
        alertService.error(error.error || 'Failed to add friend');
      }
    } catch (error) {
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
        body: JSON.stringify({ friendId: profile.id, relationshipType: 'FRIEND' }),
      });

      if (res.ok) {
        alertService.success('Friend request cancelled');
        await fetchFriendRelationship();
        forceUpdate();
      } else {
        const error = await res.json();
        alertService.error(error.error || 'Failed to cancel friend request');
      }
    } catch (error) {
      alertService.error('Failed to cancel friend request');
    } finally {
      setIsFriendLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (isFriendLoading) return;
    
    setPendingAction('remove');
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
          relationshipType: 'FRIEND'
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
    } catch (error) {
      alertService.error('Failed to remove friend');
    } finally {
      setIsFriendLoading(false);
      setShowConfirmationModal(false);
    }
  };

  // Get friend relationship status
  const getFriendStatus = () => {
    logDebug('Evaluating friend relationship:', friendRelationship);
    if (!friendRelationship) return 'neutral';
    
    if (friendRelationship.status === 'requested') {
      // Check if this is an outgoing or incoming request
      if (friendRelationship.playerId === user.id) {
        return 'pending_outgoing';
      } else {
        return 'pending_incoming';
      }
    }
    
    if (friendRelationship.status === 'accepted') {
      return 'friend';
    }
    
    return 'neutral';
  };

  // Get friend status display
  const getFriendStatusDisplay = () => {
    const status = getFriendStatus();
    logDebug('Friend status:', status);
    switch (status) {
      case 'pending_outgoing':
        return {
          text: 'Friend Request is Pending',
          button: 'Cancel Friend Request',
          action: handleCancelFriendRequest,
          type: 'cancel'
        };
      case 'pending_incoming':
        return {
          text: 'Friend Request from ' + profile.displayName,
          button: 'Accept',
          action: () => {}, // Will be handled by accept button
          type: 'accept'
        };
      case 'friend':
        return {
          text: 'Friends with ' + profile.displayName,
          button: 'Remove Friend',
          action: handleRemoveFriend,
          type: 'remove'
        };
      default:
        return {
          text: '',
          button: 'Add to Friends List',
          action: handleAddFriend,
          type: 'add'
        };
    }
  };

  // Function to toggle the Spy Missions Modal
  const toggleSpyModal = () => {
    setIsSpyModalOpen(!isSpyModalOpen);
  };

  // Don't show friend buttons on own profile, and only show Add/Remove appropriately
  const isOwnProfile = user?.id === profile.id;
  const friendStatus = getFriendStatus();
  const friendStatusDisplay = getFriendStatusDisplay();

  const friendsList = friends.length > 0 ? friends.map(friend => {
    logDebug("Received friend info:", friend);
    const player = new UserModel(friend.friend, true, false);
    return (
      <FriendCard key={player.id} player={player} />
    );
  }) : <p>No friends found.</p>;
  return (
    <MainArea title={profile?.displayName}>
      <Container className="container mx-auto">
        <Text className="text-center">
          <span className="text-white">{profile?.displayName}</span> is a{profile.race === 'ELF' || profile.race === 'UNDEAD' ? 'n ':' '}
          {profile?.race} {profile?.class}
        </Text>
      </Container>
      <Space h='lg' />
      <Flex justify='space-around'>
        <p className="mb-0">Level: {profile?.level}</p>
        <p className="mb-0">Overall Rank: {users?.rank}</p>
        {users.currentEra && (
          <p className="mb-0">Current Era: {users.currentEra.name}</p>
        )}
      </Flex>

      <Space h='lg' />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="col-span-1">
          <GameCard title="Profile">
            <div className="flex items-center justify-center">
              <Image
                src={profile?.avatar}
                style={{ width: '100%', height: 'auto', marginLeft: 2 }}
                alt="avatar"
                width={484}
                height={484}
              />
            </div>
            <div className="my-3 mb-4">
              <MDXRemote {...users.bionew} />
            </div>
          </GameCard>

          <SimpleGrid cols={2} mt="md">
            <GameCard title="Status">
              {isOnline ? (
                <div className="alert alert-success">
                  <h6>Online</h6>
                </div>
              ) : (
                <div className="alert alert-error">
                  <h6>{userStatus === 'ACTIVE' ? 'OFFLINE' : userStatus}</h6>
                </div>
              )}
            </GameCard>
            <GameCard title="Last Online">
              <Text size="sm">{lastActive}</Text>
            </GameCard>
          </SimpleGrid>
        </div>
        <div className="col-span-1">
          <GameCard title="Actions">
            {hideSidebar || isPlayer || userStatus !== 'ACTIVE' && userStatus !== 'IDLE' ? (
              <div className="list-group mb-4">
                <Link
                  href={`/recruit/${profile?.recruitingLink}`}
                  className="profile-nav-link"
                  style={{ display: userStatus !== 'ACTIVE' ? 'none' : 'block' }}
                >
                  Recruit this Player
                </Link>
                <Link
                  href={'/account/register'}
                  className="profile-nav-link"
                >Join Now</Link>
              </div>
            ) : (
              <div className="list-group mb-4">
                <Link
                  href={{
                    pathname: "/messaging",
                    query: {
                      composeToUserId: profile?.id,
                      composeToName: profile?.display_name,
                      composeToAvatar: profile?.avatar,
                    },
                  }}
                  className={`profile-nav-link ${user?.id === 1 || user?.id === 2 ? '' : 'disabled'}`}
                >
                  Message this Player
                </Link>
                <button
                  type="button"
                  onClick={toggleModal}
                  className={`profile-nav-link ${canAttack ? '' : 'disabled'}`}
                >
                  Attack this Player
                </button>
                <Modal
                  isOpen={isOpen}
                  toggleModal={toggleModal}
                  profileID={users.id}
                />

                <button
                  type='button'
                  onClick={toggleSpyModal}
                  className={`profile-nav-link ${canAttack ? '' : 'disabled'}`}
                >
                  Spy Missions
                </button>
                <SpyMissionsModal
                  isOpen={isSpyModalOpen}
                  toggleModal={toggleSpyModal}
                  defenderID={profile?.id}
                />
                <Link
                  href={`/recruit/${profile?.recruitingLink}`}
                  className="profile-nav-link"
                >
                  Recruit this Player
                </Link>
                {socialEnabled && (
                  <>
                    {friendStatus === 'pending_incoming' ? (
                      <div
                        className="friend-request-button-group"
                        style={{
                          backgroundColor: '#0f141a',
                          borderRadius: '6px',
                          border: '1px solid #1f2b3b',
                          boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                        }}
                      >
                        <div className="friend-request-status">
                          {friendStatusDisplay.text}
                        </div>
                        <div className="friend-request-buttons-container">
                          <button
                            type="button"
                            onClick={async () => {
                              if (isFriendLoading) return;

                              setIsFriendLoading(true);
                              try {
                                const res = await fetch('/api/social/respond', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    requestId: friendRelationship.id,
                                    action: 'accept'
                                  }),
                                });

                                if (res.ok) {
                                  alertService.success('Friend request accepted');
                                  await fetchFriendRelationship();
                                  forceUpdate();
                                } else {
                                  const error = await res.json();
                                  alertService.error(error.error || 'Failed to accept friend request');
                                }
                              } catch (error) {
                                alertService.error('Failed to accept friend request');
                              } finally {
                                setIsFriendLoading(false);
                              }
                            }}
                            className={`friend-request-button accept ${isFriendLoading ? 'loading' : ''}`}
                            disabled={isFriendLoading}
                          >
                            {isFriendLoading ? (
                              <div className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Accepting...
                              </div>
                            ) : 'Accept'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (isFriendLoading) return;

                              setIsFriendLoading(true);
                              try {
                                const res = await fetch('/api/social/respond', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    requestId: friendRelationship.id,
                                    action: 'decline'
                                  }),
                                });

                                if (res.ok) {
                                  alertService.success('Friend request declined');
                                  await fetchFriendRelationship();
                                  forceUpdate();
                                } else {
                                  const error = await res.json();
                                  alertService.error(error.error || 'Failed to decline friend request');
                                }
                              } catch (error) {
                                alertService.error('Failed to decline friend request');
                              } finally {
                                setIsFriendLoading(false);
                              }
                            }}
                            className={`friend-request-button decline ${isFriendLoading ? 'loading' : ''}`}
                            disabled={isFriendLoading}
                          >
                            {isFriendLoading ? (
                              <div className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Declining...
                              </div>
                            ) : 'Decline'}
                          </button>
                        </div>
                      </div>
                    ) : (
                    <button
                      type="button"
                      onClick={friendStatusDisplay.action}
                      className={`profile-nav-link ${
                        friendStatus === 'pending_outgoing' ? 'bg-yellow-600 hover:bg-yellow-700' :
                        friendStatus === 'friend' ? 'bg-red-600 hover:bg-red-700' :
                        'bg-green-600 hover:bg-green-700'
                      } ${isFriendLoading || isOwnProfile ? 'opacity-75 cursor-not-allowed' : ''}`}
                      disabled={isFriendLoading || isOwnProfile}
                    >
                      {isFriendLoading ? (
                        <div className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </div>
                      ) : friendStatusDisplay.button}
                    </button>
                  )}
                  
                  {friendStatus === 'friend' && (
                    <>
                      <button
                        type="button"
                        className="profile-nav-link"
                        style={{ display: 'block' }}
                        onClick={() => setIsTransferModalOpen(true)}
                      >
                        Transfer Gold
                      </button>
                      <button
                        type="button"
                        className="profile-nav-link"
                        style={{ display: 'block' }}
                        onClick={() => setIsRequestModalOpen(true)}
                      >
                        Request Gold
                      </button>
                    </>
                  )}
                </>
                )}

                {/* Enemy functionality - only shown when enabled */}
                {socialEnabled && enableEnemies && (
                  <button
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
                            relationshipType: 'ENEMY'
                          }),
                        });

                        if (res.ok) {
                          alertService.success(
                            enemyRelationship
                              ? 'Enemy status removed'
                              : 'Player declared as enemy'
                          );
                          await fetchEnemyRelationship();
                          forceUpdate();
                        } else {
                          const error = await res.json();
                          alertService.error(error.error || `Failed to ${enemyRelationship ? 'remove enemy' : 'declare enemy'}`);
                        }
                      } catch (error) {
                        alertService.error(`Failed to ${enemyRelationship ? 'remove enemy' : 'declare enemy'}`);
                      } finally {
                        setIsEnemyLoading(false);
                      }
                    }}
                    className={`profile-nav-link ${
                      enemyRelationship ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
                    } ${isEnemyLoading || isOwnProfile ? 'opacity-75 cursor-not-allowed' : ''}`}
                    disabled={isEnemyLoading || isOwnProfile}
                  >
                    {isEnemyLoading ? (
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </div>
                    ) : enemyRelationship ? 'Remove Enemy' : 'Declare Enemy'}
                  </button>
                )}
            </div>
          )}
          </GameCard>
          {socialEnabled && (
            <GameCard title="Top Friends" mt="md">
              <SimpleGrid cols={3} spacing={4}>
                {friendsList}
              </SimpleGrid>
            </GameCard>
          )}
          <GameCard title="Statistics" mt="md">
            <StyledTable headers={['Stat', 'Value']}>
              <Table.Tr style={{ background: '#0f141a' }}>
                <Table.Td style={{ borderColor: '#1f2b3b' }}>Population</Table.Td>
                <Table.Td style={{ borderColor: '#1f2b3b' }}>{profile?.population?.toLocaleString()}</Table.Td>
              </Table.Tr>
              <Table.Tr style={{ background: '#0f141a' }}>
                <Table.Td style={{ borderColor: '#1f2b3b' }}>Army Size</Table.Td>
                <Table.Td style={{ borderColor: '#1f2b3b' }}>{profile?.armySize?.toLocaleString()}</Table.Td>
              </Table.Tr>
              <Table.Tr style={{ background: '#0f141a' }}>
                <Table.Td style={{ borderColor: '#1f2b3b' }}>Fortification</Table.Td>
                <Table.Td style={{ borderColor: '#1f2b3b' }}>{Fortifications.find((fort) => fort.level === profile?.fortLevel).name}</Table.Td>
              </Table.Tr>
              <Table.Tr style={{ background: '#0f141a' }}>
                <Table.Td style={{ borderColor: '#1f2b3b' }}>Gold</Table.Td>
                <Table.Td style={{ borderColor: '#1f2b3b' }}>{toLocale(profile?.gold)}</Table.Td>
              </Table.Tr>
            </StyledTable>
          </GameCard>
        
          {users.latestUserEra && (
            <GameCard title="Achievements" mt="md">
              <ul>
                {Object.entries(users.latestUserEra.achievements).map(([key, value]) => (
                  <li key={key}>
                    {key}: {String(value)}
                  </li>
                ))}
              </ul>
            </GameCard>
          )}
        </div>
      </div>
      
      {/* Confirmation Modal for removing friend */}
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

      {/* Gold Transfer Modal */}
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

      {/* Gold Request Modal */}
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

export const getServerSideProps = async ({ query }) => {
  let recruitLink = '';
  let id;

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
  const user = await prisma.users.findFirst({
    where: whereCondition,
    include: {
      currentEra: true,
      userEras: {
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!user) {
    return { notFound: true };
  }

  const { getUpdatedStatus } = await import('@/services/User.service');

  const { password_hash, email, ...userWithoutPassword } = user;

  // Safely serialize dates coming from the database. Some callers (or mocks) may supply
  // non-Date values, so validate before calling toISOString().
  const lastActiveDate = user.last_active ? new Date(user.last_active) : null;
  const lastActiveStr = lastActiveDate && !isNaN(lastActiveDate.getTime()) ? lastActiveDate.toISOString() : null;

  const createdAtDate = user.created_at ? new Date(user.created_at) : null;
  const createdAtStr = createdAtDate && !isNaN(createdAtDate.getTime()) ? createdAtDate.toISOString() : null;

  const updatedAtDate = user.updated_at ? new Date(user.updated_at) : null;
  const updatedAtStr = updatedAtDate && !isNaN(updatedAtDate.getTime()) ? updatedAtDate.toISOString() : null;

  let serializedBio;
  const bioContent = user.bio ?? '';

  try {
    serializedBio = await serialize(bioContent);
  } catch (error) {
    logError('Error serializing user bio', error, { userId: user.id });
    serializedBio = await serialize('');
  }

  const userData = {
    ...userWithoutPassword,
    bionew: serializedBio,
    gold: user.gold.toString(),
    gold_in_bank: user.gold_in_bank.toString(),
    last_active: lastActiveStr,
    created_at: createdAtStr,
    updated_at: updatedAtStr,
    status: await getUpdatedStatus(user.id),
    currentEra: serializeDates(user.currentEra),
    latestUserEra: serializeDates((user.userEras && user.userEras.length > 0) ? user.userEras[0] : null),
  };

  return { props: { users: userData } };
};

export default Index;
