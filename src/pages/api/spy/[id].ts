'use server';

import md5 from 'md5';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { getSocketIO } from '@/lib/socket';
import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import UserModel from '@/models/Users';
import { SpyService } from '@/services/SpyService';
import type { AuthenticatedRequest } from '@/types/api';
import type { UnitType } from '@/types/typings';
import { stringifyObj } from '@/utils/numberFormatting';
import { CITIZEN_WORKERS_TARGET } from '@/utils/spy/results';

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
  spies: z.number().int().positive(),
  turns: z.number().int().positive().optional(),
  unit: z
    .union([z.enum(UNIT_TYPE_VALUES), z.literal(CITIZEN_WORKERS_TARGET)])
    .optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'spy',
  querySchema: SpyQuerySchema,
  bodySchema: SpyBodySchema,
});

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof SpyQuerySchema>;
    body: z.infer<typeof SpyBodySchema>;
  },
) => {
  const { id } = context.query;
  const { type, spies, turns, unit } = context.body;

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

    if (body.type === 'ASSASSINATE') {
      if (body.unit === undefined) {
        return false;
      }
    }

    return true;
  };

  const sessionUserId = Number(req.session?.user?.id);
  const myUser = await prisma?.users.findUnique({
    where: { id: sessionUserId },
    include: {
      UserUnit: true,
      UserItem: true,
      UserStructureUpgrade: true,
      UserBattleUpgrade: true,
      UserBonusPoints: true,
      permissions: true,
    },
  });
  if (!myUser) {
    return res
      .status(400)
      .json({ status: 'failed', message: 'User not found' });
  }

  const uModel = new UserModel(myUser);

  const attackerId = sessionUserId;
  const defenderId = id;
  const canProceed = await enforceIdempotency(req, res, {
    scope: `spy:${type}:${defenderId}`,
    actorKey: String(attackerId),
  });
  if (!canProceed) {
    return;
  }

  const notifySpyDefenseWin = async (
    attackLogId: number,
    missionType: string,
  ) => {
    const log = await prisma.attack_log.findUnique({
      where: { id: attackLogId },
      select: { winner: true },
    });

    if (log?.winner !== defenderId) return;

    const message = `You successfully defended against a spy mission (${missionType}).`;
    const hash = md5(message + defenderId + attackLogId);
    getSocketIO()?.to(`user-${defenderId}`).emit('spyDefenseNotification', {
      message,
      hash,
      attackLogId,
      missionType,
    });
  };

  switch (type) {
    case 'INTEL':
      if (spies <= 0) {
        return res.status(400).json({
          status: 'failed',
          message: 'You need to send at least 1 spy',
        });
      }

      if (spies > 10) {
        return res.status(400).json({
          status: 'failed',
          message: 'You can only send up to 10 spies',
        });
      }

      if (
        spies >
        (uModel.units.find((u) => u.type === 'SPY' && u.level === 1)
          ?.quantity ?? 0)
      ) {
        return res.status(400).json({
          status: 'failed',
          message: 'You do not have enough spies',
        });
      }

      {
        const result = stringifyObj(
          await SpyService.executeSpyMission(
            attackerId,
            defenderId,
            spies,
            type,
            undefined,
            turns,
          ),
        );
        if (result?.status === 'success' && result.attack_log) {
          await notifySpyDefenseWin(Number(result.attack_log), 'INTEL');
        }
        return res.status(200).json(result);
      }
    case 'ASSASSINATE':
      if (
        checkParams(context.body, uModel.spyLimits.assass.perMission) === false
      ) {
        return res
          .status(400)
          .json({ status: 'failed', message: 'Invalid parameters' });
      }

      {
        const result = stringifyObj(
          await SpyService.executeSpyMission(
            attackerId,
            defenderId,
            spies,
            type,
            unit,
            turns,
          ),
        );
        if (result?.status === 'success' && result.attack_log) {
          await notifySpyDefenseWin(Number(result.attack_log), 'ASSASSINATE');
        }
        return res.status(200).json(result);
      }
    case 'INFILTRATE':
      if (spies <= 0) {
        return res.status(400).json({
          status: 'failed',
          message: 'You need to send at least 1 infiltrator',
        });
      }
      if (spies > uModel.spyLimits.infil.perMission) {
        return res.status(400).json({
          status: 'failed',
          message: `You can only send up to ${uModel.spyLimits.infil.perMission} infiltrators per mission`,
        });
      }
      if (
        spies >
        (uModel.units.find((u) => u.type === 'SPY' && u.level === 2)
          ?.quantity ?? 0)
      ) {
        return res.status(400).json({
          status: 'failed',
          message: 'You do not have enough infiltrators',
        });
      }
      {
        const result = stringifyObj(
          await SpyService.executeSpyMission(
            attackerId,
            defenderId,
            spies,
            type,
            unit,
            turns,
          ),
        );
        if (result?.status === 'success' && result.attack_log) {
          await notifySpyDefenseWin(Number(result.attack_log), 'INFILTRATE');
        }
        return res.status(200).json(result);
      }
  }
};

export default guardedHandler(handler);
