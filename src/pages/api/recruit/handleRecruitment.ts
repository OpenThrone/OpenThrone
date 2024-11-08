import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { PlayerUnit } from '@/types/typings';
import mtrand from '@/utils/mtrand';
import { getOTStartDate } from '@/utils/timefunctions';
import { endSession, getSession, validateSession } from '@/services/sessions.service';

function increaseCitizens(units: PlayerUnit[]) {
  const citizen = units.find((unit) => unit.type === 'CITIZEN');
  if (citizen) {
    citizen.quantity += 1;
  } else {
    units.push({ type: 'CITIZEN', level: 1, quantity: 1 });
  }
  return units;
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const session = req.session;
  const recruiterUserId = session ? session.user.id : 0;
  let { recruitedUserId, selfRecruit, sessionId } = req.body;

  try {
    if (!Number.isInteger(recruitedUserId)) {
      const recruitedUser = await prisma.users.findFirst({
        where: { recruit_link: recruitedUserId },
      });
      recruitedUserId = recruitedUser?.id || 0;
    }

    // Differentiate between manual and auto-clicker sessions
    if (sessionId) {
      // Validate the session ID for auto-clicker recruitment
      const activeSessions = await validateSession(recruiterUserId, sessionId);

      if (!activeSessions) {
        return res.status(429).json({ error: 'Invalid session ID' });
      }

      const sessionData = await getSession(recruiterUserId, sessionId);

      if (sessionData.lastActivityAt < new Date(Date.now() - 60000)) {
        await endSession(recruiterUserId, sessionId);
        return res.status(429).json({ error: 'Session expired' });
      }
    } else {
      // If sessionId is not provided, treat it as a manual recruitment
      sessionId = null; // Explicitly set sessionId to null for manual
    }

    const result = await prisma.$transaction(async (tx) => {
      const fromUser = recruiterUserId ? recruitedUserId : recruiterUserId;
      const toUser = recruiterUserId ? recruiterUserId : recruitedUserId;

      // Save the recruitment record
      await tx.recruit_history.create({
        data: {
          from_user: fromUser,
          to_user: toUser,
          ip_addr:
            // Prefer IP address as reported by CloudFlare, if available.
            (req.headers['cf-connecting-ip'] as string) ||
            // Fallback to the IP address we received the request from
            req.connection.remoteAddress ||
            // Otherwise, no dice - but fail gracefully.
            'No IP address detected.',
          timestamp: new Date(),
        },
      });

      // Wait for a random delay
      await new Promise((resolve) => setTimeout(resolve, mtrand(5, 17) * 100));

      // Check recruitments within the last 24 hours
      const recruitments = await tx.recruit_history.findMany({
        where: {
          from_user: fromUser,
          to_user: toUser,
          timestamp: { gte: getOTStartDate() },
          ...(recruiterUserId === 0 && {
            ip_addr: req.headers['cf-connecting-ip'] as string,
          }),
        },
      });

      if (recruitments.length > 2) {
        throw new Error('User has already been recruited 5 times in the last 24 hours.');
      }

      let userToUpdate = await tx.users.findUnique({
        where: { id: Number(toUser) },
      });

      if (selfRecruit) {
        userToUpdate = await tx.users.findUnique({
          where: { id: Number(recruitedUserId) },
        });
      }

      // Update the number of citizens and gold for the user
      const updatedUnits = increaseCitizens(userToUpdate.units as PlayerUnit[]);
      await tx.users.update({
        where: { id: userToUpdate.id },
        data: {
          units: updatedUnits,
          gold: { increment: 250 },
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

      // Recheck recruitments to confirm no violations
      const reConfirm = await tx.recruit_history.count({
        where: {
          OR: [
            {
              AND: [
                { to_user: toUser },
                { from_user: { not: 0 } }, // Exclude from_user = 0
                { from_user: fromUser },
                { timestamp: { gte: getOTStartDate() } },
              ],
            },
            {
              AND: [
                { to_user: toUser },
                { ip_addr: req.headers['x-real-ip'] as string },
                { timestamp: { gte: getOTStartDate() } },
              ],
            },
          ],
        },
      });

      if (reConfirm > 5) {
        throw new Error('User has already been recruited 5 times in the last 24 hours.');
      }

      return { success: true };
    }, { timeout: 15000, maxWait: 5000 });

    return res.status(200).json(result);
  } catch (error) {
    console.log('Error in recruitment:', error.message, "IPAddr: " + req.headers['cf-connecting-ip'] as string, 'PlayerID: ' + recruitedUserId, 'RecruiterID: ' + recruiterUserId);
    const statusCode = error.message.includes('recruited 5 times')
      ? 400
      : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};

export default withAuth(handler, true);