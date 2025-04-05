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
  last_active: string;
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
  created_at: string;
  updated_at: string;
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
}

interface IndexProps {
  users: UserProfileServerData; // Use the new interface
}

// The component receives props matching IndexProps (which uses UserProfileServerData)
const Index: React.FC<IndexProps> = ({ users }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [hideSidebar, setHideSidebar] = useState(true);
  const {user, forceUpdate} = useUser();
  const [isPlayer, setIsPlayer] = useState(false);
  const [isAPlayer, setIsAPlayer] = useState(false);

  const [profile, setUser] = useState<UserModel>(() => new UserModel(users, true, false));
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
        setFriends(data);
        setLoading(false);
      });
  }, [profile.id]);

  const toggleModal = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (profile.id !== users.id) setUser(new UserModel(users, true, false)); // you're looking at someone else
    if (user?.id === profile.id) setIsPlayer(true); // you're looking at yourself
    if (!isPlayer && user) setCanAttack(user.canAttack(profile.level));
    if (profile) {
      const nowdate = new Date();
      if (profile.last_active === null) {
        setIsOnline(false);
        setLastActive('Never logged in');
        return;
      }
      console.log(user?.spyLimits)
      const lastActiveTimestamp = new Date(profile.last_active).getTime();
      const nowTimestamp = nowdate.getTime();

      setIsOnline((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
      setLastActive(new Date(profile.last_active).toDateString());
    }
    if(process.env.NEXT_PUBLIC_ENABLE_SOCIAL) {
      setSocialEnabled(true);
    }
  }, [profile, users, user, isPlayer]);

  if (loading) return <Loader />;
  if (!profile) return <p>User not found</p>;
  if (lastActive === 'Never logged in') return <p>User is currently inactive</p>;

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

  const isFriend = friends.some(friend => friend.friend.id === profile.id);
  const friendsList = friends.length > 0 ? friends.map(friend => {
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
          {hideSidebar || isPlayer || userStatus !== 'ACTIVE' ? (
            <div className="list-group mb-4">
              <Link
                href={`/recruit/${profile?.recruitingLink}`}
                className="list-group-item list-group-item-action"
                style={{ display: userStatus !== 'ACTIVE' ? 'none' : 'block' }}
              >
                Recruit this Player
              </Link>
              <Link
                href={'/account/register'}
                className={`list-group-item list-group-item-action`}
              >Join Now</Link>
            </div>
          ) : (
            <div className="list-group mb-4">
              <Link
                  href={`/inbox/compose/new/user/${profile?.id}`}
                  className={`list-group-item list-group-item-action ${user?.id === 1 || user?.id === 2 ? '' : 'disabled'}`}
              >
                Message this Player
              </Link>
              <button
                type="button"
                onClick={toggleModal}
                className={`list-group-item list-group-item-action w-full text-left ${
                  canAttack ? '' : 'disabled'
                }`}
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
                  className={`list-group-item list-group-item-action w-full text-left ${canAttack ? '' : 'disabled'}`}
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
                className="list-group-item list-group-item-action"
              >
                Recruit this Player
                </Link>
                {socialEnabled && (
                <>
                <button
                  type="button"
                  onClick={handleAddFriend}
                  className={`list-group-item list-group-item-action w-full text-left`}
                  style={{ display: isFriend ? 'none' : 'block' }}
                >
                  Add to Friends List
                </button>
                <button
                  type="button"
                  onClick={handleRemoveFriend}
                  className={`list-group-item list-group-item-action w-full text-left`}
                  style={{ display: isFriend ? 'block' : 'none' }}
                >
                  Remove Friend
                </button>
                <button
                  type="button"
                  className={`list-group-item list-group-item-action w-full text-left`}
                  style={{ display: isFriend ? 'block' : 'none' }}
                >
                  Transfer Gold
                </button>
                <button
                  type="button"
                  className={`list-group-item list-group-item-action w-full text-left`}
                  style={{ display: isFriend ? 'block' : 'none' }}
                >
                  Request Gold
                    </button>
                  </>
                )}
                {/*}<button type='button' className={`list-group-item list-group-item-action w-full text-left ${isFriend ? 'disabled' : ''}`}>
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
                <SimpleGrid cols={3} gap={4}>
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
  const user = await prisma.users.findFirst({ where: whereCondition });

  if (!user) {
    return { notFound: true };
  }

  const { password_hash, email, ...userWithoutPassword } = user;

  const userData = {
    ...userWithoutPassword, 
    bionew: await serialize(user.bio),
    gold: user.gold.toString(),
    gold_in_bank: user.gold_in_bank.toString(),
    last_active: user.last_active.toISOString(),
    created_at: user.created_at.toISOString(),
    updated_at: user.updated_at.toISOString(),
    status: await getUpdatedStatus(user.id),
  };

  return { props: { users: userData } };
};

export default Index;
