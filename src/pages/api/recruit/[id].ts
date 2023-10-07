import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';

import prisma from '@/lib/prisma';

import { authOptions } from '../auth/[...nextauth]';

function increaseCitizens(units) {
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  let recruiterID = 0;
  const session = await getServerSession(req, res, authOptions);
  if (session) {
    recruiterID = session.player?.id;
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
    // Check if the user has clicked on this link in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const history = await prisma.recruit_history.count({
      where: {
        OR: [
          {
            AND: [
              { to_user: Number(recruitedUser.id) },
              { from_user: { not: 0 } }, // Exclude from_user = 0
              { from_user: Number(recruiterID) },
              { timestamp: { gte: twentyFourHoursAgo } },
            ],
          },
          {
            AND: [
              { to_user: Number(recruitedUser.id) },
              { ip_addr: req.headers['x-real-ip'] as string },
              { timestamp: { gte: twentyFourHoursAgo } },
            ],
          },
        ],
      },
    });

    if (history >= 5) {
      return res
        .status(400)
        .json({ error: 'You can only Recruit up to 5x in 24 hours.' });
    }
    const toUserHistory = await prisma.recruit_history.count({
      where: {
        to_user: Number(recruitedUser.id),
        timestamp: { gte: twentyFourHoursAgo },
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
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const history = await prisma.recruit_history.count({
      where: {
        OR: [
          {
            AND: [
              { to_user: Number(recruitedUser.id) },
              { from_user: { not: 0 } }, // Exclude from_user = 0
              { from_user: Number(recruiterID) },
              { timestamp: { gte: twentyFourHoursAgo } },
            ],
          },
          {
            AND: [
              { to_user: Number(recruitedUser.id) },
              { ip_addr: req.headers['x-real-ip'] as string },
              { timestamp: { gte: twentyFourHoursAgo } },
            ],
          },
        ],
      },
    });

    if (history >= 5) {
      return res
        .status(400)
        .json({ error: 'You can only Recruit up to 5x in 24 hours.' });
    }
    console.log({
      from_user: Number(recruiterID),
      to_user: Number(recruitedUser.id),
      ip_addr: req.headers['cf-connecting-ip'] as string,
      timestamp: new Date(),
    });
    const newRecord = await prisma.recruit_history.create({
      data: {
        from_user: Number(recruiterID),
        to_user: Number(recruitedUser.id),
        ip_addr: req.headers['cf-connecting-ip'] as string,
        timestamp: new Date(),
      },
    });
    const selfRecruit = req.body.self_recruit === '1' || req.body.self_recruit === true;

    if (newRecord) {
      let userToUpdate = selfRecruit ? session.player : recruitedUser;
      // First increase the number of citizens for the appropriate user
      const updatedUnits = increaseCitizens(userToUpdate.units);
      // Now update in the database
      await prisma.users.update({
        where: { id: userToUpdate.id },
        data: {
          units: updatedUnits,
          gold: {
            increment: 250,
          },
        },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' }); // Send a proper response
}
