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
    const history = await prisma.recruit_history.findFirst({
      where: {
        to_user: Number(recruitedUser.id),
        from_user: Number(recruiterID),
        ip_addr: req.headers['x-real-ip'] as string,
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        },
      },
    });

    if (history) {
      return res
        .status(400)
        .json({ error: 'You can only Recruit once in 24 hours.' });
    }
    return res.status(200).json({ showCaptcha: true });
  }
  if (req.method === 'POST') {
    const newRecord = await prisma.recruit_history.create({
      data: {
        from_user: Number(recruiterID),
        to_user: Number(recruitedUser.id),
        ip_addr: req.headers['cf-connecting-ip'] as string,
        timestamp: new Date(),
      },
    });
    if (newRecord) {
      // First increase the number of citizens
      const updatedUnits = increaseCitizens(recruitedUser.units);
      // Now update in the database
      await prisma.users.update({
        where: { id: recruitedUser.id },
        data: {
          units: updatedUnits,
        },
      });
    } else {
      console.log(newRecord);
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).end(); // Method not allowed
}
