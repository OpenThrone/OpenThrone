'use server';

import { getServerSession } from 'next-auth';

import { attackHandler, spyHandler } from '@/app/actions';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { stringifyObj } from '@/utils/numberFormatting';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  const checkParams = (body: any, spiesNeeded: number) => {
    if (!body.type) {
      return false;
    }

    if (!body.spies) {
      return false;
    }

    if (isNaN(body.spies)) {
      return false;
    }

    if (body.spies < 0) {
      return false;
    }

    if (body.spies > spiesNeeded) {
      return false;
    }

    if (body.type === 'assassinate') {
      if (body.unit === undefined) {
        return false;
      }
    }

    return true;
  }

  if (session) {
    switch (req.body.type) {
      case 'INTEL':
        if (req.body.spies <= 0) {
          return res.status(400).json({ status: 'failed' });
        }

        if (req.body.spies > 10) {
          return res.status(400).json({ status: 'failed' });
        }

        const myUser = await prisma?.users.findUnique({
          where: { id: session.user.id },
        });

        if (!myUser) {
          return res.status(400).json({ status: 'failed' });
        }

        if (req.body.spies > myUser.units.find((u) => u.type === 'SPY' && u.level === 1).quantity) {
          return res.status(400).json({ status: 'failed' });
        }

        return res
          .status(200)
          .json(
            stringifyObj(await spyHandler(
              parseInt(session.user.id.toString()),
              parseInt(req.query.id),
              parseInt(req.body.spies),
              req.body.type
            ))
          );
      case 'ASSASSINATE':
        if (checkParams(req.body, 5) === false) {
          return res.status(400).json({ status: 'failed' });
        }

        return res
          .status(200)
          .json(
            await spyHandler(
              parseInt(session.user.id.toString()),
              parseInt(req.query.id),
              parseInt(req.body.spies),
              req.body.type,
              req.body.unit
            )
          );
      case 'infiltrate':
        return res.status(200).json({ status: 'success' });
    }
  }
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'failed' });
}
