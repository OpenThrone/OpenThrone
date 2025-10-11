import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import UserModel from '@/models/Users';
import { PlayerUnit } from '@/types/typings';
import { withAuth } from '@/middleware/auth';
import { getOTStartDate } from '@/utils/timefunctions';
import { getIpAddress } from '@/utils/ipUtils';
import { AuthenticatedRequest } from '@/types/api';

function increaseCitizens(units: PlayerUnit[]) {
  // Find the CITIZEN object
  const citizen = units.find((unit) => unit.type === 'CITIZEN');
  if (citizen) {
    // Increase its quantity by 1
    citizen.quantity += 1;
  } else {
    // If CITIZEN does not exist in the array, add it with a quantity of 1
    units.push({ type: 'CITIZEN', level: 1, quantity: 1 });
  }
  return units;
}

const handler = async(
  req: AuthenticatedRequest,
  res: NextApiResponse
) => {
  const { id } = req.query;
  let recruiterID = 0;
  const session = req.session;
  if (session) {
    recruiterID = Number(session.user?.id || 0);
  }
  const recruitedUser = await prisma.users.findUnique({
    where: {
      recruit_link: id as string,
    },
  });
  if (!recruitedUser) {
    return res.status(400).json({ error: 'Invalid recruitment link.' });
  }
  if (req.method === 'GET') {
    // For GET, keep as is, no update
    const ipAddress = getIpAddress(req as any);
    const history = await prisma.recruit_history.count({
      where: {
        to_user: Number(recruitedUser.id),
        from_user: Number(recruiterID),
        timestamp: { gte: getOTStartDate() },
        ...(recruiterID === 0 && { ip_addr: ipAddress }),
      },
    });

    if (history >= 5) {
      return res
        .status(400)
        .json({ error: 'You can only Recruit up to 5x in 24 hours.'});
    }
    const toUserHistory = await prisma.recruit_history.count({
      where: {
        from_user: Number(recruiterID),
        to_user: Number(recruitedUser.id),
        timestamp: { gte: getOTStartDate() },
      },
    });

    if (toUserHistory >= 25) {
      // Handle the scenario when there are 25 or more records for to_user in the last 24 hours
      return res.status(400).json({
        error: 'This user has already recruited their 25 soldiers today.',
      });
    }
    return res.status(200).json({ showCaptcha: true });
  }
  if (req.method === 'POST') {
    const selfRecruit = req.body.self_recruit === '1' || req.body.self_recruit === true;
    const ipAddress = getIpAddress(req as any);
    const fromUser = Number(recruitedUser.id);
    const toUser = Number(recruiterID);
    const userIdToUpdate = selfRecruit ? Number(session?.user.id) : toUser;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Fetch the user being updated
      const userToUpdate = await tx.users.findUnique({
        where: { id: userIdToUpdate },
        select: {
          id: true,
          units: true,
          gold: true,
        },
      });
      if (!userToUpdate) {
        throw new Error('User not found');
      }

      // Check recruitment limit inside transaction (combined check for OR condition)
      const history = await tx.recruit_history.count({
        where: {
          OR: [
            {
              AND: [
                { to_user: toUser },
                { from_user: { not: 0 } },
                { from_user: fromUser },
                { timestamp: { gte: getOTStartDate() } },
              ],
            },
            {
              AND: [
                { to_user: toUser },
                { ip_addr: ipAddress },
                { timestamp: { gte: getOTStartDate() } },
              ],
            },
          ],
        },
      });

      if (history >= 5) {
        throw new Error('You can only Recruit up to 5x in 24 hours.');
      }

      // Create recruitment record
      await tx.recruit_history.create({
        data: {
          from_user: fromUser,
          to_user: toUser,
          ip_addr: ipAddress,
          timestamp: new Date(),
        },
      });

      // Update units and gold
      let units = JSON.parse(userToUpdate.units as string);
      const updatedUnits = increaseCitizens(units);
      await tx.users.update({
        where: { id: userIdToUpdate },
        data: {
          units: updatedUnits,
          gold: { increment: 250 },
        },
      });

      // Create bank history record
      await tx.bank_history.create({
        data: {
          from_user_id: 0,
          to_user_id: userIdToUpdate,
          to_user_account_type: 'HAND',
          from_user_account_type: 'BANK',
          date_time: new Date(),
          gold_amount: BigInt(250),
          history_type: 'RECRUITMENT',
        },
      });

      return { success: true };
    });

    return res.status(200).json(result);
  }

  res.status(405).json({ error: 'Method not allowed' }); // Send a proper response
}

export default withAuth(handler, true);
