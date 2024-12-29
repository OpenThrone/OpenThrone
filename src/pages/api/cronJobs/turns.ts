import UserModel from "@/models/Users";
import { newCalculateStrength } from "@/utils/attackFunctions";
import { calculateOverallRank } from "@/utils/utilities";
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

/**
 * Update a single user for a turn change.
 *
 * @param {Object} currentUser
 * @param {number} rank Current rank (1-indexed) of this user
 * @return {Promise<boolean>}
 */
const updateUserPerTurn = async (currentUser, rank) => {
  try {
    const updatedGold = BigInt(currentUser.goldPerTurn.toString()) + currentUser.gold;
    const { killingStrength, defenseStrength } = newCalculateStrength(currentUser, 'OFFENSE');
    const newOffense = currentUser.getArmyStat('OFFENSE');
    const newDefense = currentUser.getArmyStat('DEFENSE');
    const newSpying = currentUser.getArmyStat('SPY');
    const newSentry = currentUser.getArmyStat('SENTRY');

    let updateData = {
      gold: updatedGold,
      attack_turns: currentUser.attackTurns + 1,
      rank: rank,
      //killing_str: killingStrength,
      //defense_str: defenseStrength,
      offense: newOffense,
      defense: newDefense,
      spy: newSpying,
      sentry: newSentry,
    };

    await prisma.$transaction(async (tx) => {
      await tx.bank_history.create({
        data: {
          from_user_id: 0,
          to_user_id: currentUser.id,
          to_user_account_type: 'HAND',
          from_user_account_type: 'BANK',
          date_time: new Date(),
          gold_amount: currentUser.goldPerTurn,
          history_type: 'ECONOMY',
          stats: {
            currentGold: currentUser.gold,
            newGold: updatedGold,
            increase: currentUser.goldPerTurn,
          },
        },
      });
      await tx.users.update({
        where: { id: currentUser.id },
        data: updateData,
      });
    });

    return true; // Update was successful
  } catch (error) {
    console.log(`Error updating user ${currentUser.id}: ${error}`);
    return false; // Update failed
  }
};

const turnCron = async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.DO_TURN_UPDATES === 'true' && req.headers['authorization'] === process.env.TASK_SECRET) {
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

    userRanks.sort((a, b) => b.rankScore - a.rankScore);

    let queue = userRanks.map((userRank, index) => ({
      user: userRank.newUser,
      rank: index + 1,
      attempts: 0,
    }));

    while (queue.length > 0) {
      const currentTask = queue.shift(); // Get the first user in the queue

      const success = await updateUserPerTurn(currentTask.user, currentTask.rank);

      if (!success) {
        currentTask.attempts += 1;
        console.log(`Failed to update user ${currentTask.user.id} on attempt ${currentTask.attempts}.`);
        if (currentTask.attempts < 3) {
          // Move the user to the end of the queue for another attempt
          queue.push(currentTask);
        } else {
          console.log(`Failed to update user ${currentTask.user.id} after 3 attempts.`);
        }
      }
    }
    return res.status(200).json({ message: 'Turns cron job executed successfully.' });
  }
  else {
    return res.status(200).json({ message: 'Unauthorized or Disabled Task' });
  }
};

export default turnCron;