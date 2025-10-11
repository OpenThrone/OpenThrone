import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { withAuth } from '@/middleware/auth';
import mtrand from '@/utils/mtrand';
import { endSession, getSession, validateSession } from '@/services/sessions.service';
import { increaseCitizens } from '@/services/recruitment.service';
import { getIpAddress } from '@/utils/ipUtils';
import { getOTStartDate } from '@/utils/timefunctions';
import { logAction } from '@/utils/auditLogger';

import { RecruitSchema } from '@/lib/validation';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '@/types/api';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const session = req.session;
  const recruiterUserId = session ? session.user.id : 0;

  let recruitedUserId: number | string = 0;
  let selfRecruit: boolean = false;
  let sessionId: string | null = null;

  try {
    const data = RecruitSchema.parse(req.body);
    recruitedUserId = data.recruitedUserId || 0;
    selfRecruit = data.selfRecruit || false;
    const sessionIdStr = data.sessionId || null;
    let sessionIdNum: number | null = sessionIdStr ? parseInt(sessionIdStr, 10) : null;

    if (typeof recruitedUserId === 'string' && !Number.isInteger(Number(recruitedUserId))) {
      const recruitedUser = await prisma.users.findFirst({
        where: { recruit_link: recruitedUserId },
      });
      recruitedUserId = recruitedUser?.id || 0;
    }

    // Session validation will be moved inside transaction for atomicity
    if (!sessionIdNum) {
      sessionIdNum = null; // Explicitly set sessionId to null for manual
    }

    const ipAddress = getIpAddress(req);
    const fromUser = recruiterUserId ? Number(recruitedUserId) : recruiterUserId;
    const toUser = recruiterUserId ? recruiterUserId : Number(recruitedUserId);
    const userIdToLock = selfRecruit ? Number(recruitedUserId) : Number(toUser);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock the user being updated using SELECT ... FOR UPDATE because
      // Prisma's query helpers don't support a `lock` option on findUnique.
      // This will return the row and acquire a row-level lock for the duration
      // of the transaction.
      const lockedRows: Array<{ id: number; units: string | null; gold: bigint | null }> = await tx.$queryRaw`
        SELECT id, units, gold
        FROM users
        WHERE id = ${userIdToLock}
        FOR UPDATE
      ` as any;
      const lockedUser = lockedRows[0];
      if (!lockedUser) {
        throw new Error('User not found');
      }

      // Validate session inside transaction if present
      if (sessionIdNum) {
        const sessionData = await tx.autoRecruitSession.findUnique({
          where: { id: sessionIdNum, userId: recruiterUserId },
        });

        if (!sessionData) {
          throw new Error('Invalid session ID');
        }

        if (sessionData.lastActivityAt < new Date(Date.now() - 60000)) { // 1 minute
          await tx.autoRecruitSession.deleteMany({
            where: { id: sessionIdNum, userId: recruiterUserId },
          });
          throw new Error('Session expired');
        }
      }

      // Check recruitment limit inside transaction
      const recruitmentCount = await tx.recruit_history.count({
        where: {
          from_user: fromUser,
          to_user: toUser,
          timestamp: { gte: getOTStartDate() },
          ...(fromUser === 0 && { ip_addr: ipAddress }),
        },
      });

      if (recruitmentCount >= 5) {
        throw new Error('User has already been recruited 5 times in the last 24 hours.');
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

      // Wait for a random delay
      await new Promise((resolve) => setTimeout(resolve, mtrand(5, 17) * 100));

      // Update units and gold
      // `lockedUser.units` may be stored as a JSON string or already as an object depending
      // on how the DB/ORM returns it. Handle both cases safely.
      let units: any;
      if (typeof lockedUser.units === 'string') {
        try {
          units = JSON.parse(lockedUser.units as string);
        } catch (e) {
          throw new Error('JSON Parse error: Invalid units format');
        }
      } else {
        units = lockedUser.units as any;
      }
      const updatedUnits = increaseCitizens(units);
      await tx.users.update({
        where: { id: userIdToLock },
        data: {
          units: updatedUnits,
          gold: { increment: 250 },
        },
      });

      // Create bank history record
      await tx.bank_history.create({
        data: {
          from_user_id: 0,
          to_user_id: userIdToLock,
          to_user_account_type: 'HAND',
          from_user_account_type: 'BANK',
          date_time: new Date(),
          gold_amount: BigInt(250),
          history_type: 'RECRUITMENT',
        },
      });

      // Update session last activity if present
      if (sessionIdNum) {
        await tx.autoRecruitSession.update({
          where: { id: sessionIdNum },
          data: { lastActivityAt: new Date() },
        });
      }

      return { success: true };
    }, { timeout: 15000, maxWait: 5000 });

    const ip = getIpAddress(req);
    await logAction(recruiterUserId || toUser, 'RECRUIT', ip, { recruitedUserId, selfRecruit });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.format() });
    }
    console.log('Error in recruitment:', error.message, "IPAddr: " + getIpAddress(req), 'PlayerID: ' + recruitedUserId, 'RecruiterID: ' + recruiterUserId);
    const statusCode = error.message.includes('recruited 5 times') || error.message.includes('Session')
      ? 409
      : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};

export default withAuth(handler, true);