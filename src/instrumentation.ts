import prisma from '@/lib/prisma';
import md5 from 'md5';

import UserModel from '@/models/Users';
import { calculateOverallRank } from '@/utils/utilities';
import { newCalculateStrength } from './utils/attackFunctions';

/**
 * Update a single user for a new day.
 *
 * @param {Object} currentUser
 * @return {Promise}
 */
const updateUserPerDay = (currentUser) => {
  const { newUser } = currentUser;

  try {
    // Find the CITIZEN unit
    let citizenUnit = newUser.units.find(unit => unit.type === 'CITIZEN');

    if (citizenUnit) {
      // If CITIZEN unit is found, increment its quantity
      citizenUnit.quantity += newUser.recruitingBonus;
    } else {
      // If CITIZEN unit is not found, create one and set its quantity
      citizenUnit = {
        type: 'CITIZEN',
        level: 1,
        quantity: newUser.recruitingBonus
      };
      newUser.units.push(citizenUnit);
    }

    return prisma.users.update({
      where: { id: newUser.id },
      data: {
        units: newUser.units,
        ...(!newUser.recruitingLink && { recruit_link: md5(newUser.id.toString()) }),
      },
    });
  } catch (error) {
    console.log(`Error updating user ${currentUser.id}: ${error.message}`);
  }
};

/**
 * Update a single user for a turn change.
 *
 * @param {Object} currentUser
 * @param {number} rank Current rank (1-indexed) of this user
 * @return {Promise}
 */
const updateUserPerTurn = (currentUser, rank) => {
  const { newUser } = currentUser;

  try {
    const updatedGold = BigInt(newUser.goldPerTurn.toString()) + newUser.gold;
    const { killingStrength, defenseStrength } = newCalculateStrength(newUser, 'OFFENSE');
    const newOffense = newUser.getArmyStat('OFFENSE')
    const newDefense = newUser.getArmyStat('DEFENSE')
    const newSpying = newUser.getArmyStat('SPY')
    const newSentry = newUser.getArmyStat('SENTRY')

    let updateData = {
      gold: updatedGold,
      attack_turns: newUser.attackTurns + 1,
      rank: rank,
      killing_str: killingStrength,
      defense_str: defenseStrength,
      offense: newOffense,
      defense: newDefense,
      spy: newSpying,
      sentry: newSentry,
    };

    return prisma.users.update({
      where: { id: newUser.id },
      data: updateData,
    });
  } catch (error) {
    console.log(`Error updating user ${currentUser.id}: ${error.message}`);
  }
};

/**
 * Execute some cleanup tasks on a daily basis.
 *
 * @return {Promise[]}
 */
const doDailyCleanup = () => {
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const tablesToClean = [
    'attack_log',
    'bank_history',
    'recruit_history',
  ];

  return tablesToClean.map((tableName) => prisma[tableName].deleteMany({
    where: {
      date_time: {
        lt: twentyDaysAgo,
      },
    },
  }));
};

/**
 * Register function for instrumentation (monitoring, logging, etc.)
 *
 * Use this function for things that should be set up on the server side once,
 * at startup.
 */
export async function register() {
  // Only run in the nodejs runtime, or nextjs will blithely run it in Edge too
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = require('node-cron');
    console.log('Setting up cron tasks');

    if (process.env.DO_TURN_UPDATES) {
      // Tasks to complete each turn
      cron.schedule('0,30 * * * *', async () => {
        const allUsers = await prisma.users.findMany();

        const userRanks = allUsers.map((user) => {
          const newUser = new UserModel(user);
          const rankScore = calculateOverallRank(user);

          return {
            id: user.id,
            rankScore,
            newUser,
          };
        });

        userRanks.sort((a, b) => b.rankScore - a.rankscore);

        const updatePromises = userRanks.map((userRank, index) => updateUserPerTurn(userRank, index + 1));

        Promise.all(updatePromises).then(() => console.log('Updated users for turn change.'));
      });

      console.log('Registered turn update cron task');
    }

    if (process.env.DO_DAILY_UPDATES) {
      // Tasks to complete at midnight (server time)
      cron.schedule('0 0 * * *', async () => {
        const allUsers = await prisma.users.findMany();

        const updatePromises = allUsers.map((singleUser) => updateUserPerDay(singleUser));
        Promise.all(updatePromises).then(() => console.log('Updated users for day change.'));

        const cleanupPromises = doDailyCleanup();
        Promise.all(cleanupPromises).then(() => console.log('Cleaned up database for day change.'));
      });

      console.log('Registered daily update cron task');
    }
  }
};
