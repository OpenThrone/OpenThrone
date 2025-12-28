'use server';
import prisma from "@/lib/prisma";
import SpyService from '@/services/SpyService';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from "@/middleware/auth";
import UserModel from "@/models/Users";
import { AuthenticatedRequest } from "@/types/api";
import type { NextApiResponse } from 'next';
import { getSocketIO } from '@/lib/socket';
import { CITIZEN_WORKERS_TARGET } from '@/utils/spy/results';
import md5 from 'md5';
import { z } from 'zod';
import type { UnitType } from '@/types/typings';

const UNIT_TYPE_VALUES = [
  'CITIZEN',
  'WORKER',
  'OFFENSE',
  'DEFENSE',
  'SPY',
  'SENTRY',
] as const satisfies readonly UnitType[];

const SpyQuerySchema = z.object({
  id: z.coerce.number().int(),
});

const SpyBodySchema = z.object({
  type: z.enum(['INTEL', 'ASSASSINATE', 'INFILTRATE']),
  spies: z.number().int(),
  unit: z.union([z.enum(UNIT_TYPE_VALUES), z.literal(CITIZEN_WORKERS_TARGET)]).optional(),
});

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const session = req.session;

  const validatedQuery = SpyQuerySchema.safeParse(req.query);
  if (!validatedQuery.success) {
    return res.status(400).json({ status: 'failed', message: 'Invalid query parameters', details: validatedQuery.error.flatten().fieldErrors });
  }

  const validatedBody = SpyBodySchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({ status: 'failed', message: 'Invalid request body', details: validatedBody.error.flatten().fieldErrors });
  }

  const { id } = validatedQuery.data;
  const { type, spies, unit } = validatedBody.data;

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

    const attackerId = parseInt(session.user.id);
    const defenderId = id;

    const notifySpyDefenseWin = async (attackLogId: number, missionType: string) => {
      const log = await prisma.attack_log.findUnique({
        where: { id: attackLogId },
        select: { winner: true },
      });

      if (log?.winner !== defenderId) return;

      const message = `You successfully defended against a spy mission (${missionType}).`;
      const hash = md5(message + defenderId + attackLogId);
      getSocketIO()
        ?.to(`user-${defenderId}`)
        .emit('spyDefenseNotification', { message, hash, attackLogId, missionType });
    };

    switch (type) {
      case 'INTEL':
        if (spies <= 0) {
          return res.status(400).json({ status: 'failed', message: 'You need to send at least 1 spy' });
        }

        if (spies > 10) {
          return res.status(400).json({ status: 'failed', message: 'You can only send up to 10 spies'});
        }

        if (spies > uModel.units.find((u) => u.type === 'SPY' && u.level === 1).quantity) {
          return res.status(400).json({ status: 'failed', message: 'You do not have enough spies' });
        }

        {
          const result = stringifyObj(
            await SpyService.executeSpyMission(
              attackerId,
              defenderId,
              spies,
              type,
            ),
          );
          if (result?.status === 'success' && result.attack_log) {
            await notifySpyDefenseWin(Number(result.attack_log), 'INTEL');
          }
          return res.status(200).json(result);
        }
      case 'ASSASSINATE':
        if (checkParams(req.body, 5) === false) {
          return res.status(400).json({ status: 'failed' , message: 'Invalid parameters' });
        }

        {
          const result = stringifyObj(
            await SpyService.executeSpyMission(
              attackerId,
              defenderId,
              spies,
              type,
              unit,
            ),
          );
          if (result?.status === 'success' && result.attack_log) {
            await notifySpyDefenseWin(Number(result.attack_log), 'ASSASSINATE');
          }
          return res.status(200).json(result);
        }
      case 'INFILTRATE':
        const spyLog = await prisma.attack_log.count({
          where: {
            attacker_id: attackerId,
            type: 'INFILTRATE',
            defender_id: defenderId,
            timestamp: {
              gte: new Date(new Date().getTime() - 86400000), //gte 24 hours ago
            },
          },
        })
        if (spyLog >= uModel.spyLimits.infil.perUser || spyLog >= uModel.spyLimits.infil.perDay) {
          return res.status(400).json({ status: 'failed', message: 'You have infiltrated too many times today' });
        }
        if (spies <= 0) {
          return res.status(400).json({ status: 'failed', message: 'You need to send at least 1 infiltrator' });
        }
        if (spies > uModel.spyLimits.infil.perMission) {
          return res.status(400).json({ status: 'failed', message: `You can only send up to ${uModel.spyLimits.infil.perMission} infiltrators per mission` });
        }
        if (spies > myUser.units.find((u) => u.type === 'SPY' && u.level === 2).quantity) {
          return res.status(400).json({ status: 'failed', message: 'You do not have enough infiltrators' });
        }
        {
          const result = stringifyObj(
            await SpyService.executeSpyMission(
              attackerId,
              defenderId,
              spies,
              type,
              unit,
            ),
          );
          if (result?.status === 'success' && result.attack_log) {
            await notifySpyDefenseWin(Number(result.attack_log), 'INFILTRATE');
          }
          return res.status(200).json(result);
        }
    }
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized'});
}

export default withAuth(handler);
