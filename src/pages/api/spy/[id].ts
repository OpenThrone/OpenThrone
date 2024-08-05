'use server';
import prisma from "@/lib/prisma";
import { spyHandler } from '@/app/actions';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from "@/middleware/auth";

const handler = async (req, res) => {
  const session = req.session;

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
          return res.status(400).json({ status: 'failed', message: 'You need to send at least 1 spy' });
        }

        if (req.body.spies > 10) {
          return res.status(400).json({ status: 'failed', message: 'You can only send up to 10 spies'});
        }

        const myUser = await prisma?.users.findUnique({
          where: { id: session.user.id },
        });

        if (!myUser) {
          return res.status(400).json({ status: 'failed', message: 'User not found' });
        }

        if (req.body.spies > myUser.units.find((u) => u.type === 'SPY' && u.level === 1).quantity) {
          return res.status(400).json({ status: 'failed', message: 'You do not have enough spies' });
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
          return res.status(400).json({ status: 'failed' , message: 'Invalid parameters' });
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
      case 'INFILTRATE':
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
    }
  }
  console.log('failed: ', session);
  return res.status(401).json({ status: 'failed', message: 'Unauthorized'});
}

export default withAuth(handler);