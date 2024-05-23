import { usePathname, useRouter } from 'next/navigation';
import { getSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import StatsTable from '@/components/statsTable';
import prisma from '@/lib/prisma';
import { InferGetServerSidePropsType } from "next";
import { ItemTypes } from '@/constants';

const Stats = ({ attacks , recruits, population, totalWealth, goldOnHand, goldInBank}: InferGetServerSidePropsType<typeof getServerSideProps>) => {

  return (
    <>
      <div className="container mx-auto p-4">
        <h2 className="mb-4 text-2xl font-bold">Community Stats</h2>
      </div>
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatsTable title="Top 10 Population" data={population} description="The top 10 population is a list of the ten user accounts with the highest total population over a span." />
          <StatsTable title="Most Active Recruiters in last 1 day" data={recruits} />
          <StatsTable title="Top 10 Successful Attackers in last 7 days" data={attacks} />
          <StatsTable title="Top 10 Gold on Hand" data={goldOnHand} />
          <StatsTable title="Top 10 Wealthiest Players" data={totalWealth} />
          <StatsTable title="Top 10 Gold in Bank" data={goldInBank} />
        </div>
      </div>
    </>
  );
};

export const getServerSideProps = async (context: any) => {
  async function getRecruitmentCounts(days: number = 7) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - days);

    const recruitmentCounts = await prisma.recruit_history.groupBy({
      by: ['to_user'],
      _count: {
        to_user: true,
      },
      where: {
        timestamp: {
          gte: sevenDaysAgo,
        },
        from_user: { not: 0 }
      },
      orderBy: {
        _count: {
          to_user: 'desc',
        },
      },
      take: 10,
    });

    const recruitmentCountsWithFilteredRecords = await Promise.all(recruitmentCounts.map(async (recruit) => {
      const validRecruitmentRecords = await prisma.recruit_history.findMany({
        where: {
          from_user: { not: recruit.to_user },
          to_user: recruit.to_user,
          timestamp: { gte: sevenDaysAgo },
        },
        select: {
          from_user: true,
          timestamp: true,
          to_user: true,
        },
      });

      recruit.recruitmentRecords = validRecruitmentRecords;
      recruit._count.to_user = validRecruitmentRecords.length; // update count based on valid records

      return recruit;
    }));

    return recruitmentCountsWithFilteredRecords;
  }

  async function getTopRecruitsWithDisplayNames() {
    const recruitmentCounts = await getRecruitmentCounts(1);

    // Filter out entries with no valid recruitments
    const filteredRecruitmentCounts = recruitmentCounts.filter(recruit =>
      recruit.recruitmentRecords.length > 0
    );

    // Map recruitmentCounts to include user data
    const recruitsWithUser = await Promise.all(filteredRecruitmentCounts.map(async (recruit) => {
      const user = await prisma.users.findUnique({
        where: {
          id: recruit.to_user,
        },
        select: {
          display_name: true,
          id: true
        },
      });

      return {
        id: user ? user.id : 0,
        display_name: user ? user.display_name : 'Unknown',
        stat: recruit._count.to_user,
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
            id: true,
            display_name: true,
          },
        });
        return user ? { attacker_id, display_name: user.display_name } : null;
      })
    );

    // Merge attacker details with attack counts
    const detailedAttackCounts = sortedAttackers.map(attacker => ({
      ...attacker,
      id: attacker.attacker_id,
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

  async function getTopGoldOnHand() {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        display_name: true,
        gold: true,
      },
      orderBy: {
        gold: 'desc',
      },
      take: 10,
    });

    const mappedUsers = users.map((user) => {
      return {
        ...user,
        stat: user.gold,
      }
    })

    return mappedUsers;
  }

  async function getTopGoldInBank() {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        display_name: true,
        gold_in_bank: true,
      },
      orderBy: {
        gold_in_bank: 'desc',
      },
      take: 10,
    });

    const mappedUsers = users.map((user) => {
      return {
        ...user,
        stat: user.gold_in_bank,
      }
    })

    return mappedUsers;
  }

  // Wealth is calculated by the amount of gold a user has in bank + the amount of gold a user has in hand + the value (cost) of all the items they hold
  async function getTopWealth() {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        display_name: true,
        gold: true,
        items: true,
        gold_in_bank: true,
      },
    });

    const calculateItemsValue = (items) => {
      return items.reduce((total, item) => {
        return total + (item.quantity * ItemTypes.find((itm) => itm.level === item.level && item.usage === itm.usage && item.type === itm.type).cost); // Assuming the value is quantity * level
      }, 0);
    };

    const usersWithWealth = users.map((user) => {
      const itemsValue = user.items ? calculateItemsValue(user.items) : 0;
      const wealth = user.gold + user.gold_in_bank + BigInt(itemsValue);

      return {
        ...user,
        itemsValue,
        stat: wealth,
      };
    })

    // Sort users by wealth in descending order
    usersWithWealth.sort((a, b) => (b.stat > a.stat ? 1 : (b.stat < a.stat ? -1 : 0)));

    // Get only the top 10 users
    const top10UsersWithWealth = usersWithWealth.slice(0, 10);

    return top10UsersWithWealth;
  }


  return {
    props: {
      totalWealth: await getTopWealth(),
      goldOnHand: await getTopGoldOnHand(),
      goldInBank: await getTopGoldInBank(),
      attacks: await getTopSuccessfulAttacks(),
      recruits: await getTopRecruitsWithDisplayNames(),
      population: await getTopPopulations()
    }
  };
};


export default Stats;
