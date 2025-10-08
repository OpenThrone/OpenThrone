import Link from 'next/link';
import { MDXRemote, MDXRemoteSerializeResult } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import React, { useEffect, useState } from 'react';
import { AccountStatus } from '@prisma/client'; // Import AccountStatus
import { JsonValue } from '@prisma/client/runtime/library'; // Import JsonValue

import Modal from '@/components/modal';
import SpyMissionsModal from '@/components/spyMissionsModal';
import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { alertService, getUpdatedStatus } from '@/services';
import { Fortifications } from '@/constants';
import toLocale from '@/utils/numberFormatting';
import { Table, Loader, Group, Paper, Avatar, Badge, Text, Indicator, SimpleGrid, Center, Space, Flex, Container } from '@mantine/core';
import { InferGetServerSidePropsType } from "next";
import Image from 'next/image';
import FriendCard from '@/components/friendCard';
import MainArea from '@/components/MainArea';
import { logDebug } from '@/utils/logger';

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

  // If we don't know lastActive, continue rendering the profile but show offline status in UI.
  const handleAddFriend = async () => {
    const res = await fetch('/api/social/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: profile.id, relationshipType: 'FRIEND' }),
    });

    if (res.ok) {
      alertService.success('Friend added successfully');
      forceUpdate();
    } else {
      alertService.error('Failed to add friend');
    }
  };

  const handleAddEnemy = async () => {
    const res = await fetch('/api/social/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: profile.id, relationshipType: 'ENEMY' }),
    });

    if (res.ok) {
      alertService.success('Friend added successfully');
      forceUpdate();
    } else {
      alertService.error('Failed to add friend');
    }
  };

  const handleRequestTruce = async () => {
    const res = await fetch('/api/social/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: profile.id, relationshipType: 'TRUCE' }),
    });

    if (res.ok) {
      alertService.success('Truce requested successfully');
      forceUpdate();
    } else {
      alertService.error('Failed to request truce');
    }
  }

  const handleRemoveFriend = async () => {
    const res = await fetch('/api/social/remove', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: profile.id }),
    });

    if (res.ok) {
      alertService.success('Friend removed successfully');
      forceUpdate();
    } else {
      alertService.error('Failed to remove friend');
    }
  };

  // Function to toggle the Spy Missions Modal
  const toggleSpyModal = () => {
    setIsSpyModalOpen(!isSpyModalOpen);
  };

  // Don't show friend buttons on own profile, and only show Add/Remove appropriately
  const isOwnProfile = user?.id === profile.id;
  const isFriend = friends.some(friend => friend.friend.id === user?.id);

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
          <Paper>
            <div className="flex items-center justify-center">
                <Image
                  src={profile?.avatar}
                style={{ width: '100%', height: 'auto', marginLeft: 2 }}
                alt='avatar'
                  width={484}
                  height={484}
                />
              
            </div>
            <div className="my-3 mb-4">
              <MDXRemote {...users.bionew} />
          </div>

          </Paper>

          <SimpleGrid cols={2}>
          <Paper>
            <div className="card-header-dark">
              <h6 className="border-light border-b-2 p-2 font-bold">Status</h6>
            </div>
            <div className="card-body">
              {isOnline ? (
                <div className="alert alert-success">
                  <h6>Online</h6>
                </div>
              ) : (
                <div className="alert alert-error">
                  <h6>{userStatus === 'ACTIVE' ? 'OFFLINE' : userStatus}</h6>
                </div>
              )}
            </div>
              </Paper>
            <Paper>
                <h6 className="border-dark border-b-2 p-2 font-bold">Last Online</h6>
                <Text size='sm' p={6}>{lastActive}</Text>
          </Paper>
          </SimpleGrid>
        </div>
        <div className="col-span-1">
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
                  href={`/inbox/compose/new/user/${profile?.id}`}
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
                <button
                  type="button"
                  onClick={handleAddFriend}
                  className="profile-nav-link"
                  style={{ display: isOwnProfile || isFriend ? 'none' : 'block' }}
                >
                  Add to Friends List
                </button>
                <button
                  type="button"
                  onClick={handleRemoveFriend}
                  className="profile-nav-link"
                  style={{ display: isOwnProfile || !isFriend ? 'none' : 'block' }}
                >
                  Remove Friend
                </button>
                <button
                  type="button"
                  className="profile-nav-link"
                  style={{ display: isFriend ? 'block' : 'none' }}
                >
                  Transfer Gold
                </button>
                <button
                  type="button"
                  className="profile-nav-link"
                  style={{ display: isFriend ? 'block' : 'none' }}
                >
                  Request Gold
                    </button>
                  </>
                )}
                {/*}<button type='button' className={`profile-nav-link ${isFriend ? 'disabled' : ''}`}>
                  Add to Enemies List
              </button>{*/}
            </div>
          )}
          {socialEnabled && (
            <>
              <h6 className="border-dark text-center font-bold">
                Top Friends
              </h6>
              <Paper shadow="sm" p="md" className="my-5">
                <SimpleGrid cols={3} spacing={4}>
                  {friendsList}
                </SimpleGrid>
              </Paper>
            </>
          )}
          <Center>
            <h6 className="border-dark text-center font-bold">
              Statistics
            </h6>
          </Center>
          <Table striped highlightOnHover>
            <Table.Tbody>
              <Table.Tr className="odd:bg-table-odd even:bg-table-even">
                <Table.Td>Population</Table.Td>
                <Table.Td>{profile?.population?.toLocaleString()}</Table.Td>
              </Table.Tr>
              <Table.Tr className="odd:bg-table-odd even:bg-table-even">
                <Table.Td>Army Size</Table.Td>
                <Table.Td>{profile?.armySize?.toLocaleString()}</Table.Td>
              </Table.Tr>
              <Table.Tr className="odd:bg-table-odd even:bg-table-even">
                <Table.Td>Fortification</Table.Td>
                <Table.Td>{Fortifications.find((fort) => fort.level === profile?.fortLevel).name}</Table.Td>
              </Table.Tr>
              <Table.Tr className="odd:bg-table-odd even:bg-table-even">
                <Table.Td>Gold</Table.Td>
                <Table.Td>{toLocale(profile?.gold)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
          <h6 className="border-dark border-b-2 p-2 text-center font-bold">
            Medals
          </h6>
        
          {users.latestUserEra && (
            <Paper shadow="sm" p="md" className="my-5">
              <h6 className="border-dark border-b-2 p-2 font-bold">Achievements</h6>
              <ul>
                {Object.entries(users.latestUserEra.achievements).map(([key, value]) => (
                  <li key={key}>
                    {key}: {String(value)}
                  </li>
                ))}
              </ul>
            </Paper>
          )}
        </div>
      </div>
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

  const { password_hash, email, ...userWithoutPassword } = user;

  // Safely serialize dates coming from the database. Some callers (or mocks) may supply
  // non-Date values, so validate before calling toISOString().
  const lastActiveDate = user.last_active ? new Date(user.last_active) : null;
  const lastActiveStr = lastActiveDate && !isNaN(lastActiveDate.getTime()) ? lastActiveDate.toISOString() : null;

  const createdAtDate = user.created_at ? new Date(user.created_at) : null;
  const createdAtStr = createdAtDate && !isNaN(createdAtDate.getTime()) ? createdAtDate.toISOString() : null;

  const updatedAtDate = user.updated_at ? new Date(user.updated_at) : null;
  const updatedAtStr = updatedAtDate && !isNaN(updatedAtDate.getTime()) ? updatedAtDate.toISOString() : null;

  const userData = {
    ...userWithoutPassword,
    bionew: await serialize(user.bio),
    gold: user.gold.toString(),
    gold_in_bank: user.gold_in_bank.toString(),
    last_active: lastActiveStr,
    created_at: createdAtStr,
    updated_at: updatedAtStr,
    status: await getUpdatedStatus(user.id),
    currentEra: user.currentEra ?? null,
    latestUserEra: (user.userEras && user.userEras.length > 0) ? user.userEras[0] : null,
  };

  return { props: { users: userData } };
};

export default Index;
