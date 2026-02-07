import { WarStatus } from '@prisma/client';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

export interface DeclareWarData {
  allianceId: number;
  defenderAllianceId?: number;
  defenderUserId?: number;
  declarerUserId: number;
}

const DeclareWarSchema = z.object({
  allianceId: z.number().int().positive(),
  defenderAllianceId: z.number().int().positive().optional(),
  defenderUserId: z.number().int().positive().optional(),
  declarerUserId: z.number().int().positive(),
}).refine((data) => !!data.defenderAllianceId || !!data.defenderUserId, {
  message: 'Must provide either defenderAllianceId or defenderUserId',
});

export class AllianceWarService {
  /**
   * Declares a war against an alliance or user
   */
  static async declareWar(data: DeclareWarData) {
    const validatedData = DeclareWarSchema.parse(data);

    try {
      // 1. Verify Declarer Permissions
      const declarerMembership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: validatedData.allianceId,
          user_id: validatedData.declarerUserId,
        },
        include: { role: true, alliance: true },
      });

      if (!declarerMembership) {
        throw new Error('You are not a member of the declaring alliance');
      }

      // TODO: Add permission check (e.g., manage_enemies or declare_war permission)
      // For now, assume Leader or Role with manage_enemies can declare
      const canDeclare =
        declarerMembership.alliance.leader_id === validatedData.declarerUserId ||
        declarerMembership.role.permissions?.manage_enemies;

      if (!canDeclare) {
        throw new Error('You do not have permission to declare war');
      }

      // 2. Validate Targets
      if (validatedData.defenderAllianceId) {
        if (validatedData.defenderAllianceId === validatedData.allianceId) {
          throw new Error('Cannot declare war on your own alliance');
        }
        const targetAlliance = await prisma.alliances.findUnique({
          where: { id: validatedData.defenderAllianceId },
        });
        if (!targetAlliance) throw new Error('Target alliance not found');
        
        // Check for existing active war
        const existingWar = await prisma.alliance_wars.findFirst({
            where: {
                attacker_alliance_id: validatedData.allianceId,
                defender_alliance_id: validatedData.defenderAllianceId,
                status: { in: [WarStatus.WARMUP, WarStatus.ACTIVE] }
            }
        });
        if (existingWar) throw new Error('War already declared against this alliance');

      } else if (validatedData.defenderUserId) {
        const targetUser = await prisma.users.findUnique({
          where: { id: validatedData.defenderUserId },
        });
        if (!targetUser) throw new Error('Target user not found');
        
        // Check if user is in declarer's alliance
        // (We can skip this if we want to allow civil wars, but usually not)
         const usersMembership = await prisma.alliance_memberships.count({
            where: {
                alliance_id: validatedData.allianceId,
                user_id: validatedData.defenderUserId
            }
        });
        if (usersMembership > 0) throw new Error('Cannot declare war on a member of your own alliance');
      }

      // 3. Create War Record
      const war = await prisma.alliance_wars.create({
        data: {
          attacker_alliance_id: validatedData.allianceId,
          defender_alliance_id: validatedData.defenderAllianceId,
          defender_user_id: validatedData.defenderUserId,
          declared_by_user_id: validatedData.declarerUserId,
          status: WarStatus.WARMUP,
          start_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // Start in 24 hours (WARMUP)
        },
      });

      return war;
    } catch (error: any) {
      logError('Error declaring war', { ...validatedData, error });
      throw error;
    }
  }

  /**
   * Gets active wars for an alliance
   */
  static async getActiveWars(allianceId: number) {
    try {
      return await prisma.alliance_wars.findMany({
        where: {
          OR: [
            { attacker_alliance_id: allianceId },
            { defender_alliance_id: allianceId },
          ],
          status: { in: [WarStatus.WARMUP, WarStatus.ACTIVE] },
        },
        include: {
          attacker_alliance: { select: { name: true } },
          defender_alliance: { select: { name: true } },
          defender_user: { select: { display_name: true } },
        },
      });
    } catch (error: any) {
      logError('Error getting active wars', { allianceId, error });
      throw error;
    }
  }
}
