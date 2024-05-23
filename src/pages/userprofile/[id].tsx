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
import { Table, Loader, Group, Paper, Avatar, Badge, Text, Indicator, SimpleGrid } from '@mantine/core';

interface IndexProps {
  users: UserModel;
}

const Index: React.FC<IndexProps> = ({ users }) => {
  const hideSidebar = false;
  const context = useUser();
  const user = context ? context.user : null;
  const [isPlayer, setIsPlayer] = useState(false);

  const router = useRouter();
  const [profile, setUser] = useState<UserModel>(() => new UserModel(users, true));
  const [canAttack, setCanAttack] = useState(false);
  const [canSpy, setCanSpy] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleAddFriend = async () => {
    const res = await fetch('/api/social/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: profile.id, relationshipType: 'FRIEND' }),
    });

    if (res.ok) {
      alertService.success('Friend added successfully');
      context.forceUpdate();
    } else {
      alertService.error('Failed to add friend');
    }
  };

  const handleRemoveFriend = async () => {
    const res = await fetch('/api/social/remove', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: profile.id }),
    });

    if (res.ok) {
      alertService.success('Friend removed successfully');
      context.forceUpdate();
    } else {
      alertService.error('Failed to remove friend');
    }
  };

  useEffect(() => {
    fetch('/api/social/listAll?type=FRIEND&limit=5&playerId=' + profile.id)
      .then(response => response.json())
      .then(data => {
        setFriends(data);
        setLoading(false);
      });
  }, []);
  const toggleModal = () => {
    setIsOpen(!isOpen);
  };
  const [composeModalOpen, setComposeModalOpen] = useState(false);

  // State to control the Spy Missions Modal
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);

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
      context.forceUpdate();
      router.push(`/battle/results/${results.attack_log}`);
      toggleModal();
    }
  };

  useEffect(() => {
    if (profile.id !== users.id) setUser(new UserModel(users, true));
    if (user?.id === users.id && isPlayer === false) setIsPlayer(true);
    if (!isPlayer && user) setCanAttack(user.canAttack(profile.level));
    if (!isPlayer && user && (user.id === 1 || user.id === 2)) setCanSpy(true);
    if (profile) {
      const nowdate = new Date();
      const lastActiveTimestamp = new Date(profile.last_active).getTime();
      const nowTimestamp = nowdate.getTime();

      setIsOnline((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
    }
  }, [profile, users, user, isPlayer]);

  if (loading) return <Loader />;
  const isFriend = friends.some(friend => friend.friend.id === profile.id);
  const friendsList = (friends.length > 0 ? friends.map(friend => {
    const player = new UserModel(friend.friend); // Assuming the data structure correctly maps to UserModel
    return (
      <Paper key={player.id} radius="md" withBorder p="lg" className="my-3">
        <Indicator color={player.is_online ? 'teal' : 'red'} style={{ display: 'block', textAlign: 'center' }}>
          <Avatar src={player?.avatar} size={40} radius={40} mx="auto" />
        </Indicator>
        <Text size="sm" weight={500} align="center" mt="md">
          <Link
            href={`/userprofile/${player.id}`}
            className='text-blue-500 hover:text-blue-700 font-bold'
          >
            {player.displayName}
          </Link>
          {player.is_player && <Badge color="blue" ml={5}>You</Badge>}
        </Text>
        <Text size="xs" color="dimmed" align="center">
          {player.race} {player.class}
        </Text>
      </Paper>
    );
  }) : <p>No friends found.</p>);
  return (
    <div className="mainArea pb-10">
      <h2>{profile?.displayName}</h2>

      <div className="my-5 flex justify-between">
        <Alert />
      </div>

      <div className="container mx-auto">
        <p className="text-center">
          <span className="text-white">{profile?.displayName}</span> is a{profile.race === 'ELF' || profile.race === 'UNDEAD' ? 'n ':' '}
          {profile?.race} {profile?.class}
        </p>
      </div>
      <div className="my-4 flex justify-around">
        <p className="mb-0">Level: {profile?.level}</p>
        <p className="mb-0">Overall Rank: {users?.overallrank}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="col-span-1">
          <div className="card-dark">
            <div className="flex items-center justify-center">
              
                <img
                  src={profile?.avatar}
                  className="ml-2"
                />
              
            </div>
            <div className="my-3 mb-4">
              <MDXRemote {...users.bionew} />
            </div>
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
          </div>
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
                  className={`list-group-item list-group-item-action w-full text-left ${user?.id === 1 || user?.id === 2 ? '' : 'disabled'}`}
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
                <Link href="#" className={`list-group-item list-group-item-action ${isFriend ? 'disabled' : ''}`}>
                  Add to Enemies List
                </Link>
            </div>
          )}
          <h6 className="border-dark text-center font-bold">
            Top Friends
          </h6>
          <Paper shadow="sm" p="md" className="my-5">
            <SimpleGrid cols={3} spacing={4}>
              {friendsList}
              </SimpleGrid>
          </Paper>
          <table className="mb-5 table w-full table-auto">
            <thead>
              <tr>
                <th colSpan={2}>Statistics</th>
              </tr>
            </thead>
            <tbody>
              <tr className="odd:bg-table-odd even:bg-table-even">
                <td>Population</td>
                <td>{profile?.population?.toLocaleString()}</td>
              </tr>
              <tr className="odd:bg-table-odd even:bg-table-even">
                <td>Army Size</td>
                <td>{profile?.armySize?.toLocaleString()}</td>
              </tr>
              <tr className="odd:bg-table-odd even:bg-table-even">
                <td>Fortification</td>
                <td>{Fortifications.find((fort)=> fort.level === profile?.fortLevel).name}</td>
              </tr>
              <tr className="odd:bg-table-odd even:bg-table-even">
                <td>Gold</td>
                <td>{toLocale(profile?.gold)}</td>
              </tr>
            </tbody>
          </table>
          <h6 className="border-dark border-b-2 p-2 text-center font-bold">
            Medals
          </h6>
        </div>
      </div>
    </div>
  );
};

async function getUserRank(id, recruitLink) {
  // Fetch all users and calculate composite score
  const allUsers = await prisma.users.findMany({where:{id: {not: 0}}});
  allUsers.forEach((user) => {
    user.score =
      0.7 * user.experience +
      0.2 * user.fort_level +
      0.1 * user.house_level +
      0.4 * (user.units ? user.units.map((unit) => unit.quantity).reduce((a, b) => a + b, 0) : 0) +
      0.3 * (user.items ? user.items.map((item) => item.quantity * (item.level * 0.1)).reduce((a, b) => a + b, 0) : 0);
  });

  // Sort users based on composite score
  allUsers.sort((a, b) => b.score - a.score);
  // Find the rank of the specific user
  const userRank = allUsers.findIndex(
    (user) => user.id === id || user.recruit_link === recruitLink
  ) + 1;

  return userRank;
}

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

  let rank;
  if (id) {
    rank = await getUserRank(id, null);
  } else {
    rank = await getUserRank(null, recruitLink);
  }

  const whereCondition = id ? { id } : { recruit_link: recruitLink };
  const user = await prisma.users.findFirst({ where: whereCondition });

  if (!user) {
    return { notFound: true };
  }

  const { password_hash, ...userWithoutPassword } = user;

  const userData = {
    ...userWithoutPassword, 
    overallrank: rank,
    bionew: await serialize(user.bio),
  };

  return { props: { users: userData } };
};

export default Index;
