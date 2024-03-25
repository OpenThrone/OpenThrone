import { usePathname, useRouter } from 'next/navigation';
import { getSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import StatsTable from '@/components/statsTable';
import prisma from '@/lib/prisma';
const Stats = ({ attacks , recruits, population}) => {

  return (
    <>
      <div className="container mx-auto p-4">
        <h2 className="mb-4 text-2xl font-bold">Community Stats</h2>
      </div>
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatsTable title="Top 10 Population" data={population} />
          <StatsTable title="Most Active Recruiters in last 7 days" data={recruits} />
          <StatsTable title="Top 10 Successful Attackers in last 7 days" data={attacks} />
        </div>
      </div>
    </>
  );
};

export const getServerSideProps = async (context: any) => {

  async function getRecruitmentCounts() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recruitmentCounts = await prisma.recruit_history.groupBy({
      by: ['from_user'],
      _count: {
        from_user: true,
      },
      where: {
        timestamp: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: {
        _count: {
          from_user: 'desc',
        },
      },
      take: 10,
    });

    return recruitmentCounts;
  }

  async function getTopRecruitsWithDisplayNames() {
    const recruitmentCounts = await getRecruitmentCounts();

    // Map recruitmentCounts to include user data
    const recruitsWithUser = await Promise.all(recruitmentCounts.map(async (recruit) => {
      if(recruit.from_user === 0) return null;
      const user = await prisma.users.findUnique({
        where: {
          id: recruit.from_user,
        },
        select: {
          display_name: true,
        },
      });

      return {
        display_name: user ? user.display_name : 'Unknown',
        stat: recruit._count.from_user,
      };
    }));

    return recruitsWithUser.filter(recruit => recruit !== null);
  }


  async function getTopSuccessfulAttacks() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fetch attacks within the last 7 days
    const attacks = await prisma.attack_log.findMany({
      where: {
        timestamp: {
          gte: sevenDaysAgo,
        },
        type: 'attack',
      },
    });

    // Filter attacks where attacker is the winner
    const successfulAttacks = attacks.filter(attack => attack.winner === attack.attacker_id);

    // Aggregate successful attacks by attacker_id
    const attackCounts = successfulAttacks.reduce((acc, { attacker_id }) => {
      acc[attacker_id] = (acc[attacker_id] || 0) + 1;
      return acc;
    }, {});

    // Convert to array, sort by count, and take the top 10
    const sortedAttackers = Object.entries(attackCounts)
      .map(([attacker_id, stat]) => ({ attacker_id: parseInt(attacker_id, 10), stat }))
      .sort((a, b) => b.stat - a.stat)
      .slice(0, 10);

    // Fetch displayName for each top attacker
    const attackerDetails = await Promise.all(
      sortedAttackers.map(async ({ attacker_id }) => {
        const user = await prisma.users.findUnique({
          where: {
            id: attacker_id,
          },
          select: {
            display_name: true,
          },
        });
        return user ? { attacker_id, display_name: user.display_name } : null;
      })
    );

    // Merge attacker details with attack counts
    const detailedAttackCounts = sortedAttackers.map(attacker => ({
      ...attacker,
      display_name: attackerDetails.find(detail => detail && detail.attacker_id === attacker.attacker_id)?.display_name || 'Unknown',
    }));

    return detailedAttackCounts;
  }

  async function getTopPopulations() {
    // Fetch users and their units
    const usersWithUnits = await prisma.users.findMany({
      select: {
        id: true,
        display_name: true,
        units: true, // Assuming this is the field containing the units JSON
      },
    });

    // Calculate total units for each user
    const usersTotalUnits = usersWithUnits.map(user => {
      // Parse the units JSON and sum the quantities
      const totalUnits = user.units.reduce((acc, unit) => acc + unit.quantity, 0);
      return {
        ...user,
        stat: totalUnits,
      };
    });

    // Sort by total units in descending order and take the top 10
    const topPopulations = usersTotalUnits.sort((a, b) => b.stat - a.stat).slice(0, 10);


    return topPopulations;
  }


  return { props: { attacks: await getTopSuccessfulAttacks(), recruits: await getTopRecruitsWithDisplayNames(), population: await getTopPopulations()  } };
};

export default Stats;
