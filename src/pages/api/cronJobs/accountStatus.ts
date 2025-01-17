import UserModel from "@/models/Users";
import { getUpdatedStatus } from "@/services/user.service";
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

/**
 * Update a single user for a turn change.
 *
 * @param {Object} currentUser
 * @param {number} rank Current rank (1-indexed) of this user
 * @return {Promise<boolean>}
 */
const updateUserPerTurn = async (currentUser) => {
  try {
    await getUpdatedStatus(currentUser.id);
    return true; // Update was successful
  } catch (error) {
    console.log(`Error updating user ${currentUser.id}: ${error}`);
    return false; // Update failed
  }
};

const accountStatusCron = async (req: NextApiRequest, res: NextApiResponse) => {
  //if (process.env.DO_TURN_UPDATES === 'true' && req.headers['authorization'] === process.env.TASK_SECRET) {
    const allUsers = await prisma.users.findMany();

    const userRanks = allUsers.map((user) => {
      const newUser = new UserModel(user);
      //const rankScore = calculateOverallRank(user);

      return {
        id: user.id,
        //rankScore,
        newUser,
      };
    });

    userRanks.sort((a, b) => b.id - a.id);

    let queue = userRanks.map((userRank, index) => ({
      user: userRank.newUser,
      attempts: 0,
    }));

    while (queue.length > 0) {
      const currentTask = queue.shift(); // Get the first user in the queue

      const success = await updateUserPerTurn(currentTask.user);

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
  /*}
  else {
    return res.status(200).json({ message: 'Unauthorized or Disabled Task' });
  }*/
};

export default accountStatusCron;