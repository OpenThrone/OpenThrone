import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { PlayerUnit } from '@/types/typings';
import mtrand from '@/utils/mtrand';
import { getOTStartDate } from '@/utils/timefunctions';

function increaseCitizens(units: PlayerUnit[]) {
  const citizen = units.find((unit) => unit.type === 'CITIZEN');
  if (citizen) {
    citizen.quantity += 1;
  } else {
    units.push({ type: 'CITIZEN', level: 1, quantity: 1 });
  }
  return units;
}

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const session = req.session;

  const recruiterUser = (session ? session.user.id : 0);

  let { recruitedUserId, selfRecruit } = req.body;

  try {
    if (!Number.isInteger(recruitedUserId)) {
      recruitedUserId = await prisma.users.findFirst({where: {recruit_link: recruitedUserId}}).then((user) => user.id);
    }
    const result = await prisma.$transaction(async (tx) => {
      // Save the recruitment record
      await tx.recruit_history.create({
        data: {
          from_user: recruiterUser ? Number(recruitedUserId) : recruiterUser,
          to_user: recruiterUser ? Number(recruiterUser) : recruitedUserId,
          ip_addr: (
            // Prefer IP address as reported by CloudFlare, if available.
            req.headers['cf-connecting-ip'] ||
            // Fallback to the IP address we received the request from
            req.connection.remoteAddress ||
            // Otherwise, no dice - but fail gracefully.
            'No IP address detected.'
          ) as string,
          timestamp: new Date(),
        },
      });

      // Wait for 1 second
      await new Promise((resolve) => setTimeout(resolve, mtrand(5, 17) * 100));

      // Check the number of recruitments for the recruited user within the last 24 hours
      const recruitments = await prisma.recruit_history.findMany({
        where: {
          from_user: recruiterUser === 0 ? 0 : Number(recruitedUserId),
          to_user: recruiterUser ? Number(session.user.id) : recruitedUserId,
          timestamp: { gte: getOTStartDate() },
          ...(recruiterUser === 0 && { ip_addr: req.headers['cf-connecting-ip'] as string })
        },
      });

      // If the number of recruitments is 5 or more, reject the request and revert the transaction
      if (recruitments.length > 5) {
        throw new Error(`User has already been recruited 5 times in the last 24 hours.`);
      }

      let userToUpdate = await prisma.users.findUnique({
        where: { id: Number(recruiterUser ? Number(session.user.id) : recruitedUserId) },
      });

      if (selfRecruit) {
        userToUpdate = await prisma.users.findUnique({
          where: { id: Number(recruiterUser ? Number(session.user.id) : recruitedUserId) },
        });
      }

      // Update the number of citizens and gold for the user
      const updatedUnits = increaseCitizens(userToUpdate.units as PlayerUnit[]);
      await tx.users.update({
        where: { id: userToUpdate.id },
        data: {
          units: updatedUnits,
          gold: {
            increment: 250,
          },
        },
      });

      await tx.bank_history.create({
        data: {
          from_user_id: 0,
          to_user_id: userToUpdate.id,
          to_user_account_type: 'HAND',
          from_user_account_type: 'BANK',
          date_time: new Date(),
          gold_amount: 250,
          history_type: 'RECRUITMENT',
          
        },
      });

      const reConfirm = await prisma.recruit_history.findMany({
        where: {
          from_user: recruitedUserId ? Number(recruitedUserId) : recruiterUser,
          to_user: recruiterUser ? Number(session.user.id) : recruitedUserId,
          timestamp: { gte: getOTStartDate() },
        },
      });

      // If the number of recruitments is 5 or more, reject the request and revert the transaction
      if (reConfirm.length > 5) {
        throw new Error(`User has already been recruited 5 times in the last 24 hours.`);
      }
      
      return { success: true };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in recruitment:', error);
    if (error.message === 'User has already been recruited 5 times in the last 24 hours.') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withAuth(handler, true);
