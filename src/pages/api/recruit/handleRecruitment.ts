import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { PlayerUnit } from '@/types/typings';
import mtrand from '@/utils/mtrand';

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
    const result = await prisma.$transaction(async (prisma) => {
      // Save the recruitment record
      await prisma.recruit_history.create({
        data: {
          from_user: recruiterUser ? Number(recruitedUserId) : recruiterUser,
          to_user: recruiterUser ? Number(recruiterUser) : recruitedUserId,
          ip_addr: req.headers['cf-connecting-ip'] as string,
          timestamp: new Date(),
        },
      });

      // Wait for 1 second
      await new Promise((resolve) => setTimeout(resolve, mtrand(5, 17) * 100));

      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Check the number of recruitments for the recruited user within the last 24 hours
      const recruitments = await prisma.recruit_history.findMany({
        where: {
          from_user: recruiterUser === 0 ? 0 : Number(recruitedUserId),
          to_user: recruiterUser ? Number(session.user.id) : recruitedUserId,
          timestamp: { gte: midnight },
          ...(recruiterUser === 0 && { ip_addr: req.headers['cf-connecting-ip'] as string })
        },
      });

      console.log('recruiterUser', recruiterUser);
      (recruiterUser === 0 && console.log('recruitments', {
        from_user: recruiterUser === 0 ? 0 : Number(recruitedUserId),
        to_user: recruiterUser ? Number(session.user.id) : recruitedUserId,
        timestamp: { gte: midnight },
        ...(recruiterUser === 0 && { ip_addr: req.headers['cf-connecting-ip'] as string })
      }));

      // If the number of recruitments is 5 or more, reject the request and revert the transaction
      if (recruitments.length > 5) {
        throw new Error(`User has already been recruited 5 times in the last 24 hours.`);
      }

      let userToUpdate = await prisma.users.findUnique({
        where: { id: Number(recruiterUser) },
      });

      if (selfRecruit) {
        userToUpdate = await prisma.users.findUnique({
          where: { id: Number(recruiterUser) },
        });
      }

      // Update the number of citizens and gold for the user
      const updatedUnits = increaseCitizens(userToUpdate.units as PlayerUnit[]);
      await prisma.users.update({
        where: { id: userToUpdate.id },
        data: {
          units: updatedUnits,
          gold: {
            increment: 250,
          },
        },
      });

      const reConfirm = await prisma.recruit_history.findMany({
        where: {
          from_user: recruitedUserId ? Number(recruitedUserId) : recruiterUser,
          to_user: recruiterUser ? Number(session.user.id) : recruitedUserId,
          timestamp: { gte: midnight },
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
