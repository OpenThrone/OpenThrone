'use server';
import prisma from "@/lib/prisma";
import { spyHandler } from '@/app/actions';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from "@/middleware/auth";
import UserModel from "@/models/Users";
import { AuthenticatedRequest } from "@/types/api";
import type { NextApiResponse } from 'next';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
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
    const myUser = await prisma?.users.findUnique({
      where: { id: session.user.id },
    });
    if (!myUser) {
      return res.status(400).json({ status: 'failed', message: 'User not found' });
    }

    const uModel = new UserModel(myUser);

    switch (req.body.type) {
      case 'INTEL':
        if (req.body.spies <= 0) {
          return res.status(400).json({ status: 'failed', message: 'You need to send at least 1 spy' });
        }

        if (req.body.spies > 10) {
          return res.status(400).json({ status: 'failed', message: 'You can only send up to 10 spies'});
        }

        if (req.body.spies > uModel.units.find((u) => u.type === 'SPY' && u.level === 1).quantity) {
          return res.status(400).json({ status: 'failed', message: 'You do not have enough spies' });
        }

        return res
          .status(200)
          .json(
            stringifyObj(await spyHandler(
              parseInt(session.user.id),
              parseInt(req.query.id.toString()),
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
            stringifyObj(await spyHandler(
              parseInt(session.user.id),
              parseInt(req.query.id.toString()),
              parseInt(req.body.spies),
              req.body.type,
              req.body.unit
            ))
          );
      case 'INFILTRATE':
        const spyLog = await prisma.attack_log.count({
          where: {
            attacker_id: parseInt(session.user.id),
            type: 'INFILTRATE',
            defender_id: parseInt(req.query.id.toString()),
            timestamp: {
              gte: new Date(new Date().getTime() - 86400000), //gte 24 hours ago
            },
          },
        })
        if (spyLog >= uModel.spyLimits.infil.perUser || spyLog >= uModel.spyLimits.infil.perDay) {
          return res.status(400).json({ status: 'failed', message: 'You have infiltrated too many times today' });
        }
        if (req.body.spies <= 0) {
          return res.status(400).json({ status: 'failed', message: 'You need to send at least 1 infiltrator' });
        }
        if (req.body.spies > uModel.spyLimits.infil.perMission) {
          return res.status(400).json({ status: 'failed', message: `You can only send up to ${uModel.spyLimits.infil.perMission} infiltrators per mission` });
        }
        if (req.body.spies > myUser.units.find((u) => u.type === 'SPY' && u.level === 2).quantity) {
          return res.status(400).json({ status: 'failed', message: 'You do not have enough infiltrators' });
        }
        return res
          .status(200)
          .json(
            stringifyObj(await spyHandler(
              parseInt(session.user.id),
              parseInt(req.query.id.toString()),
              parseInt(req.body.spies),
              req.body.type,
              req.body.unit
            ))
          );
    }
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized'});
}

export default withAuth(handler);