import Link from 'next/link';
import { useRouter } from 'next/router';
import { MDXRemote } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import { useEffect, useState } from 'react';

import Modal from '@/components/modal';
import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';

const Index = ({ users }) => {
  const [messages, setMessages] = useState(null);
  const hideSidebar = false;
  const context = useUser();
  const user = context ? context.user : null;
  const [isPlayer, setIsPlayer] = useState(false);

  const router = useRouter();
  const [profile, setUser] = useState<UserModel>(() => new UserModel(users));
  const [canAttack, setCanAttack] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const toggleModal = () => {
    setIsOpen(!isOpen);
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

    if (results.result) {
      context.forceUpdate();
      router.push(`/battle/results/${results.attack_log}`);
    }

    // make server request here
    toggleModal();
  };
  useEffect(() => {
    if (profile.id !== users.id) setUser(new UserModel(users));
    if (user?.id === users.id && isPlayer === false) setIsPlayer(true);
    if (!isPlayer && user) setCanAttack(user.canAttack(profile.level));
    if (profile) {
      const nowdate = new Date();
      console.log(nowdate);
      console.log(profile.last_active);
      console.log(nowdate - profile.last_active);
      console.log((nowdate - profile.last_active) / (1000 * 60));
      setIsOnline((nowdate - profile.last_active) / (1000 * 60) <= 15);
      console.log(isOnline);
    }
  }, [profile, users, user, isPlayer]);
  return (
    <div className="mainArea pb-10">
      <h2>{profile?.displayName}</h2>

      {messages && (
        <div className={`alert alert-${messages.type}`}>{messages}</div>
      )}

      <div className="my-4 flex justify-around">
        <p className="mb-0">Level: {profile?.level}</p>
        <p className="mb-0">Overall Rank: {users?.overallrank}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="col-span-1">
          <div className="card-dark">
            <svg
              className="rounded"
              style={{ textAnchor: 'middle' }}
              width="100%"
              height="140"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="Placeholder: Image cap"
              preserveAspectRatio="xMidYMid slice"
              focusable="false"
            >
              <title>Placeholder</title>
              <rect width="100%" height="100%" fill="#868e96" />
              <text x="50%" y="50%" fill="#dee2e6" dy=".3em">
                {profile?.displayName}
              </text>
            </svg>
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
                <div className="alert alert-danger">
                  <h6>Offline</h6>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-span-1">
          {hideSidebar || isPlayer ? (
            <div className="list-group mb-4">
              <a
                href={`/recruit/${profile?.recruitingLink}`}
                className="list-group-item list-group-item-action"
              >
                Recruit this Player
              </a>
            </div>
          ) : (
            <div className="list-group mb-4">
              <Link
                href={`/inbox/compose/new/user/${profile?.id}`}
                className="list-group-item list-group-item-action disabled"
              >
                Message this Player
              </Link>
              <button
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

              <Link
                href="#"
                className="list-group-item list-group-item-action disabled"
              >
                Spy Missions
              </Link>
              {/* <a href="#" className="list-group-item list-group-item-action disabled">Transfer Gold</a> */}
              <Link
                href={`/recruit/${profile?.recruitingLink}`}
                className="list-group-item list-group-item-action disabled"
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
                <td>{profile?.fortLevel}</td>
              </tr>
              <tr className="odd:bg-table-odd even:bg-table-even">
                <td>Gold</td>
                <td>{profile?.gold?.toLocaleString()}</td>
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
  const id = parseInt(query.id, 10);

  // Fetch the user's rank from the database
  const rank = await prisma.$queryRaw`
    SELECT overallrank
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY experience DESC, display_name, fort_level) AS overallrank
      FROM users
    ) AS ranks
    WHERE id = ${id}
  `;
  // Fetch the user data from the database
  const user = await prisma.users.findFirst({
    where: { id },
  });

  // Combine user and rank into a single object
  const userData = {
    ...user,
    overallrank: String(rank[0]?.overallrank),
    bionew: await serialize(user.bio),
  };

  return { props: { users: userData } };
};

export default Index;
