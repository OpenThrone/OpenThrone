import UserModel from "@/models/Users";
import md5 from "md5";
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getAllUsers } from "@/services";

/**
 * Update a single user for a new day.
 *
 * @param {Object} currentUser
 * @return {Promise}
 */
const updateUserPerDay = async (currentUser) => {
  try {
    const originalCitizens = Number(currentUser.citizens ?? 0);
    // Determine recruiting bonus from the UserModel getter
    const recruitingBonus = Number(currentUser.recruitBonus ?? 0) || 0;
    const newCitizens = originalCitizens + recruitingBonus;
    console.log(`User ${currentUser.id} - Population: ${currentUser.population} - Citizens: ${originalCitizens}`);
    console.log(`User ${currentUser.id} - Recruiting Bonus: ${recruitingBonus} - Type: ${typeof recruitingBonus}`);

    await prisma.userUnit.upsert({
        where: {
          // Prisma schema defines a compound unique on (userId, type, isMercenary)
          userId_type_isMercenary: {
            userId: currentUser.id,
            type: 'CITIZEN',
            isMercenary: false,
          },
        },
        update: {
          quantity: {
            increment: recruitingBonus,
          },
        },
        create: {
          userId: currentUser.id,
          type: 'CITIZEN',
          level: 1,
          quantity: recruitingBonus,
          isMercenary: false,
        },
      });
    
    await prisma.bank_history.create({
      data: {
        from_user_id: 0,
        to_user_id: currentUser.id,
        to_user_account_type: 'HAND',
        from_user_account_type: 'BANK',
        date_time: new Date(),
        gold_amount: 0,
        history_type: 'DAILY_RECRUIT',
        stats: {
          currentCitizens: originalCitizens,
          newCitizens: newCitizens,
          recruitingBonus: currentUser.recruitingBonus,
        },
      },
    });

    return true; // Update was successful
  } catch (error) {
    console.log(`Error updating user ${currentUser.id}: ${error.message}`);
    return false; // Update failed
  }
};

/**
 * Execute some cleanup tasks on a daily basis.
 *
 * @return {Promise[]}
 */
const doDailyCleanup = async () => {
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const tablesToClean = [
    { name: 'attack_log', dateField: 'timestamp' },
    { name: 'bank_history', dateField: 'date_time' },
    { name: 'recruit_history', dateField: 'timestamp' },
  ];

  return tablesToClean.map(async (table) => await prisma[table.name].deleteMany({
    where: {
      [table.dateField]: {
        lt: twentyDaysAgo,
      },
    },
  }));
};

const dailyCron = async (req: NextApiRequest, res: NextApiResponse) => {
  const { TASK_SECRET } = process.env;
  if (
    process.env.DO_DAILY_UPDATES === 'true' &&
    req.headers['authorization'] === TASK_SECRET
  ) {
    const allUsers = await getAllUsers(); // Fetch all users from the database

    // Initialize the queue with users and attempt counts
    let queue = allUsers.map((singleUser) => ({
      user: new UserModel(singleUser, singleUser.UserUnit, singleUser.UserItem, singleUser.UserStructureUpgrade, singleUser.UserBattleUpgrade, singleUser.UserBonusPoints, singleUser.permissions.map(p => ({ type: p })), singleUser.stats),
      attempts: 0,
    }));

    // Process the queue
    while (queue.length > 0) {
      const currentTask = queue.shift(); // Get the first user in the queue

      const success = await updateUserPerDay(currentTask.user);

      if (!success) {
        currentTask.attempts += 1;
        if (currentTask.attempts < 3) {
          // Move the user to the end of the queue for another attempt
          queue.push(currentTask);
        } else {
          console.log(
            `Failed to update user ${currentTask.user.id} after 3 attempts.`
          );
        }
      }
      // If successful, no action needed (user is removed from queue)
    }

    console.log('Updated users for day change.');

    const cleanupPromises = await doDailyCleanup();
    await Promise.all(cleanupPromises);
    console.log('Cleaned up database for day change.');

    return res.status(200).json({ message: 'Daily cron job executed successfully.' });
  } else {
    res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }
};

export default dailyCron;