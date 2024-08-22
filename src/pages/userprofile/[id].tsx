import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import React, { useEffect, useState } from 'react';

import Alert from '@/components/alert';
import Modal from '@/components/modal';
import SpyMissionsModal from '@/components/spyMissionsModal';
import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { alertService } from '@/services';
import { Fortifications } from '@/constants';
import toLocale from '@/utils/numberFormatting';
import { Table, Loader, Group, Paper, Avatar, Badge, Text, Indicator, SimpleGrid, Center, Space, Flex, Container } from '@mantine/core';
import { InferGetServerSidePropsType } from "next";
import Image from 'next/image';
import FriendCard from '@/components/friendCard';

interface IndexProps {
  users: UserModel;
}

const Index: React.FC<IndexProps> = ({ users }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [hideSidebar, setHideSidebar] = useState(true);
  const {user, forceUpdate} = useUser();
  const [isPlayer, setIsPlayer] = useState(false);
  const [isAPlayer, setIsAPlayer] = useState(false);

  const router = useRouter();
  const [profile, setUser] = useState<UserModel>(() => new UserModel(users, true));
  const [canAttack, setCanAttack] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [lastActive, setLastActive] = useState( 'Never logged in');
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeModalOpen, setComposeModalOpen] = useState(false);

  // State to control the Spy Missions Modal
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);

  useEffect(() => {
    if (user) {
      setIsAPlayer(true);
      setHideSidebar(false);
    }
  }, [user])


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
    if (profile.id !== users.id) setUser(new UserModel(users, true));
    if (user?.id === users.id && isPlayer === false) setIsPlayer(true);
    if (!isPlayer && user) setCanAttack(user.canAttack(profile.level));
    if (profile) {
      const nowdate = new Date();
      if (profile.last_active === null) {
        setIsOnline(false);
        setLastActive('Never logged in');
        return;
      }
      const lastActiveTimestamp = new Date(profile.last_active).getTime();
      const nowTimestamp = nowdate.getTime();

      setIsOnline((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
      setLastActive(profile.last_active.toDateString());
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

  const handleSubmit = async (turns: number) => {
    if (!turns) turns = 1;
    const res = await fetch(`/api/attack/${profile.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ turns }),
    });
    const results = await res.json();

    if (results.status === 'failed') {
      alertService.error(results.status);
    } else {
      forceUpdate();
      router.push(`/battle/results/${results.attack_log}`);
      toggleModal();
    }
  };

  const isFriend = friends.some(friend => friend.friend.id === profile.id);
  const friendsList = friends.length > 0 ? friends.map(friend => {
    const player = new UserModel(friend.friend);
    return (
      <FriendCard key={player.id} player={player} />
    );
  }) : <p>No friends found.</p>;
  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">{profile?.displayName}</h2>

      <div className="my-5 flex justify-between">
        <Alert />
      </div>

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
                  <h6>Offline</h6>
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
          {hideSidebar || isPlayer ? (
            <div className="list-group mb-4">
              <Link
                href={`/recruit/${profile?.recruitingLink}`}
                className="list-group-item list-group-item-action"
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
                {true === false && (
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
          {true === false && (
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
        </div>
      </div>
    </div>
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

  const { password_hash, ...userWithoutPassword } = user;

  const userData = {
    ...userWithoutPassword, 
    bionew: await serialize(user.bio),
  };

  return { props: { users: userData } };
};

export default Index;
