import Link from 'next/link';
import { useRouter } from 'next/router';
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

const Index = ({ users }) => {
  const hideSidebar = false;
  const context = useUser();
  const user = context ? context.user : null;
  const [isPlayer, setIsPlayer] = useState(false);

  const router = useRouter();
  const [profile, setUser] = useState<UserModel>(() => new UserModel(users));
  const [canAttack, setCanAttack] = useState(false);
  const [canSpy, setCanSpy] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
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

  const handleSubmit = async (turns) => {
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
    if (profile.id !== users.id) setUser(new UserModel(users));
    if (user?.id === users.id && isPlayer === false) setIsPlayer(true);
    if (!isPlayer && user) setCanAttack(user.canAttack(profile.level));
    if (!isPlayer && user && (user.id === 1 || user.id === 2)) setCanSpy(true);
    if (!isPlayer && user)
      console.log((user.id === 1 || user.id === 2));
    if (profile) {
      const nowdate = new Date();

      setIsOnline((nowdate - profile.last_active) / (1000 * 60) <= 15);
    }
  }, [profile, users, user, isPlayer]);
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
              {profile?.id === 6 ? (
                <img src='/assets/images/santee.webp'
                  className='ml-2'
                />
              ) : (
                <img
                  src={`/assets/shields/${profile?.race}_150x150.webp`}
                  className="ml-2"
                />
              )}
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
                onSubmit={handleSubmit}
              />

                <button
                  type='button'
                  onClick={toggleSpyModal}
                  className={`list-group-item list-group-item-action w-full text-left ${user?.id === 1 || user?.id === 2 ? '' : 'disabled'}}`}
              >
                Spy Missions
                </button>
                <SpyMissionsModal
                  isOpen={isSpyModalOpen}
                  toggleModal={toggleSpyModal}
                  defenderID={profile?.id}
                />
              {/* <a href="#" className="list-group-item list-group-item-action disabled">Transfer Gold</a> */}
              <Link
                href={`/recruit/${profile?.recruitingLink}`}
                className="list-group-item list-group-item-action"
              >
                Recruit this Player
              </Link>
              {/* <a href="#" className="list-group-item list-group-item-action disabled">Add to Friends List</a>
        <a href="#" className="list-group-item list-group-item-action disabled">Add to Enemies List</a> */}
            </div>
          )}
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
export const getServerSideProps = async ({ query }) => {
  let recruitLink = '';
  let id;

  if (Number.isNaN(Number(query.id))) {
    recruitLink = query.id;
    id = null; // Set to null instead of 0
  } else {
    id = parseInt(query.id, 10);
  }

  // Check if neither recruitLink nor id is provided
  if (!recruitLink && (id === null || id === 0)) {
    return {
      notFound: true, // Returns a 404 status
    };
  }

  // Fetch the user's rank from the database
  let rank;
  if (id) {
    rank = await prisma.$queryRaw`
      SELECT overallrank
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY experience DESC, display_name, fort_level) AS overallrank, recruit_link
        FROM users
      ) AS ranks
      WHERE id = ${id} OR recruit_link = ${recruitLink}
    `;
  } else {
    rank = await prisma.$queryRaw`
      SELECT overallrank
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY experience DESC, display_name, fort_level) AS overallrank, recruit_link
        FROM users
      ) AS ranks
      WHERE recruit_link = ${recruitLink}
    `;
  }

  // Fetch the user data from the database
  const whereCondition = id
    ? { OR: [{ id }, { recruit_link: recruitLink }] }
    : { recruit_link: recruitLink };

  const user = await prisma.users.findFirst({
    where: whereCondition,
  });

  if (!user) {
    return {
      notFound: true, // Returns a 404 status if user is not found
    };
  }

  // Combine user and rank into a single object
  const userData = {
    ...user,
    overallrank: String(rank[0]?.overallrank),
    bionew: await serialize(user.bio),
  };

  return { props: { users: userData } };
};

export default Index;
